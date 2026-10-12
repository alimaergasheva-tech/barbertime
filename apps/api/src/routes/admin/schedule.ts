import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@barbershop/db";
import { loadSettings } from "../../booking/settings";
import { addDays, zonedToUtc } from "../../booking/time";
import { HttpError, notFound } from "../../errors";
import { Id, IsoDate } from "../schemas";
import { Clock, Uuid } from "./common";

const TimeOffBody = z
  .object({
    /** null = the whole shop is closed (holiday). */
    barberId: Id.nullable(),
    from: IsoDate,
    to: IsoDate,
    /** Both empty = whole days. */
    startTime: Clock.optional(),
    endTime: Clock.optional(),
    type: z.enum(["day_off", "vacation", "sick", "holiday", "other"]),
    note: z.string().trim().max(200).optional(),
  })
  .refine((b) => (b.startTime === undefined) === (b.endTime === undefined), "Set both times or none");

async function conflicts(prisma: PrismaClient, barberId: string | null, startsAt: Date, endsAt: Date) {
  return prisma.booking.count({
    where: {
      status: "confirmed",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(barberId ? { barberId } : {}),
    },
  });
}

export const adminScheduleRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app;

  app.get("/time-off", async () => {
    const rows = await prisma.timeOff.findMany({
      where: { endsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      include: { barber: { select: { id: true, name: true } } },
    });
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        barber: row.barber,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        type: row.type,
        note: row.note,
        conflicts: await conflicts(prisma, row.barberId, row.startsAt, row.endsAt),
      })),
    );
  });

  app.post("/time-off", async (request, reply) => {
    const body = TimeOffBody.parse(request.body);
    const { timezone } = await loadSettings(prisma);
    const allDay = body.startTime === undefined;
    const startsAt = new Date(zonedToUtc(body.from, allDay ? 0 : body.startTime!, timezone));
    const endsAt = new Date(allDay ? zonedToUtc(addDays(body.to, 1), 0, timezone) : zonedToUtc(body.to, body.endTime!, timezone));
    if (endsAt <= startsAt) throw new HttpError(400, "VALIDATION_ERROR", "End must be after start");
    if (body.barberId) {
      const barber = await prisma.barber.findUnique({ where: { id: body.barberId }, select: { id: true } });
      if (!barber) throw notFound("Barber not found");
    }

    const row = await prisma.timeOff.create({
      data: { barberId: body.barberId, startsAt, endsAt, type: body.type, note: body.note || null },
    });
    return reply.code(201).send({ id: row.id, conflicts: await conflicts(prisma, row.barberId, startsAt, endsAt) });
  });

  app.delete("/time-off/:id", async (request) => {
    const { id } = z.object({ id: Uuid }).parse(request.params);
    const { count } = await prisma.timeOff.deleteMany({ where: { id } });
    if (!count) throw notFound("Time off not found");
    return { id };
  });
};
