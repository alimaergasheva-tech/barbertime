import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-admin-password-42";
/** Мутация + перерисовка страницы ходят в удалённую БД. */
const MUTATION_TIMEOUT = 20_000;
const SECTIONS = ["Записи", "Барберы", "Услуги", "График", "Исключения", "Отзывы", "Аналитика", "Настройки"];

/** Отдельный админ на проект: desktop и mobile идут параллельно. */
const adminLogin = (project: string) => `e2e-admin-${project}`;

function adminCli(args: string[]) {
  execFileSync("npm", ["run", "admin:create", "--", ...args], {
    env: { ...process.env, ADMIN_PASSWORD: PASSWORD },
    stdio: "ignore",
  });
}

async function login(page: Page, user: string, password = PASSWORD) {
  await page.goto("/admin/login");
  await page.getByLabel("Логин").fill(user);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

const shopDate = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + offsetDays * 86_400_000));

test.describe.configure({ mode: "serial" });

test.beforeAll(({}, testInfo) => adminCli([adminLogin(testInfo.project.name)]));
test.afterAll(({}, testInfo) => adminCli([adminLogin(testInfo.project.name), "--delete"]));

test("без входа админка недоступна, неверный пароль отклоняется", async ({ page }, testInfo) => {
  await page.goto("/admin/bookings");
  await expect(page).toHaveURL(/\/admin\/login$/);

  await login(page, adminLogin(testInfo.project.name), "wrong-password-000");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Неверный логин или пароль.");
});

test("админ входит, проходит по разделам, создаёт и отменяет запись", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const user = adminLogin(testInfo.project.name);
  const phone = testInfo.project.name === "mobile" ? "900000012" : "900000011";
  page.on("dialog", (dialog) => dialog.accept());

  await login(page, user);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Сегодня" })).toBeVisible();
  await expect(page.getByText(user)).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Разделы админки" });
  for (const section of SECTIONS) {
    await nav.getByRole("link", { name: section }).click();
    await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
  }

  await nav.getByRole("link", { name: "Аналитика" }).click();
  await page.getByRole("navigation", { name: "Период" }).getByRole("link", { name: "7 дней" }).click();
  await expect(page.getByRole("link", { name: "7 дней" })).toHaveAttribute("aria-current", "page");
  const kpis = page.getByRole("region", { name: "Ключевые показатели" });
  for (const kpi of ["Выручка", "Записей", "Отмены", "Неявки", "Возвращаемость"]) await expect(kpis).toContainText(kpi);
  await expect(page.getByRole("heading", { name: "Загрузка барберов" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Загрузка по дням и часам" })).toBeVisible();

  // Ручная запись: дальняя дата, последний слот и свой мастер на проект — без пересечений с другими E2E.
  await page.goto("/admin/bookings/new");
  await page.getByRole("checkbox", { name: /Мужская стрижка/ }).check();
  await page.getByLabel("Мастер").selectOption({ index: testInfo.project.name === "mobile" ? 2 : 1 });
  await page.getByLabel("Дата").fill(shopDate(5));
  await page.getByRole("button", { name: "Показать время" }).click();

  const slots = page.getByRole("radiogroup", { name: "Свободное время" }).getByRole("radio");
  await expect(slots.first()).toBeAttached();
  await slots.last().locator("xpath=ancestor::label[1]").click();

  await page.getByLabel("Имя клиента").fill("Админ E2E");
  await page.getByLabel("Телефон").fill(phone);
  await page.getByRole("button", { name: "Создать запись" }).click();
  await expect(page.getByRole("status")).toHaveText("Запись создана.", { timeout: MUTATION_TIMEOUT });

  await page.goto(`/admin/bookings?from=${shopDate(5)}&to=${shopDate(5)}&q=${phone}&status=confirmed`);
  const row = page.locator("tr[data-booking]").filter({ hasText: "Админ E2E" }).first();
  await expect(row).toContainText("Подтверждена");
  const bookingId = await row.getAttribute("data-booking");

  await row.getByRole("button", { name: "Отменить" }).click();
  await expect(page.locator(`tr[data-booking="${bookingId}"]`)).toHaveCount(0, { timeout: MUTATION_TIMEOUT });

  await page.goto(`/admin/bookings?from=${shopDate(5)}&to=${shopDate(5)}&q=${phone}&status=cancelled`);
  await expect(page.locator(`tr[data-booking="${bookingId}"]`)).toContainText("Отменена");

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});
