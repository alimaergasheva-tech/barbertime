/** Registers commands, the chat menu button and (when API_URL is https) the webhook. */
import { createPrismaClient } from "@barbershop/db";
import { loadEnv } from "../../env";
import { configureBotProfile } from "../bot";
import { publicUrl } from "../messages";
import { createTelegram, linksFromEnv } from "../setup";
import { consoleLog } from "./log";

const env = loadEnv();
if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Set TELEGRAM_BOT_TOKEN in .env");

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const { bot } = createTelegram(env, prisma, consoleLog);
  const me = await bot!.api.getMe();
  await configureBotProfile(bot!, linksFromEnv(env));
  console.log(`@${me.username}: commands and menu button configured`);
  if (!publicUrl(env.MINIAPP_URL)) console.log(`MINIAPP_URL ${env.MINIAPP_URL} is not https: menu shows commands only`);

  const apiUrl = env.API_URL && publicUrl(env.API_URL);
  if (apiUrl && env.TELEGRAM_WEBHOOK_SECRET) {
    const url = `${apiUrl.replace(/\/$/, "")}/telegram/webhook`;
    await bot!.api.setWebhook(url, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    console.log(`Webhook set: ${url}`);
  } else {
    console.log("Webhook not set: needs https API_URL and TELEGRAM_WEBHOOK_SECRET (use `npm run bot:polling` locally)");
  }
} finally {
  await prisma.$disconnect();
}
