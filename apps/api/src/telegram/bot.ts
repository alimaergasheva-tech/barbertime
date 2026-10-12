import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { PrismaClient } from "@barbershop/db";
import { cancelBooking, getBooking, listTelegramUserBookings } from "../booking/bookings";
import { loadSettings } from "../booking/settings";
import { HttpError } from "../errors";
import { isOwnBooking, linkBarberByCode, linkClientByBookingToken } from "./linking";
import { COMMENT_PROMPT, saveComment, saveRating } from "./reviews";
import { bookingKeyboard, clientMessages, escapeHtml, HELP_TEXT, publicUrl, type BookingView, type Links } from "./messages";
import type { Log, Notifier } from "./notifier";

export const BUTTON_BOOK = "Записаться";
export const BUTTON_MY = "Мои записи";
export const BUTTON_HELP = "Помощь";

const MAX_LISTED = 5;
const TOKEN = "([\\w-]{20,128})";

type BookingDto = Awaited<ReturnType<typeof getBooking>>;

const toView = (booking: BookingDto): BookingView => ({
  token: booking.token,
  startsAt: booking.startsAt,
  totalPrice: booking.totalPrice,
  barberName: booking.barber.name,
  serviceNames: booking.services.map((s) => s.name),
});

const HTML = { parse_mode: "HTML" } as const;

export type BotOptions = {
  token: string;
  prisma: PrismaClient;
  notifier: Notifier;
  links: Links;
  log: Log;
  /** Skips getMe on start-up (tests). */
  botInfo?: UserFromGetMe;
};

