/**
 * Deploys the `notifications` Edge Function and its secrets (needs `npx supabase login` once).
 * SUPABASE_DB_URL is provided to Edge Functions by Supabase itself.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const env = z
  .object({
    SUPABASE_URL: z.url(),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    CRON_SECRET: z.string().min(32),
    APP_URL: z.url(),
  })
  .parse(process.env);

const projectRef = new URL(env.SUPABASE_URL).hostname.split(".")[0];
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function supabase(args: string[]) {
  const result = spawnSync("npx", ["supabase", ...args, "--project-ref", projectRef], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

supabase([
  "secrets",
  "set",
  `TELEGRAM_BOT_TOKEN=${env.TELEGRAM_BOT_TOKEN}`,
  `CRON_SECRET=${env.CRON_SECRET}`,
  `APP_URL=${env.APP_URL}`,
]);
supabase(["functions", "deploy", "notifications", "--use-api"]);
console.log(`Deployed: ${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/notifications`);
