import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { notFound } from "../../errors";
import { Uuid } from "./common";

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** Every editable setting with its bounds; unknown keys are rejected. */
export const SettingsSchema = z
  .object({
    cancel_cutoff_min: z.number().int().min(0).max(1440),
    slot_step_min: z.number().int().min(5).max(120),
    booking_horizon_days: z.number().int().min(1).max(365),
    min_notice_min: z.number().int().min(0).max(1440),
    reminder_day_minutes: z.number().int().min(60).max(4320),
    reminder_short_minutes: z.number().int().min(5).max(240),
    review_delay_min: z.number().int().min(0).max(10080),
    review_public_min_rating: z.number().int().min(1).max(5),
    timezone: z.string().refine(isTimeZone, "Unknown time zone"),
  })
  .strict();

const ReviewFilter = z.object({ visibility: z.enum(["all", "public", "hidden"]).default("all") });

export const adminMiscRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app;

  app.get("/me", async (request) => ({ login: request.admin!.login }));

  app.get("/settings", async () => {
    const rows = await prisma.setting.findMany();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });

  app.put("/settings", async (request) => {
    const body = SettingsSchema.partial().parse(request.body);
    await prisma.$transaction(
      Object.entries(body).map(([key, value]) =>
        prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
    const rows = await prisma.setting.findMany();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });

  app.get("/reviews", async (request) => {
    const { visibility } = ReviewFilter.parse(request.query);
    const rows = await prisma.review.findMany({
      where: visibility === "all" ? {} : { isPublic: visibility === "public" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        barber: { select: { id: true, name: true } },
        client: { select: { name: true } },
        booking: { select: { startsAt: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      visitAt: row.booking.startsAt.toISOString(),
      barber: row.barber,
      clientName: row.client.name,
    }));
  });

  app.patch("/reviews/:id", async (request) => {
    const { id } = z.object({ id: Uuid }).parse(request.params);
    const { isPublic } = z.object({ isPublic: z.boolean() }).parse(request.body);
    const { count } = await prisma.review.updateMany({ where: { id }, data: { isPublic } });
    if (!count) throw notFound("Review not found");
    return { id, isPublic };
  });
};
