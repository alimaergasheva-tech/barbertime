import { expect, test, type Locator, type Page } from "@playwright/test";

const next = (page: Page) => page.getByRole("button", { name: "Далее" }).click();

/** Поля визуально скрыты, пользователь кликает по их подписи. */
async function pick(input: Locator) {
  await input.locator("xpath=ancestor::label[1]").click();
  await expect(input).toBeChecked();
}

const apiPath = (path: string) => (url: URL) => url.pathname === `/api/v1${path}`;

/** Первая дата, где по данным API есть свободное время. */
async function pickFirstFreeDate(page: Page) {
  await expect(page.locator('fieldset[data-availability="ready"]')).toBeVisible();
  await pick(page.locator('input[name="date"]:not([disabled])').first());
}

/** Desktop и mobile идут параллельно — берут разные слоты, чтобы не спорить за один. */
async function pickTime(page: Page, preferredIndex: number) {
  const times = page.locator('input[name="time"]');
  await expect(times.first()).toBeAttached();
  const count = await times.count();
  await pick(times.nth(Math.min(preferredIndex, count - 1)));
}

const slotIndex = (projectName: string) => (projectName === "mobile" ? 2 : 0);

async function chooseUntilContacts(page: Page, timeIndex = 0) {
  await pick(page.getByRole("checkbox", { name: /Мужская стрижка/ }));
  await next(page);

  await pick(page.getByRole("radio", { name: /Любой свободный/ }));
  await next(page);

  await pickFirstFreeDate(page);
  await next(page);

  await pickTime(page, timeIndex);
  await next(page);
}

async function fillContacts(page: Page, phone = "900000001") {
  await page.getByLabel("Имя").fill("Тест E2E");
  await page.getByLabel("Телефон").fill(phone);
  await next(page);
}

test("клиент записывается, переносит и отменяет запись", async ({ page }, testInfo) => {
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Выберите услуги" })).toBeVisible();

  const index = slotIndex(testInfo.project.name);
  await chooseUntilContacts(page, index);

  await next(page);
  await expect(page.getByText("Введите имя — хотя бы две буквы.")).toBeVisible();
  await expect(page.getByText("Введите 9 цифр номера после +998.")).toBeVisible();

  await fillContacts(page, testInfo.project.name === "mobile" ? "900000002" : "900000001");
  await expect(page.getByRole("heading", { name: "Проверьте запись" })).toBeVisible();

  await page.getByRole("button", { name: "Записаться" }).click();
  await expect(page.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("success.png"), fullPage: true });

  await page.getByRole("link", { name: "Управлять записью" }).click();
  await expect(page.getByRole("heading", { name: "Ваша запись" })).toBeVisible();
  await expect(page.getByText("Подтверждена")).toBeVisible();
  const originalWhen = await page.locator("p").filter({ hasText: /, \d{2}:\d{2}$/ }).first().textContent();

  await page.getByRole("button", { name: "Перенести" }).click();
  await pickFirstFreeDate(page);
  await pickTime(page, index + 1);
  await page.getByRole("button", { name: "Перенести на это время" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Запись перенесена" })).toBeVisible();
  const movedWhen = await page.locator("p").filter({ hasText: /, \d{2}:\d{2}$/ }).first().textContent();
  expect(movedWhen).not.toBe(originalWhen);
  await page.screenshot({ path: testInfo.outputPath("rescheduled.png"), fullPage: true });

  await page.getByRole("button", { name: "Отменить запись" }).click();
  await page.getByRole("button", { name: "Да, отменить" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Запись отменена" })).toBeVisible();
  await expect(page.getByText("Отменена", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Перенести" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Отменена", { exact: true })).toBeVisible();
});

test("занятый слот возвращает на выбор времени", async ({ page }) => {
  await page.route(apiPath("/bookings"), (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 409, json: { code: "SLOT_TAKEN", message: "taken" } })
      : route.fallback(),
  );
  await page.goto("/book");
  await chooseUntilContacts(page);
  await fillContacts(page);

  await page.getByRole("button", { name: "Записаться" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Это время только что заняли" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Выберите время" })).toBeVisible();
});

test("ошибка загрузки слотов предлагает повторить", async ({ page }, testInfo) => {
  await page.route(apiPath("/availability"), (route) =>
    route.fulfill({ status: 500, json: { code: "INTERNAL_ERROR", message: "boom" } }),
  );
  await page.goto("/book?service=haircut&barber=timur");
  await pickFirstFreeDate(page);
  await next(page);

  await expect(
    page.getByRole("alert").filter({ hasText: "Не удалось загрузить свободное время" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("error.png"), fullPage: true });
});

test("мастер без нужной услуги недоступен", async ({ page }) => {
  await page.goto("/book?service=kids");
  await expect(page.getByRole("heading", { name: "Выберите мастера" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Рустам/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Жасур/ })).toBeEnabled();
});

test("неизвестная ссылка на запись показывает 404", async ({ page }) => {
  await page.goto("/booking/unknown-token-1234567890");
  await expect(page.getByRole("heading", { name: "Запись не найдена" })).toBeVisible();
});
