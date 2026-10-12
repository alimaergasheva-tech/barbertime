/** One notifications pass, same logic as the Edge Function: npm run notifications:run */
import { createPrismaClient } from "@barbershop/db";
import { runNotifications } from "../../../../supabase/functions/notifications/core.ts";
import { loadEnv } from "../env";
import { prismaDb } from "./prismaDb";

const env = loadEnv();
if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Set TELEGRAM_BOT_TOKEN in .env");

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const result = await runNotifications({ db: prismaDb(prisma), telegramToken: env.TELEGRAM_BOT_TOKEN, appUrl: env.APP_URL });
  console.log(result);
} finally {
  await prisma.$disconnect();
}
