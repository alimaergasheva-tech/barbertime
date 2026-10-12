import { randomBytes } from "node:crypto";
import type { BookingSource, Prisma, PrismaClient } from "@barbershop/db";
import { HttpError, notFound } from "../errors";
import { loadAvailabilityContext, resolveAdminStart, resolveStart, slotTaken } from "./availability";
import { loadSettings, type BookingSettings } from "./settings";
import { localDate, MINUTE_MS } from "./time";

export type CreateBookingInput = {
  serviceIds: string[];
  barberId: string;
  startsAt: string;
  client: { name: string; phone: string };
  source?: BookingSource;
  /** Verified Mini App user: links the client to this Telegram account. */
  telegramUserId?: number;
  /** Created from the admin panel: no notice, horizon or slot-grid rules. */
  admin?: boolean;
};

type Tx = Prisma.TransactionClient;

/**
 * Phone is the client's identity; a verified Telegram account is attached to it.
 * If the account was linked to another phone before, it moves to this one.
 */
async function resolveClient(tx: Tx, input: { name: string; phone: string; telegramUserId?: number }) {
  if (input.telegramUserId === undefined) {
    return tx.client.upsert({
      where: { phone: input.phone },
      create: { name: input.name, phone: input.phone },
      update: { name: input.name },
    });
  }

  const telegramId = BigInt(input.telegramUserId);
  const byPhone = await tx.client.findUnique({ where: { phone: input.phone } });
  const byTelegram = await tx.client.findUnique({ where: { telegramId } });

  if (byTelegram && !byPhone) {
    return tx.client.update({ where: { id: byTelegram.id }, data: { name: input.name, phone: input.phone } });
  }
  const client = await tx.client.upsert({
    where: { phone: input.phone },
    create: { name: input.name, phone: input.phone },
    update: { name: input.name },
  });
  return attachTelegram(tx, client.id, input.telegramUserId);
}

/** Links a Telegram account to the client, detaching it from any other client first. */
export async function attachTelegram(tx: Tx, clientId: string, telegramUserId: number) {
  const telegramId = BigInt(telegramUserId);
  await tx.client.updateMany({
    where: { telegramId, NOT: { id: clientId } },
    data: { telegramId: null, telegramChatId: null },
  });
  // In private chats with the bot the chat id equals the user id.
  return tx.client.update({ where: { id: clientId }, data: { telegramId, telegramChatId: telegramId } });
}

export const bookingInclude = {
  barber: { select: { id: true, name: true } },
  client: { select: { name: true } },
  services: { select: { serviceId: true, name: true, durationMin: true, price: true } },
} as const;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** Walks Prisma / driver-adapter error wrappers looking for a Postgres SQLSTATE. */
function hasPgCode(error: unknown, code: string, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const record = error as Record<string, unknown>;
  if (record.code === code || record.originalCode === code) return true;
  return ["cause", "meta", "driverAdapterError"].some((key) => hasPgCode(record[key], code, depth + 1));
}

export function isOverlapViolation(error: unknown): boolean {
  return hasPgCode(error, "23P01") || String(error).includes("bookings_no_overlap");
}

function newManageToken(): string {
  return randomBytes(32).toString("base64url");
}

export function toBookingDto(booking: BookingWithRelations, settings: BookingSettings, now = Date.now()) {
  const cutoff = booking.startsAt.getTime() - settings.cancelCutoffMin * MINUTE_MS;
  return {
    token: booking.manageToken,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPrice: booking.totalPrice,
    totalDurationMin: booking.totalDurationMin,
    barber: booking.barber,
    services: booking.services.map(({ serviceId, ...rest }) => ({ id: serviceId, ...rest })),
    client: booking.client,
    cancelCutoffMin: settings.cancelCutoffMin,
    canChange: booking.status === "confirmed" && now < cutoff,
  };
}

export async function createBooking(prisma: PrismaClient, input: CreateBookingInput, now = Date.now()) {
  const settings = await loadSettings(prisma);
  const start = Date.parse(input.startsAt);
  const date = localDate(start, settings.timezone);
  const context = await loadAvailabilityContext(prisma, {
    serviceIds: input.serviceIds,
    barberId: input.barberId,
    from: date,
    to: date,
    now,
    settings,
  });

  const freeBarberIds = input.admin ? resolveAdminStart(context, start) : resolveStart(context, start);

  // In "any" mode a lost race on one barber falls through to the next free one.
  for (const barberId of freeBarberIds) {
    const candidate = context.candidates.find((item) => item.barberId === barberId)!;
    try {
      const booking = await prisma.$transaction(async (tx) => {
        const client = await resolveClient(tx, { ...input.client, telegramUserId: input.telegramUserId });
        return tx.booking.create({
          data: {
            clientId: client.id,
            barberId,
            startsAt: new Date(start),
            endsAt: new Date(start + candidate.durationMin * MINUTE_MS),
            totalPrice: candidate.price,
            totalDurationMin: candidate.durationMin,
            source: input.source ?? (input.admin ? "admin" : input.telegramUserId === undefined ? "web" : "telegram"),
            manageToken: newManageToken(),
            services: { create: candidate.items },
          },
          include: bookingInclude,
        });
      });
      return toBookingDto(booking, settings, now);
    } catch (error) {
      if (!isOverlapViolation(error)) throw error;
    }
  }
  throw slotTaken();
}

