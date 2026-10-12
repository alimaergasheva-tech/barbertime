import type { PrismaClient } from "@barbershop/db";

export const COMMENT_PROMPT = "Напишите пару слов о визите ответом на это сообщение — это поможет другим клиентам. Можно пропустить.";

const COMMENT_MAX_LENGTH = 1000;
const COMMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Rating from the review-request buttons; only the client of a completed visit may rate it, once. */
export async function saveRating(prisma: PrismaClient, bookingId: string, telegramUserId: number, rating: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true, barberId: true, clientId: true, client: { select: { telegramId: true } }, review: { select: { id: true } } },
  });
  if (!booking || booking.status !== "completed" || booking.client.telegramId !== BigInt(telegramUserId)) return "not_found";
  if (booking.review) return "duplicate";

  const threshold = await prisma.setting.findUnique({ where: { key: "review_public_min_rating" } });
  const minPublic = Number(threshold?.value ?? 4);
  try {
    await prisma.review.create({
      data: { bookingId: booking.id, barberId: booking.barberId, clientId: booking.clientId, rating, isPublic: rating >= minPublic },
    });
    return "saved";
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return "duplicate";
    throw error;
  }
}

/** Attaches a comment to the client's latest rating left within the last day. */
export async function saveComment(prisma: PrismaClient, telegramUserId: number, text: string, now = Date.now()) {
  const comment = text.trim().slice(0, COMMENT_MAX_LENGTH);
  if (!comment) return false;
  const review = await prisma.review.findFirst({
    where: {
      client: { telegramId: BigInt(telegramUserId) },
      comment: null,
      createdAt: { gte: new Date(now - COMMENT_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!review) return false;
  await prisma.review.update({ where: { id: review.id }, data: { comment } });
  return true;
}
