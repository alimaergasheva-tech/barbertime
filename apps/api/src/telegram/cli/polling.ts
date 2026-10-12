/** Local development: receives updates via long polling, no public URL or tunnel needed. */
import { createPrismaClient } from "@barbershop/db";
import { loadEnv } from "../../env";
import { createTelegram } from "../setup";
import { consoleLog } from "./log";

const env = loadEnv();
if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Set TELEGRAM_BOT_TOKEN in .env");

const prisma = createPrismaClient(env.DATABASE_URL);
const { bot, notifier } = createTelegram(env, prisma, consoleLog);

async function stop() {
  await bot!.stop();
  await notifier.idle();
  await prisma.$disconnect();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

// Polling and webhook are mutually exclusive in Telegram.
await bot!.api.deleteWebhook();
await bot!.start({ onStart: (me) => console.log(`@${me.username} is polling. Ctrl+C to stop.`) });