const PAST_BOOKINGS_LIMIT = 10;

/** Bookings of the client linked to a Telegram account: upcoming confirmed first, then recent history. */
export async function listTelegramUserBookings(prisma: PrismaClient, telegramUserId: number, now = Date.now()) {
  const settings = await loadSettings(prisma);
  const client = await prisma.client.findUnique({ where: { telegramId: BigInt(telegramUserId) } });
  if (!client) return { upcoming: [], past: [] };

  const nowDate = new Date(now);
  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      where: { clientId: client.id, status: "confirmed", startsAt: { gte: nowDate } },
      orderBy: { startsAt: "asc" },
      include: bookingInclude,
    }),
    prisma.booking.findMany({
      where: { clientId: client.id, NOT: { status: "confirmed", startsAt: { gte: nowDate } } },
      orderBy: { startsAt: "desc" },
      take: PAST_BOOKINGS_LIMIT,
      include: bookingInclude,
    }),
  ]);
  return {
    upcoming: upcoming.map((booking) => toBookingDto(booking, settings, now)),
    past: past.map((booking) => toBookingDto(booking, settings, now)),
  };
}

async function findByToken(prisma: PrismaClient, token: string) {
  const booking = await prisma.booking.findUnique({ where: { manageToken: token }, include: bookingInclude });
  if (!booking) throw notFound("Booking not found");
  return booking;
}

function assertChangeable(booking: BookingWithRelations, settings: BookingSettings, now: number, admin = false) {
  if (booking.status !== "confirmed") {
    throw new HttpError(409, "NOT_ACTIVE", `Booking is ${booking.status}`);
  }
  if (!admin && now >= booking.startsAt.getTime() - settings.cancelCutoffMin * MINUTE_MS) {
    throw new HttpError(
      422,
      "TOO_LATE",
      `Bookings can be changed no later than ${settings.cancelCutoffMin} minutes before the start`,
    );
  }
}

export async function getBooking(prisma: PrismaClient, token: string, now = Date.now()) {
  const [booking, settings] = await Promise.all([findByToken(prisma, token), loadSettings(prisma)]);
  return toBookingDto(booking, settings, now);
}

export type ChangeOptions = { now?: number; admin?: boolean };

export async function cancelBooking(prisma: PrismaClient, token: string, { now = Date.now(), admin = false }: ChangeOptions = {}) {
  const [booking, settings] = await Promise.all([findByToken(prisma, token), loadSettings(prisma)]);
  assertChangeable(booking, settings, now, admin);

  const updated = await prisma.booking.update({
    where: { id: booking.id, status: "confirmed" },
    data: { status: "cancelled" },
    include: bookingInclude,
  });
  return toBookingDto(updated, settings, now);
}

export async function rescheduleBooking(
  prisma: PrismaClient,
  token: string,
  startsAt: string,
  { now = Date.now(), admin = false }: ChangeOptions = {},
) {
  const [booking, settings] = await Promise.all([findByToken(prisma, token), loadSettings(prisma)]);
  assertChangeable(booking, settings, now, admin);

  const start = Date.parse(startsAt);
  const date = localDate(start, settings.timezone);
  const context = await loadAvailabilityContext(prisma, {
    serviceIds: booking.services.map((item) => item.serviceId),
    barberId: booking.barberId,
    from: date,
    to: date,
    excludeBookingId: booking.id,
    now,
    settings,
  });
  if (admin) resolveAdminStart(context, start);
  else resolveStart(context, start);

  try {
    const updated = await prisma.booking.update({
      where: { id: booking.id, status: "confirmed" },
      data: {
        startsAt: new Date(start),
        endsAt: new Date(start + booking.totalDurationMin * MINUTE_MS),
        reminderDaySentAt: null,
        reminder30mSentAt: null,
      },
      include: bookingInclude,
    });
    return { booking: toBookingDto(updated, settings, now), previousStartsAt: booking.startsAt.toISOString() };
  } catch (error) {
    if (isOverlapViolation(error)) throw slotTaken();
    throw error;
  }
}
