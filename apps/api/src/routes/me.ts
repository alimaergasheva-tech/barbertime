import type { FastifyPluginAsync } from "fastify";
import { listTelegramUserBookings } from "../booking/bookings";
import { requireTelegramUser } from "../telegram/auth";

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request) => {
    const user = requireTelegramUser(request);
    const client = await app.prisma.client.findUnique({
      where: { telegramId: BigInt(user.id) },
      select: { name: true, phone: true },
    });
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username },
      client,
    };
  });

  app.get("/me/bookings", async (request) => {
    const user = requireTelegramUser(request);
    return listTelegramUserBookings(app.prisma, user.id);
  });
};
