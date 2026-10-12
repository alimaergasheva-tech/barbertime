import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "@barbershop/db";
import { registerErrorHandling } from "./errors";
import { availabilityRoutes } from "./routes/availability";
import { bookingRoutes } from "./routes/bookings";
import { catalogRoutes } from "./routes/catalog";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { adminRoutes } from "./routes/admin";
import { telegramWebhookRoutes, type TelegramWebhookOptions } from "./routes/telegram";
import type { LoginLimiter } from "./admin/rateLimit";
import { disabledStorage, type ImageStorage } from "./admin/storage";
import { noopNotifier, type Notifier } from "./telegram/notifier";

export type AppConfig = {
  telegramBotToken?: string;
};

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    notifier: Notifier;
    storage: ImageStorage;
  }
}

export type AppOptions = {
  prisma: PrismaClient;
  /** Browser origins allowed by CORS (site, Mini App). */
  corsOrigins: string[];
  telegramBotToken?: string;
  notifier?: Notifier;
  /** Enables POST /telegram/webhook. */
  telegramWebhook?: TelegramWebhookOptions;
  /** Photo uploads from the admin panel. */
  storage?: ImageStorage;
  loginLimiter?: LoginLimiter;
  logger?: FastifyServerOptions["logger"];
};

export async function buildApp({
  prisma,
  corsOrigins,
  telegramBotToken,
  notifier = noopNotifier,
  telegramWebhook,
  storage = disabledStorage,
  loginLimiter,
  logger = true,
}: AppOptions) {
  const app = Fastify({ logger });

  app.decorate("prisma", prisma);
  app.decorate("config", { telegramBotToken });
  app.decorate("notifier", notifier);
  app.decorate("storage", storage);
  registerErrorHandling(app);

  await app.register(cors, {
    origin: corsOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });

  await app.register(healthRoutes);
  for (const routes of [catalogRoutes, availabilityRoutes, bookingRoutes, meRoutes]) {
    await app.register(routes, { prefix: "/api/v1" });
  }
  await app.register(adminRoutes, { prefix: "/api/v1/admin", limiter: loginLimiter });
  if (telegramWebhook) await app.register(telegramWebhookRoutes, telegramWebhook);

  return app;
}