export function createBot({ token, prisma, notifier, links, log, botInfo }: BotOptions) {
  const bot = new Bot(token, { botInfo });
  const miniAppUrl = publicUrl(links.miniAppUrl);
  const siteUrl = publicUrl(links.appUrl);

  function mainMenu() {
    const keyboard = new Keyboard();
    if (miniAppUrl) keyboard.webApp(BUTTON_BOOK, miniAppUrl);
    else keyboard.text(BUTTON_BOOK);
    return keyboard.text(BUTTON_MY).row().text(BUTTON_HELP).resized().persistent();
  }

  async function timezone() {
    return (await loadSettings(prisma)).timezone;
  }

  async function sendMyBookings(ctx: Context) {
    const { upcoming } = await listTelegramUserBookings(prisma, ctx.from!.id);
    if (upcoming.length === 0) {
      await ctx.reply("Активных записей нет. Нажмите «Записаться», чтобы выбрать время.", { reply_markup: mainMenu() });
      return;
    }
    const tz = await timezone();
    for (const booking of upcoming.slice(0, MAX_LISTED)) {
      const view = toView(booking);
      const keyboard = booking.canChange ? bookingKeyboard(view, links, { withCancel: true }) : undefined;
      const note = booking.canChange ? "" : `\n\nИзменить запись можно не позднее чем за ${booking.cancelCutoffMin} мин до начала.`;
      await ctx.reply(clientMessages.upcoming(view, tz) + note, { ...HTML, reply_markup: keyboard });
    }
  }

  async function sendBookOptions(ctx: Context) {
    if (siteUrl) {
      await ctx.reply("Выберите услугу, мастера и время на сайте:", {
        reply_markup: new InlineKeyboard().url("Открыть запись", `${siteUrl}/book`),
      });
    } else {
      await ctx.reply("Онлайн-запись скоро будет доступна прямо здесь.");
    }
  }

  const privateChat = bot.chatType("private");

  privateChat.command("start", async (ctx) => {
    const payload = ctx.match;
    const tz = await timezone();

    const client = /^b_([\w-]{20,128})$/.exec(payload);
    if (client) {
      const token = client[1];
      if (!(await linkClientByBookingToken(prisma, token, ctx.from.id))) {
        await ctx.reply("Ссылка устарела или запись не найдена.", { reply_markup: mainMenu() });
        return;
      }
      const booking = await getBooking(prisma, token);
      await ctx.reply("Готово! Главное меню — внизу экрана.", { reply_markup: mainMenu() });
      await ctx.reply(clientMessages.linked(toView(booking), tz), {
        ...HTML,
        reply_markup: booking.canChange ? bookingKeyboard(toView(booking), links, { withCancel: true }) : undefined,
      });
      return;
    }

    const barber = /^barber_([\w-]{16,64})$/.exec(payload);
    if (barber) {
      const linked = await linkBarberByCode(prisma, barber[1], ctx.chat.id);
      await ctx.reply(
        linked
          ? `Готово, ${escapeHtml(linked.name)}! Уведомления о новых записях, переносах и отменах будут приходить в этот чат.`
          : "Ссылка недействительна или истекла. Попросите администратора выдать новую.",
        HTML,
      );
      return;
    }

    const name = escapeHtml(ctx.from.first_name);
    await ctx.reply(`Здравствуйте, ${name}!\n\n${HELP_TEXT}`, { ...HTML, reply_markup: mainMenu() });
  });

  privateChat.command("my", sendMyBookings);
  privateChat.hears(BUTTON_MY, sendMyBookings);
  privateChat.command("book", sendBookOptions);
  privateChat.hears(BUTTON_BOOK, sendBookOptions);
  privateChat.command("help", (ctx) => ctx.reply(HELP_TEXT, { reply_markup: mainMenu() }));
  privateChat.hears(BUTTON_HELP, (ctx) => ctx.reply(HELP_TEXT, { reply_markup: mainMenu() }));

  bot.callbackQuery(new RegExp(`^cancel:${TOKEN}$`), async (ctx) => {
    const token = ctx.match[1];
    if (!(await isOwnBooking(prisma, token, ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: "Запись не найдена" });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: new InlineKeyboard().text("Да, отменить", `cancel!:${token}`).text("Нет", `keep:${token}`),
    });
  });

  bot.callbackQuery(new RegExp(`^keep:${TOKEN}$`), async (ctx) => {
    const token = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (!(await isOwnBooking(prisma, token, ctx.from.id))) return;
    const booking = await getBooking(prisma, token);
    await ctx.editMessageReplyMarkup({
      reply_markup: booking.canChange ? bookingKeyboard(toView(booking), links, { withCancel: true }) : undefined,
    });
  });

  bot.callbackQuery(new RegExp(`^cancel!:${TOKEN}$`), async (ctx) => {
    const token = ctx.match[1];
    if (!(await isOwnBooking(prisma, token, ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: "Запись не найдена" });
      return;
    }
    try {
      const booking = await cancelBooking(prisma, token);
      await ctx.answerCallbackQuery({ text: "Запись отменена" });
      await ctx.editMessageText(clientMessages.cancelled(toView(booking), await timezone()), HTML);
      notifier.notify({ type: "cancelled", token, skipClient: true });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      const text = error.code === "TOO_LATE" ? "Слишком поздно — до начала меньше допустимого времени" : "Запись уже неактивна";
      await ctx.answerCallbackQuery({ text, show_alert: true });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    }
  });

  bot.callbackQuery(/^rate:([0-9a-f-]{36}):([1-5])$/, async (ctx) => {
    const rating = Number(ctx.match[2]);
    const outcome = await saveRating(prisma, ctx.match[1], ctx.from.id, rating);
    if (outcome !== "saved") {
      await ctx.answerCallbackQuery({ text: outcome === "duplicate" ? "Оценка уже сохранена" : "Запись не найдена" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      return;
    }
    await ctx.answerCallbackQuery({ text: "Спасибо!" });
    await ctx.editMessageText(`Ваша оценка: ${"★".repeat(rating)}${"☆".repeat(5 - rating)}\nСпасибо!`);
    await ctx.reply(COMMENT_PROMPT, {
      reply_markup: { force_reply: true, input_field_placeholder: "Пара слов о визите" },
    });
  });

  privateChat.on("message:text", async (ctx, next) => {
    const prompt = ctx.message.reply_to_message;
    if (prompt?.from?.id !== ctx.me.id || prompt.text !== COMMENT_PROMPT) return next();
    const saved = await saveComment(prisma, ctx.from.id, ctx.message.text);
    await ctx.reply(saved ? "Спасибо! Отзыв сохранён." : "Не нашли визит для отзыва.", { reply_markup: mainMenu() });
  });

  privateChat.on("message", (ctx) => ctx.reply(HELP_TEXT, { reply_markup: mainMenu() }));

  bot.catch(({ error, ctx }) => log.error({ err: error, update: ctx.update.update_id }, "Telegram bot error"));

  return bot;
}

export type BarberTimeBot = ReturnType<typeof createBot>;

/** Commands shown in the Telegram menu and the chat menu button. */
export async function configureBotProfile(bot: BarberTimeBot, links: Links) {
  await bot.api.setMyCommands([
    { command: "start", description: "Главное меню" },
    { command: "my", description: "Мои записи" },
    { command: "book", description: "Записаться" },
    { command: "help", description: "Помощь" },
  ]);
  const miniAppUrl = publicUrl(links.miniAppUrl);
  await bot.api.setChatMenuButton({
    menu_button: miniAppUrl ? { type: "web_app", text: BUTTON_BOOK, web_app: { url: miniAppUrl } } : { type: "commands" },
  });
}
