import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@barbershop/db";
import { buildApp } from "../app";
import { createBot } from "./bot";
import { escapeHtml, formatWhen, publicUrl } from "./messages";
import { noopNotifier } from "./notifier";
import { recordApiCalls, TEST_BOT_INFO, textUpdate } from "./testUtils";

const SECRET = "test-webhook-secret-123";
const silent = { warn: () => undefined, error: () => undefined };

function setup(miniAppUrl = "https://mini.example.com") {
  const prisma = {} as PrismaClient;
  const bot = createBot({
    token: "1:test",
    prisma,
    notifier: noopNotifier,
    links: { appUrl: "http://localhost:3000", miniAppUrl },
    log: silent,
    botInfo: TEST_BOT_INFO,
  });
  return { bot, prisma, calls: recordApiCalls(bot.api) };
}

describe("messages", () => {
  it("escapes HTML and accepts only public https URLs for buttons", () => {
    expect(escapeHtml("<b>A & B</b>")).toBe("&lt;b&gt;A &amp; B&lt;/b&gt;");
    expect(publicUrl("https://x.trycloudflare.com")).toBe("https://x.trycloudflare.com");
    expect(publicUrl("http://example.com")).toBeUndefined();
    expect(publicUrl("https://localhost:5173")).toBeUndefined();
  });

  it("formats time in the shop timezone", () => {
    expect(formatWhen("2026-10-06T05:00:00.000Z", "Asia/Tashkent")).toBe("Вторник, 6 октября в 10:00");
  });
});

describe("bot", () => {
  it("shows the menu with a Mini App button on /help", async () => {
    const { bot, calls } = setup();
    await bot.handleUpdate(textUpdate(7, "/help"));
    expect(calls).toHaveLength(1);
    const keyboard = (calls[0].payload.reply_markup as { keyboard: unknown[][] }).keyboard;
    expect(keyboard[0][0]).toEqual({ text: "Записаться", web_app: { url: "https://mini.example.com" } });
  });

  it("falls back to a text button when the Mini App URL is not https", async () => {
    const { bot, calls } = setup("http://localhost:5173");
    await bot.handleUpdate(textUpdate(7, "привет"));
    const keyboard = (calls[0].payload.reply_markup as { keyboard: unknown[][] }).keyboard;
    expect(keyboard[0][0]).toEqual({ text: "Записаться" });
  });
});

describe("POST /telegram/webhook", () => {
  async function appWithWebhook() {
    const { bot, prisma, calls } = setup();
    const app = await buildApp({
      prisma,
      corsOrigins: [],
      logger: false,
      telegramWebhook: { bot, secretToken: SECRET },
    });
    return { app, calls };
  }

  it("rejects updates without the secret header", async () => {
    const { app, calls } = await appWithWebhook();
    const response = await app.inject({ method: "POST", url: "/telegram/webhook", payload: textUpdate(7, "/help") });
    expect(response.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it("handles updates with the secret header", async () => {
    const { app, calls } = await appWithWebhook();
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate(7, "/help"),
    });
    expect(response.statusCode).toBe(200);
    expect(calls.map((c) => c.method)).toEqual(["sendMessage"]);
    await app.close();
  });

  it("is not registered without a configured secret", async () => {
    const app = await buildApp({ prisma: {} as PrismaClient, corsOrigins: [], logger: false });
    const response = await app.inject({ method: "POST", url: "/telegram/webhook", payload: {} });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
