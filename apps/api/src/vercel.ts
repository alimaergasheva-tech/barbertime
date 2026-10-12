import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { loadEnv } from "./env";
import { createServerApp } from "./serverApp";

// One app per function instance; Fluid compute reuses it across requests.
const ready = createServerApp(loadEnv(), { max: 3 }).then(async (server) => {
  await server.app.ready();
  return server;
});

/** Vercel Node.js handler: hands the raw request to Fastify. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { app, notifier } = await ready;
  // Telegram notifications are fire-and-forget; keep the instance alive until they are sent.
  waitUntil(new Promise<void>((resolve) => res.once("close", resolve)).then(() => notifier.idle()));
  app.server.emit("request", req, res);
}
