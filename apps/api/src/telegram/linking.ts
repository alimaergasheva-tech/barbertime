import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@barbershop/db";
import { attachTelegram } from "../booking/bookings";

export const BARBER_LINK_TTL_MS = 24 * 60 * 60 * 1000;

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Links the booking's client to the Telegram user who opened t.me/<bot>?start=b_<token>. */
export async function linkClientByBookingToken(prisma: PrismaClient, token: string, telegramUserId: number) {
  const booking = await prisma.booking.findUnique({ where: { manageToken: token }, select: { clientId: true } });
  if (!booking) return false;
  await prisma.$transaction((tx) => attachTelegram(tx, booking.clientId, telegramUserId));
  return true;
}

/** Issues a one-time code for t.me/<bot>?start=barber_<code>; only its hash is stored. */
export async function createBarberLinkCode(prisma: PrismaClient, barberId: string, now = Date.now()) {
  const code = randomBytes(18).toString("base64url");
  await prisma.barber.update({
    where: { id: barberId },
    data: { telegramLinkCodeHash: hashCode(code), telegramLinkExpiresAt: new Date(now + BARBER_LINK_TTL_MS) },
  });
  return code;
}

/** Consumes the code and binds the barber's notifications to this chat. */
export async function linkBarberByCode(prisma: PrismaClient, code: string, chatId: number, now = Date.now()) {
  const hash = hashCode(code);
  const barber = await prisma.barber.findUnique({ where: { telegramLinkCodeHash: hash }, select: { id: true, name: true } });
  if (!barber) return null;
  // Conditional update makes the code single-use even under concurrent /start.
  const { count } = await prisma.barber.updateMany({
    where: { id: barber.id, telegramLinkCodeHash: hash, telegramLinkExpiresAt: { gt: new Date(now) } },
    data: { telegramChatId: BigInt(chatId), telegramLinkCodeHash: null, telegramLinkExpiresAt: null },
  });
  return count === 0 ? null : barber;
}

/** Booking token is accepted from callbacks only if it belongs to this Telegram user. */
export async function isOwnBooking(prisma: PrismaClient, token: string, telegramUserId: number) {
  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    select: { client: { select: { telegramId: true } } },
  });
  return booking?.client.telegramId === BigInt(telegramUserId);
}
