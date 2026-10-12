import { createPrismaClient } from "@barbershop/db";
import type { FastifyInstance } from "fastify";
import { createSupabaseStorage } from "./admin/storage";
import { buildApp } from "./app";
import type { Env } from "./env";
import { createTelegram } from "./telegram/setup";

/** Production wiring shared by the long-running server (`server.ts`) and the Vercel function (`vercel.ts`). */
export async function createServerApp(env: Env, pool: { max?: number } = {}) {
  const prisma = createPrismaClient(env.DATABASE_URL, pool);
  // `app` is assigned before any notification or bot update can be processed.
  let app: FastifyInstance | undefined;
  const telegram = createTelegram(env, prisma, {
    warn: (obj, msg) => app?.log.warn(obj, msg),
    error: (obj, msg) => app?.log.error(obj, msg),
  });
  app = await buildApp({
    prisma,
    corsOrigins: [env.APP_URL, env.MINIAPP_URL],
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    notifier: telegram.notifier,
    storage:
      env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
        ? createSupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
        : undefined,
    telegramWebhook:
      telegram.bot && env.TELEGRAM_WEBHOOK_SECRET
        ? { bot: telegram.bot, secretToken: env.TELEGRAM_WEBHOOK_SECRET }
        : undefined,
  });
  if (!env.TELEGRAM_BOT_TOKEN) {
    app.log.warn("TELEGRAM_BOT_TOKEN is not set: Mini App auth and Telegram notifications are disabled");
  } else if (!env.TELEGRAM_WEBHOOK_SECRET) {
    app.log.warn("TELEGRAM_WEBHOOK_SECRET is not set: /telegram/webhook is disabled, use `npm run bot:polling` locally");
  }
  return { app, prisma, notifier: telegram.notifier };
}
