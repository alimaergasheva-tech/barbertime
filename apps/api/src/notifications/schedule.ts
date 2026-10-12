/**
 * Schedules the `notifications` Edge Function with Supabase Cron (pg_cron + pg_net).
 * The function URL and CRON_SECRET are kept in Supabase Vault, not in the cron command.
 *   npm run notifications:schedule            — every 5 minutes
 *   npm run notifications:schedule -- --off   — remove the job
 */
import { createPrismaClient } from "@barbershop/db";
import { z } from "zod";

const JOB = "barber-time-notifications";
const SCHEDULE = "*/5 * * * *";

const env = z
  .object({
    DIRECT_URL: z.string().min(1),
    SUPABASE_URL: z.url(),
    CRON_SECRET: z.string().regex(/^[\w-]{32,}$/, "CRON_SECRET: 32+ chars of A-Z a-z 0-9 _ -"),
  })
  .parse(process.env);

const prisma = createPrismaClient(env.DIRECT_URL);

async function upsertSecret(name: string, value: string) {
  const [existing] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    "SELECT id::text FROM vault.secrets WHERE name = $1",
    name,
  );
  if (existing) await prisma.$queryRawUnsafe("SELECT vault.update_secret($1::uuid, $2)", existing.id, value);
  else await prisma.$queryRawUnsafe("SELECT vault.create_secret($1, $2)", value, name);
}

try {
  if (process.argv.includes("--off")) {
    await prisma.$queryRawUnsafe("SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1", JOB);
    console.log(`Cron job ${JOB} removed`);
  } else {
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_cron");
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions");

    await upsertSecret("notifications_url", `${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/notifications`);
    await upsertSecret("notifications_cron_secret", env.CRON_SECRET);

    const command = `
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )`;
    // cron.schedule with an existing name replaces the job.
    await prisma.$queryRawUnsafe("SELECT cron.schedule($1, $2, $3)", JOB, SCHEDULE, command);
    console.log(`Cron job ${JOB} scheduled: ${SCHEDULE}`);
  }
} finally {
  await prisma.$disconnect();
}
