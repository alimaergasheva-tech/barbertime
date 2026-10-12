import { Api } from "grammy";
import type { PrismaClient } from "@barbershop/db";
import type { Env } from "../env";
import { createBot } from "./bot";
import { createTelegramNotifier, noopNotifier, type Log } from "./notifier";

export const linksFromEnv = (env: Env) => ({ appUrl: env.APP_URL, miniAppUrl: env.MINIAPP_URL });

/** Bot + notifier from env; without TELEGRAM_BOT_TOKEN notifications are disabled. */
export function createTelegram(env: Env, prisma: PrismaClient, log: Log) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { bot: null, notifier: noopNotifier };
  const links = linksFromEnv(env);
  const notifier = createTelegramNotifier({ prisma, api: new Api(token), links, log });
  return { bot: createBot({ token, prisma, links, log, notifier }), notifier };
}
