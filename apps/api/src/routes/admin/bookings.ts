import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma } from "@barbershop/db";
import { cancelBooking, createBooking, isOverlapViolation, rescheduleBooking } from "../../booking/bookings";
import { slotTaken } from "../../booking/availability";
import { loadSettings } from "../../booking/settings";
import { addDays, zonedToUtc } from "../../booking/time";
import { HttpError, notFound } from "../../errors";
import { ClientInput, Id, IsoDate, ServiceIdsBody, StartsAt } from "../schemas";
import { Uuid } from "./common";

const Status = z.enum(["confirmed", "completed", "cancelled", "no_show"]);

const ListQuery = z.object({
  from: IsoDate,
  to: IsoDate,
  barberId: Id.optional(),
  status: Status.optional(),
  q: z.string().trim().max(60).optional(),
});

const CreateBody = z.object({
  serviceIds: ServiceIdsBody,
  barberId: Id,
  startsAt: StartsAt,
  client: ClientInput,
});

const PatchBody = z
  .object({ status: Status.optional(), startsAt: StartsAt.optional() })
  .refine((body) => (body.status === undefined) !== (body.startsAt === undefined), "Pass either status or startsAt");

const MAX_RANGE_DAYS = 62;

const adminInclude = {
  barber: { select: { id: true, name: true } },
  client: { select: { name: true, phone: true, telegramChatId: true } },
  services: { select: { serviceId: true, name: true } },
} as const satisfies Prisma.BookingInclude;

type AdminBookingRow = Prisma.BookingGetPayload<{ include: typeof adminInclude }>;

export function toAdminBookingDto(booking: AdminBookingRow) {
  return {
    id: booking.id,
    token: booking.manageToken,
    status: booking.status,
    source: booking.source,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPrice: booking.totalPrice,
    totalDurationMin: booking.totalDurationMin,
    createdAt: booking.createdAt.toISOString(),
    barber: booking.barber,
    client: { name: booking.client.name, phone: booking.client.phone, telegram: booking.client.telegramChatId !== null },
    services: booking.services.map((s) => ({ id: s.serviceId, name: s.name })),
  };
}

export const adminBookingRoutes: FastifyPluginAsync = async (app) => {
  async function byId(id: string) {
    const booking = await app.prisma.booking.findUnique({ where: { id }, include: adminInclude });
    if (!booking) throw notFound("Booking not found");
    return booking;
  }

  app.get("/bookings", async (request) => {
    const query = ListQuery.parse(request.query);
    if (query.to < query.from || query.to > addDays(query.from, MAX_RANGE_DAYS)) {
      throw new HttpError(400, "VALIDATION_ERROR", `Range must be 0-${MAX_RANGE_DAYS} days`);
    }
    const { timezone } = await loadSettings(app.prisma);
    const q = query.q;
    const rows = await app.prisma.booking.findMany({
      where: {
        startsAt: { gte: new Date(zonedToUtc(query.from, 0, timezone)), lt: new Date(zonedToUtc(addDays(query.to, 1), 0, timezone)) },
        ...(query.barberId ? { barberId: query.barberId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(q ? { client: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/[^\d+]/g, "") || q } }] } } : {}),
      },
      orderBy: { startsAt: "asc" },
      take: 500,
      include: adminInclude,
    });
    return rows.map(toAdminBookingDto);
  });

  app.post("/bookings", async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const created = await createBooking(app.prisma, { ...body, admin: true });
    app.notifier.notify({ type: "created", token: created.token });
    const booking = await app.prisma.booking.findUniqueOrThrow({ where: { manageToken: created.token }, include: adminInclude });
    return reply.code(201).send(toAdminBookingDto(booking));
  });

  app.patch("/bookings/:id", async (request) => {
    const { id } = z.object({ id: Uuid }).parse(request.params);
    const body = PatchBody.parse(request.body);
    const booking = await byId(id);
    const token = booking.manageToken;

    if (body.startsAt) {
      const { previousStartsAt } = await rescheduleBooking(app.prisma, token, body.startsAt, { admin: true });
      app.notifier.notify({ type: "rescheduled", token, previousStartsAt });
    } else if (body.status === "cancelled") {
      await cancelBooking(app.prisma, token, { admin: true });
      app.notifier.notify({ type: "cancelled", token });
    } else if (body.status && body.status !== booking.status) {
      try {
        await app.prisma.booking.update({ where: { id }, data: { status: body.status } });
      } catch (error) {
        // Re-confirming a cancelled visit whose time is now taken.
        if (isOverlapViolation(error)) throw slotTaken();
        throw error;
      }
    }
    return toAdminBookingDto(await byId(id));
  });
};
