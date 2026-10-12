import type { FastifyPluginAsync } from "fastify";
import { webhookCallback } from "grammy";
import type { BarberTimeBot } from "../telegram/bot";

export type TelegramWebhookOptions = { bot: BarberTimeBot; secretToken: string };

/** Telegram delivers updates here; requests without the secret header get 401. */
export const telegramWebhookRoutes: FastifyPluginAsync<TelegramWebhookOptions> = async (app, { bot, secretToken }) => {
  app.post("/telegram/webhook", webhookCallback(bot, "fastify", { secretToken }));
};
