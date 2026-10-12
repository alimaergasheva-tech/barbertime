import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cancelBooking, createBooking, getBooking, rescheduleBooking } from "../booking/bookings";
import { optionalTelegramUser } from "../telegram/auth";
import { ClientInput, Id, ManageToken, ServiceIdsBody, StartsAt } from "./schemas";

const CreateBody = z.object({
  serviceIds: ServiceIdsBody,
  barberId: Id,
  startsAt: StartsAt,
  client: ClientInput,
});

const TokenParams = z.object({ token: ManageToken });

const RescheduleBody = z.object({ startsAt: StartsAt });

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/bookings", async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const telegramUser = optionalTelegramUser(request);
    const booking = await createBooking(app.prisma, { ...body, telegramUserId: telegramUser?.id });
    app.notifier.notify({ type: "created", token: booking.token });
    return reply.code(201).send(booking);
  });

  app.get("/bookings/:token", async (request) => {
    const { token } = TokenParams.parse(request.params);
    return getBooking(app.prisma, token);
  });

  app.post("/bookings/:token/cancel", async (request) => {
    const { token } = TokenParams.parse(request.params);
    const booking = await cancelBooking(app.prisma, token);
    app.notifier.notify({ type: "cancelled", token });
    return booking;
  });

  app.post("/bookings/:token/reschedule", async (request) => {
    const { token } = TokenParams.parse(request.params);
    const { startsAt } = RescheduleBody.parse(request.body);
    const { booking, previousStartsAt } = await rescheduleBooking(app.prisma, token, startsAt);
    app.notifier.notify({ type: "rescheduled", token, previousStartsAt });
    return booking;
  });
};
