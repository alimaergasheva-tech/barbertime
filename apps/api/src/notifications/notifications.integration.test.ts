import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type BookingStatus, type PrismaClient } from "@barbershop/db";
import { runNotifications } from "../../../../supabase/functions/notifications/core.ts";
import { createBot } from "../telegram/bot";
import { noopNotifier } from "../telegram/notifier";
import { COMMENT_PROMPT } from "../telegram/reviews";
import { callbackUpdate, recordApiCalls, TEST_BOT_INFO } from "../telegram/testUtils";
import { prismaDb } from "./prismaDb";

/** Auto-completion with a future `now` touches every booking — local disposable databases only. */
const url = process.env.TEST_DATABASE_URL;
const isLocal = Boolean(url && /@(localhost|127\.0\.0\.1)[:/]/.test(url));

const CHAT = 6001;
const PHONE = "+998000020001";
const BARBER = "timur";
/** Far from seed data and other tests; the job only sees what we pass as `now`. */
const NOW = new Date("2027-03-01T05:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Sent = { chat_id: string; text: string; reply_markup?: { inline_keyboard: { callback_data?: string }[][] } };

describe.skipIf(!isLocal)("notifications job (integration)", { timeout: 30_000 }, () => {
  let prisma: PrismaClient;
  let clientId: string;
  let sent: Sent[];
  let status = 200;

  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (status === 200) sent.push(JSON.parse(String(init?.body)) as Sent);
    return new Response("{}", { status });
  }) as typeof fetch;

  const run = (now = NOW) =>
    runNotifications({ db: prismaDb(prisma), telegramToken: "1:test", now, fetch: fakeFetch, appUrl: "http://localhost:3000" });

  async function booking(startOffsetMs: number, createdOffsetMs: number, bookingStatus: BookingStatus = "confirmed") {
    const startsAt = new Date(NOW.getTime() + startOffsetMs);
    return prisma.booking.create({
      data: {
        clientId,
        barberId: BARBER,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * MIN),
        totalPrice: 150_000,
        totalDurationMin: 45,
        status: bookingStatus,
        manageToken: randomBytes(32).toString("base64url"),
        createdAt: new Date(NOW.getTime() + createdOffsetMs),
        services: { create: [{ serviceId: "haircut", name: "Мужская стрижка", durationMin: 45, price: 150_000 }] },
      },
    });
  }

  beforeAll(async () => {
    prisma = createPrismaClient(url, { max: Number(process.env.TEST_DB_POOL_MAX ?? 1) });
    const client = await prisma.client.create({
      data: { name: "Тест", phone: PHONE, telegramId: BigInt(CHAT), telegramChatId: BigInt(CHAT) },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it("sends due reminders, completes past visits and asks for a review — once", async () => {
    const day = await booking(20 * HOUR, -3 * DAY);
    const short = await booking(20 * MIN, -2 * DAY);
    const bookedLate = await booking(10 * HOUR, -HOUR);
    const past = await booking(-3 * HOUR, -2 * DAY);
    await booking(23 * HOUR, -3 * DAY, "cancelled");
    sent = [];

    const first = await run();
    expect(first).toMatchObject({ dayReminders: 1, shortReminders: 1, reviewRequests: 1, failed: 0 });
    expect(first.autoCompleted).toBeGreaterThanOrEqual(1);
    expect(sent.map((m) => m.chat_id)).toEqual([String(CHAT), String(CHAT), String(CHAT)]);
    expect(sent.find((m) => m.text.startsWith("Напоминаем"))?.reply_markup?.inline_keyboard[0][0].callback_data).toBe(
      `cancel:${day.manageToken}`,
    );
    expect(sent.some((m) => m.text.startsWith("Скоро ваш визит"))).toBe(true);
    expect(JSON.stringify(sent.at(-1))).toContain(`rate:${past.id}:5`);

    const rows = await prisma.booking.findMany({ where: { id: { in: [day.id, short.id, bookedLate.id, past.id] } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(day.id)?.reminderDaySentAt).not.toBeNull();
    expect(byId.get(short.id)?.reminder30mSentAt).not.toBeNull();
    expect(byId.get(bookedLate.id)?.reminderDaySentAt).toBeNull();
    expect(byId.get(past.id)).toMatchObject({ status: "completed" });
    expect(byId.get(past.id)?.autoCompletedAt).not.toBeNull();

    sent = [];
    const second = await run();
    expect(second).toMatchObject({ dayReminders: 0, shortReminders: 0, reviewRequests: 0 });
    expect(sent).toHaveLength(0);
  });

  it("releases the claim on a transient Telegram error and keeps it for a blocked chat", async () => {
    const retry = await booking(21 * HOUR, -3 * DAY);
    sent = [];

    status = 500;
    expect((await run()).failed).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: retry.id } })).reminderDaySentAt).toBeNull();

    status = 200;
    expect((await run()).dayReminders).toBe(1);

    const blocked = await booking(17 * HOUR, -3 * DAY);
    status = 403;
    expect((await run()).failed).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: blocked.id } })).reminderDaySentAt).not.toBeNull();
    status = 200;
    expect((await run()).dayReminders).toBe(0);
  });

  it("parallel runs never send the same reminder twice", async () => {
    await booking(19 * HOUR, -3 * DAY);
    sent = [];
    const results = await Promise.all([run(), run(), run()]);
    expect(results.reduce((sum, r) => sum + r.dayReminders, 0)).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("stores the rating and comment from the review request", async () => {
    const past = await prisma.booking.findFirstOrThrow({ where: { clientId, status: "completed" } });
    const bot = createBot({
      token: "1:test",
      prisma,
      notifier: noopNotifier,
      links: { appUrl: "http://localhost:3000", miniAppUrl: "http://localhost:5173" },
      log: { warn: () => undefined, error: () => undefined },
      botInfo: TEST_BOT_INFO,
    });
    const calls = recordApiCalls(bot.api);

    await bot.handleUpdate(callbackUpdate(CHAT + 1, `rate:${past.id}:5`));
    expect(calls.at(-2)?.payload).toMatchObject({ text: "Запись не найдена" });

    await bot.handleUpdate(callbackUpdate(CHAT, `rate:${past.id}:5`));
    expect(calls.some((c) => c.method === "sendMessage" && c.payload.text === COMMENT_PROMPT)).toBe(true);

    await bot.handleUpdate({
      update_id: 900_001,
      message: {
        message_id: 77,
        date: Math.floor(Date.now() / 1000),
        chat: { id: CHAT, type: "private", first_name: "Тест" },
        from: { id: CHAT, is_bot: false, first_name: "Тест" },
        text: "Отличная стрижка!",
        reply_to_message: {
          message_id: 76,
          date: Math.floor(Date.now() / 1000),
          chat: { id: CHAT, type: "private", first_name: "Тест" },
          from: { id: TEST_BOT_INFO.id, is_bot: true, first_name: TEST_BOT_INFO.first_name },
          text: COMMENT_PROMPT,
        },
      },
    } as never);

    const review = await prisma.review.findUniqueOrThrow({ where: { bookingId: past.id } });
    expect(review).toMatchObject({ rating: 5, isPublic: true, comment: "Отличная стрижка!" });

    await bot.handleUpdate(callbackUpdate(CHAT, `rate:${past.id}:1`));
    expect(calls.at(-2)?.payload).toMatchObject({ text: "Оценка уже сохранена" });
  });
});
