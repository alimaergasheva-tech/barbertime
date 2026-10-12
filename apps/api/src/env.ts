import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url().default("http://localhost:3000"),
  MINIAPP_URL: z.url().default("http://localhost:5173"),
  TELEGRAM_BOT_TOKEN: optional,
  /** Sent by Telegram in X-Telegram-Bot-Api-Secret-Token; the webhook is disabled without it. */
  TELEGRAM_WEBHOOK_SECRET: optional.pipe(
    z.string().regex(/^[\w-]{16,256}$/, "Use 16-256 chars: A-Z a-z 0-9 _ -").optional(),
  ),
  /** Public base URL of this API, used by `bot:setup` to register the webhook. */
  API_URL: optional.pipe(z.url().optional()),
  SUPABASE_URL: optional.pipe(z.url().optional()),
  /** Server-only key for Storage uploads; never sent to browsers. */
  SUPABASE_SERVICE_ROLE_KEY: optional,
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
