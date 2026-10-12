import { defineConfig, devices } from "@playwright/test";
import { MINIAPP_API_PORT, MINIAPP_PORT, MINIAPP_TEST_BOT_TOKEN } from "./e2e/telegram-env";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const miniappURL = `http://localhost:${MINIAPP_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    channel: "chrome",
    locale: "ru-RU",
    timezoneId: "Asia/Tashkent",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /miniapp/, use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", testIgnore: /miniapp/, use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "miniapp", testMatch: /miniapp/, use: { ...devices["Pixel 7"], channel: "chrome", baseURL: miniappURL } },
  ],
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev:web",
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run start -w @barbershop/api",
      url: `http://127.0.0.1:${MINIAPP_API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: MINIAPP_API_PORT,
        TELEGRAM_BOT_TOKEN: MINIAPP_TEST_BOT_TOKEN,
        MINIAPP_URL: miniappURL,
      },
    },
    {
      command: "npm run dev:miniapp",
      url: miniappURL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        MINIAPP_PORT,
        API_PROXY_TARGET: `http://127.0.0.1:${MINIAPP_API_PORT}`,
      },
    },
  ],
});
