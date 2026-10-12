import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  horizonDays,
  loadAvailabilityContext,
  serializeSlots,
  slotsForDay,
} from "../booking/availability";
import { loadSettings } from "../booking/settings";
import { addDays, localDate } from "../booking/time";
import { notFound } from "../errors";
import { Id, IsoDate, ManageToken, ServiceIdsQuery } from "./schemas";

const BaseQuery = z.object({
  serviceIds: ServiceIdsQuery,
  barberId: Id,
  rescheduleToken: ManageToken.optional(),
});

const DayQuery = BaseQuery.extend({ date: IsoDate });

export const availabilityRoutes: FastifyPluginAsync = async (app) => {
  async function excludedBookingId(token: string | undefined) {
    if (!token) return undefined;
    const booking = await app.prisma.booking.findUnique({ where: { manageToken: token }, select: { id: true } });
    if (!booking) throw notFound("Booking not found");
    return booking.id;
  }

  app.get("/availability", async (request) => {
    const query = DayQuery.parse(request.query);
    const context = await loadAvailabilityContext(app.prisma, {
      serviceIds: query.serviceIds,
      barberId: query.barberId,
      from: query.date,
      to: query.date,
      excludeBookingId: await excludedBookingId(query.rescheduleToken),
    });
    return { date: query.date, slots: serializeSlots(context, slotsForDay(context, query.date)) };
  });

  app.get("/availability/days", async (request) => {
    const query = BaseQuery.parse(request.query);
    const settings = await loadSettings(app.prisma);
    const today = localDate(Date.now(), settings.timezone);
    const context = await loadAvailabilityContext(app.prisma, {
      serviceIds: query.serviceIds,
      barberId: query.barberId,
      from: today,
      to: addDays(today, settings.horizonDays - 1),
      excludeBookingId: await excludedBookingId(query.rescheduleToken),
      settings,
    });
    return {
      days: horizonDays(context).map((date) => ({ date, available: slotsForDay(context, date).size > 0 })),
    };
  });
};
