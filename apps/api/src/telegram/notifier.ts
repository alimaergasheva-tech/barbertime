import type { Api } from "grammy";
import type { PrismaClient } from "@barbershop/db";
import { loadSettings } from "../booking/settings";
import { barberMessages, bookingKeyboard, clientMessages, type BarberBookingView, type Links } from "./messages";

export type BookingEvent =
  | { type: "created"; token: string }
  | { type: "rescheduled"; token: string; previousStartsAt: string; skipClient?: boolean }
  | { type: "cancelled"; token: string; skipClient?: boolean };

export type Log = {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
};

export type Notifier = {
  /** Fire-and-forget: never throws and never delays the HTTP response. */
  notify(event: BookingEvent): void;
  /** Resolves when all in-flight notifications are done (tests, graceful shutdown). */
  idle(): Promise<void>;
};

export const noopNotifier: Notifier = {
  notify: () => undefined,
  idle: () => Promise.resolve(),
};

export function createTelegramNotifier(options: {
  prisma: PrismaClient;
  api: Api;
  links: Links;
  log: Log;
}): Notifier {
  const { prisma, api, links, log } = options;
  const pending = new Set<Promise<void>>();

  async function send(event: BookingEvent) {
    const booking = await prisma.booking.findUnique({
      where: { manageToken: event.token },
      include: {
        barber: { select: { name: true, telegramChatId: true } },
        client: { select: { name: true, phone: true, telegramChatId: true } },
        services: { select: { name: true } },
      },
    });
    if (!booking) return;
    const { timezone } = await loadSettings(prisma);

    const view: BarberBookingView = {
      token: booking.manageToken,
      startsAt: booking.startsAt.toISOString(),
      totalPrice: booking.totalPrice,
      barberName: booking.barber.name,
      serviceNames: booking.services.map((s) => s.name),
      clientName: booking.client.name,
      clientPhone: booking.client.phone,
      source: booking.source,
    };

    const messages: { chatId: bigint; text: string; keyboard?: ReturnType<typeof bookingKeyboard> }[] = [];
    const clientChat = booking.client.telegramChatId;
    const barberChat = booking.barber.telegramChatId;
    const skipClient = "skipClient" in event && event.skipClient;

    if (clientChat !== null && !skipClient) {
      if (event.type === "created") {
        messages.push({ chatId: clientChat, text: clientMessages.created(view, timezone), keyboard: bookingKeyboard(view, links, { withCancel: true }) });
      } else if (event.type === "rescheduled") {
        messages.push({
          chatId: clientChat,
          text: clientMessages.rescheduled(view, timezone, event.previousStartsAt),
          keyboard: bookingKeyboard(view, links, { withCancel: true }),
        });
      } else {
        messages.push({ chatId: clientChat, text: clientMessages.cancelled(view, timezone) });
      }
    }

    if (barberChat !== null) {
      const text =
        event.type === "created"
          ? barberMessages.created(view, timezone)
          : event.type === "rescheduled"
            ? barberMessages.rescheduled(view, timezone, event.previousStartsAt)
            : barberMessages.cancelled(view, timezone);
      messages.push({ chatId: barberChat, text });
    }

    const results = await Promise.allSettled(
      messages.map(({ chatId, text, keyboard }) =>
        api.sendMessage(Number(chatId), text, { parse_mode: "HTML", reply_markup: keyboard }),
      ),
    );
    for (const result of results) {
      if (result.status === "rejected") log.warn({ err: result.reason, event: event.type }, "Telegram notification failed");
    }
  }

  return {
    notify(event) {
      const task = send(event)
        .catch((error: unknown) => log.warn({ err: error, event: event.type }, "Telegram notification failed"))
        .finally(() => pending.delete(task));
      pending.add(task);
    },
    async idle() {
      await Promise.allSettled([...pending]);
    },
  };
}
