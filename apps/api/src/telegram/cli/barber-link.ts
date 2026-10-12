/** Prints a one-time link that binds a barber's Telegram chat: npm run bot:barber-link -- <name|id> */
import { Api } from "grammy";
import { createPrismaClient } from "@barbershop/db";
import { loadEnv } from "../../env";
import { BARBER_LINK_TTL_MS, createBarberLinkCode } from "../linking";

const env = loadEnv();
if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Set TELEGRAM_BOT_TOKEN in .env");
const query = process.argv.slice(2).join(" ").trim();

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const barbers = await prisma.barber.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const barber = barbers.find((b) => b.id === query || b.name.toLowerCase().startsWith(query.toLowerCase()));
  if (!query || !barber) {
    console.log("Usage: npm run bot:barber-link -- <name|id>\nBarbers:");
    for (const b of barbers) console.log(`  ${b.name} (${b.id})${b.telegramChatId ? " — linked" : ""}`);
    process.exitCode = 1;
  } else {
    const me = await new Api(env.TELEGRAM_BOT_TOKEN).getMe();
    const code = await createBarberLinkCode(prisma, barber.id);
    console.log(`${barber.name}: https://t.me/${me.username}?start=barber_${code}`);
    console.log(`Valid for ${BARBER_LINK_TTL_MS / 3_600_000} h, single use.`);
  }
} finally {
  await prisma.$disconnect();
}
