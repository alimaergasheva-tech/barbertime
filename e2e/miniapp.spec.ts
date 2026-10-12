import { expect, test, type Page } from "@playwright/test";
import { signInitData } from "../apps/api/src/telegram/initData";
import { MINIAPP_TEST_BOT_TOKEN } from "./telegram-env";

const TELEGRAM_USER = { id: 990_000_777, first_name: "Тест", username: "e2e_tester" };
const PHONE = "900000003";

function initDataFor(botToken: string) {
  return signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "e2e",
      user: JSON.stringify(TELEGRAM_USER),
    },
    botToken,
  );
}

/** Replaces telegram-web-app.js with a stub that records calls made by the app. */
async function openInTelegram(page: Page, initData: string) {
  await page.addInitScript(
    ({ initData, user }) => {
      const calls: string[] = [];
      let backHandler: (() => void) | null = null;
      Object.assign(window, {
        __tgCalls: calls,
        __tgBack: () => backHandler?.(),
        Telegram: {
          WebApp: {
            initData,
            initDataUnsafe: { user },
            version: "8.0",
            colorScheme: "light",
            themeParams: { button_color: "#2481cc", button_text_color: "#ffffff" },
            ready: () => calls.push("ready"),
            expand: () => calls.push("expand"),
            isVersionAtLeast: () => true,
            onEvent: () => undefined,
            BackButton: {
              show: () => calls.push("back:show"),
              hide: () => calls.push("back:hide"),
              onClick: (handler: () => void) => (backHandler = handler),
              offClick: () => (backHandler = null),
            },
            HapticFeedback: {
              impactOccurred: () => undefined,
              notificationOccurred: (type: string) => calls.push(`haptic:${type}`),
              selectionChanged: () => undefined,
            },
            showConfirm: (_message: string, callback: (ok: boolean) => void) => {
              calls.push("confirm");
              callback(true);
            },
          },
        },
      });
    },
    { initData, user: TELEGRAM_USER },
  );
  await page.goto("/");
}

const tgCalls = (page: Page) => page.evaluate(() => (window as unknown as { __tgCalls: string[] }).__tgCalls);

async function pickDayAndTime(page: Page, timeIndex: number) {
  await page.locator('.days[data-ready] .day:not([disabled])').first().click();
  const times = page.locator('.times[role="radiogroup"] button.time');
  await expect(times.first()).toBeVisible();
  const count = await times.count();
  await times.nth(Math.min(timeIndex, count - 1)).click();
}

/** The phone-prefill test relies on the client linked by the booking test. */
test.describe.configure({ mode: "default" });

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
});

test("Telegram: запись, перенос и отмена в «Мои записи»", async ({ page }) => {
  await openInTelegram(page, initDataFor(MINIAPP_TEST_BOT_TOKEN));
  expect(await tgCalls(page)).toEqual(expect.arrayContaining(["ready", "expand"]));
  await expect(page.getByText(/Откройте приложение через бота/)).toHaveCount(0);

  await page.getByRole("checkbox", { name: /Мужская стрижка/ }).check();
  await page.getByRole("button", { name: "Далее" }).click();
  expect(await tgCalls(page)).toContain("back:show");

  await page.getByRole("radio", { name: /Любой свободный/ }).check();
  await page.getByRole("button", { name: "Далее" }).click();

  await pickDayAndTime(page, 4);
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByLabel("Имя")).toHaveValue(/.{2,}/);
  await page.getByLabel("Телефон").fill(PHONE);
  await page.getByRole("main").getByRole("button", { name: "Записаться" }).click();

  await expect(page.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  expect(await tgCalls(page)).toContain("haptic:success");

  await page.getByRole("main").getByRole("button", { name: "Мои записи" }).click();
  const card = page.locator(".booking").first();
  await expect(card).toContainText("Мужская стрижка");
  await expect(card).toContainText("Подтверждена");

  await card.getByRole("button", { name: "Перенести" }).click();
  await expect(page.getByRole("heading", { name: "Перенос записи" })).toBeVisible();
  await pickDayAndTime(page, 7);
  await page.getByRole("main").getByRole("button", { name: "Перенести" }).click();
  await expect(page.getByRole("status")).toContainText("Запись перенесена");

  await page.locator(".booking").first().getByRole("button", { name: "Отменить" }).click();
  await expect(page.getByRole("status")).toContainText("Запись отменена");
  expect(await tgCalls(page)).toContain("confirm");
});

test("Telegram: телефон подставляется из прошлой записи", async ({ page }) => {
  await openInTelegram(page, initDataFor(MINIAPP_TEST_BOT_TOKEN));
  await page.getByRole("checkbox", { name: /Мужская стрижка/ }).check();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("radio", { name: /Любой свободный/ }).check();
  await page.getByRole("button", { name: "Далее" }).click();
  await pickDayAndTime(page, 0);
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByLabel("Телефон")).toHaveValue("90 000-00-03");
  await expect(page.getByLabel("Имя")).toHaveValue("Тест");
});

test("поддельная подпись initData отклоняется", async ({ page }) => {
  await openInTelegram(page, initDataFor("000000:forged-token"));
  await page.getByRole("button", { name: "Мои записи" }).click();
  await expect(page.getByRole("alert")).toContainText("Сессия Telegram устарела");
});

test("вне Telegram: баннер и запись без «Мои записи»", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Откройте приложение через бота/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Мужская стрижка/ })).toBeVisible();
  await page.getByRole("button", { name: "Мои записи" }).click();
  await expect(page.getByText("Список записей доступен, когда приложение открыто в Telegram.")).toBeVisible();
});
