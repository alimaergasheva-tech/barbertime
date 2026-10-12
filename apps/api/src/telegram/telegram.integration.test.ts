import { Api } from "grammy";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "@barbershop/db";
import { buildApp } from "../app";
import { createBot } from "./bot";
import { createBarberLinkCode } from "./linking";
import { createTelegramNotifier, type Notifier } from "./notifier";
import { callbackUpdate, recordApiCalls, TEST_BOT_INFO, textUpdate, type ApiCall } from "./testUtils";

/** Same disposable database as bookings.integration.test.ts. */
const url = process.env.TEST_DATABASE_URL;

const BARBER_ID = "jasur";
const BARBER_CHAT = 5001;
const CLIENT_TG = 5002;
const STRANGER_TG = 5003;
const PHONE = "+998000010001";

type Slot = { startsAt: string };

describe.skipIf(!url)("telegram bot (integration)", { timeout: 30_000 }, () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bot: ReturnType<typeof createBot>;
  let notifier: Notifier;
  let botCalls: ApiCall[];
  let notifyCalls: ApiCall[];
  let token: string;

  const links = { appUrl: "http://localhost:3000", miniAppUrl: "https://mini.example.com" };
  const silent = { warn: () => undefined, error: () => undefined };
  const sentTo = (calls: ApiCall[], chatId: number) =>
    calls.filter((c) => c.method === "sendMessage" && c.payload.chat_id === chatId).map((c) => String(c.payload.text));

  beforeAll(async () => {
    prisma = createPrismaClient(url, { max: Number(process.env.TEST_DB_POOL_MAX ?? 1) });
    const api = new Api("1:test");
    notifyCalls = recordApiCalls(api);
    notifier = createTelegramNotifier({ prisma, api, links, log: silent });
    bot = createBot({ token: "1:test", prisma, notifier, links, log: silent, botInfo: TEST_BOT_INFO });
    botCalls = recordApiCalls(bot.api);
    app = await buildApp({ prisma, corsOrigins: [], logger: false, notifier });
  });

  beforeEach(() => {
    botCalls.length = 0;
    notifyCalls.length = 0;
  });

  afterAll(async () => {
    await notifier.idle();
    await prisma.booking.deleteMany({ where: { client: { phone: PHONE } } });
    await prisma.client.deleteMany({ where: { phone: PHONE } });
    await prisma.barber.update({
      where: { id: BARBER_ID },
      data: { telegramChatId: null, telegramLinkCodeHash: null, telegramLinkExpiresAt: null },
    });
    await app.close();
    await prisma.$disconnect();
  });

  async function freeSlot(after?: string): Promise<Slot> {
    const days = await app.inject({ url: `/api/v1/availability/days?serviceIds=haircut&barberId=${BARBER_ID}` });
    for (const { date, available } of days.json().days as { date: string; available: boolean }[]) {
      if (!available) continue;
      const res = await app.inject({ url: `/api/v1/availability?serviceIds=haircut&barberId=${BARBER_ID}&date=${date}` });
      const slot = (res.json().slots as Slot[]).find((s) => !after || s.startsAt > after);
      if (slot) return slot;
    }
    throw new Error("No free slot");
  }

  it("binds a barber chat with a single-use code", async () => {
    const code = await createBarberLinkCode(prisma, BARBER_ID);
    await bot.handleUpdate(textUpdate(BARBER_CHAT, `/start barber_${code}`));
    expect(sentTo(botCalls, BARBER_CHAT)[0]).toContain("Уведомления о новых записях");

    await bot.handleUpdate(textUpdate(STRANGER_TG, `/start barber_${code}`));
    expect(sentTo(botCalls, STRANGER_TG)[0]).toContain("недействительна");

    const barber = await prisma.barber.findUniqueOrThrow({ where: { id: BARBER_ID } });
    expect(barber.telegramChatId).toBe(BigInt(BARBER_CHAT));
    expect(barber.telegramLinkCodeHash).toBeNull();
  });

  it("notifies the barber about a web booking and links the client by deep link", async () => {
    const slot = await freeSlot();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      payload: { serviceIds: ["haircut"], barberId: BARBER_ID, startsAt: slot.startsAt, client: { name: "Тест", phone: PHONE } },
    });
    expect(created.statusCode).toBe(201);
    token = created.json().token;
    await notifier.idle();
    expect(sentTo(notifyCalls, BARBER_CHAT)[0]).toContain("Новая запись (сайт)");
    expect(sentTo(notifyCalls, CLIENT_TG)).toHaveLength(0);

    await bot.handleUpdate(textUpdate(CLIENT_TG, `/start b_${token}`));
    expect(sentTo(botCalls, CLIENT_TG).some((text) => text.includes("Запись привязана к Telegram"))).toBe(true);
    const client = await prisma.client.findUniqueOrThrow({ where: { phone: PHONE } });
    expect(client.telegramChatId).toBe(BigInt(CLIENT_TG));
  });

  it("notifies client and barber about a reschedule", async () => {
    const booking = await app.inject({ url: `/api/v1/bookings/${token}` });
    const slot = await freeSlot(booking.json().startsAt);
    const res = await app.inject({ method: "POST", url: `/api/v1/bookings/${token}/reschedule`, payload: { startsAt: slot.startsAt } });
    expect(res.statusCode).toBe(200);
    await notifier.idle();
    expect(sentTo(notifyCalls, CLIENT_TG)[0]).toContain("Запись перенесена");
    expect(sentTo(notifyCalls, BARBER_CHAT)[0]).toContain("Было:");
  });

  it("lists bookings and cancels only the owner's booking via buttons", async () => {
    await bot.handleUpdate(textUpdate(CLIENT_TG, "Мои записи"));
    const listed = botCalls.find((c) => c.method === "sendMessage" && c.payload.chat_id === CLIENT_TG);
    expect(JSON.stringify(listed?.payload.reply_markup)).toContain(`cancel:${token}`);

    await bot.handleUpdate(callbackUpdate(STRANGER_TG, `cancel!:${token}`));
    expect(botCalls.at(-1)).toMatchObject({ method: "answerCallbackQuery", payload: { text: "Запись не найдена" } });

    await bot.handleUpdate(callbackUpdate(CLIENT_TG, `cancel:${token}`));
    expect(JSON.stringify(botCalls.at(-1)?.payload)).toContain(`cancel!:${token}`);

    await bot.handleUpdate(callbackUpdate(CLIENT_TG, `cancel!:${token}`));
    expect(botCalls.some((c) => c.method === "editMessageText" && String(c.payload.text).includes("Запись отменена"))).toBe(true);

    const after = await app.inject({ url: `/api/v1/bookings/${token}` });
    expect(after.json().status).toBe("cancelled");
    await notifier.idle();
    expect(sentTo(notifyCalls, BARBER_CHAT)[0]).toContain("Запись отменена");
    expect(sentTo(notifyCalls, CLIENT_TG)).toHaveLength(0);
  });
});
