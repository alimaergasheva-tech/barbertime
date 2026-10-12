// Supabase Edge Function (Deno). Invoked by Supabase Cron every few minutes.
import postgres from "npm:postgres@3.4.7";
import { runNotifications } from "./core.ts";

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const cronSecret = Deno.env.get("CRON_SECRET");
const appUrl = Deno.env.get("APP_URL");

// Supavisor transaction mode does not support prepared statements.
const sql = databaseUrl ? postgres(databaseUrl, { prepare: false, max: 1 }) : null;

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  if (!cronSecret || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  if (!sql || !telegramToken) {
    return Response.json({ error: "SUPABASE_DB_URL or TELEGRAM_BOT_TOKEN is not set" }, { status: 503 });
  }

  try {
    const result = await runNotifications({
      db: { query: (text, params = []) => sql.unsafe(text, params as never[]) as never },
      telegramToken,
      appUrl,
    });
    console.log(JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "notifications run failed" }, { status: 500 });
  }
});
