import type { BookingSource, BookingStatus, TimeOffType } from "./types";

export const SHOP_TZ = "Asia/Tashkent";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Неявка",
};

export const SOURCE_LABEL: Record<BookingSource, string> = { web: "Сайт", telegram: "Telegram", admin: "Админ" };

export const TIME_OFF_LABEL: Record<TimeOffType, string> = {
  day_off: "Выходной",
  vacation: "Отпуск",
  sick: "Больничный",
  holiday: "Праздник",
  other: "Другое",
};

export const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const ERRORS: Record<string, string> = {
  SLOT_TAKEN: "Это время уже занято у мастера.",
  OUTSIDE_WORKING_HOURS: "Время вне рабочего графика мастера (или попадает на обед / исключение).",
  UNKNOWN_SERVICE: "Услуга не найдена или отключена.",
  SERVICE_NOT_PROVIDED: "Мастер не выполняет выбранные услуги.",
  NOT_ACTIVE: "Запись уже неактивна.",
  NOT_FOUND: "Не найдено — возможно, уже удалено.",
  VALIDATION_ERROR: "Проверьте заполнение полей.",
  STORAGE_NOT_CONFIGURED: "Хранилище фото не настроено (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
  STORAGE_ERROR: "Не удалось загрузить файл в хранилище.",
  UNSUPPORTED_IMAGE: "Загрузите изображение JPEG, PNG или WebP.",
  IMAGE_TOO_LARGE: "Файл больше 5 МБ.",
  PORTFOLIO_FULL: "В портфолио уже 24 фото.",
  INVALID_CREDENTIALS: "Неверный логин или пароль.",
  TOO_MANY_ATTEMPTS: "Слишком много попыток. Попробуйте через 15 минут.",
  API_UNREACHABLE: "Сервер недоступен. Попробуйте позже.",
};

export function errorText(code: string): string {
  return ERRORS[code] ?? "Не удалось сохранить. Попробуйте ещё раз.";
}

const dateTime = new Intl.DateTimeFormat("ru-RU", { timeZone: SHOP_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const clock = new Intl.DateTimeFormat("ru-RU", { timeZone: SHOP_TZ, hour: "2-digit", minute: "2-digit" });
const dayLong = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shopDay = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatClock = (iso: string) => clock.format(new Date(iso));
export const formatDay = (date: string) => dayLong.format(new Date(`${date}T00:00:00Z`));
export const shopDate = (iso: string | Date = new Date()) => shopDay.format(new Date(iso));
export const formatSum = (sum: number) => `${new Intl.NumberFormat("ru-RU").format(sum)} сум`;

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });
export const formatPercent = (value: number | null) => (value === null ? "—" : percent.format(value));
export const formatHours = (minutes: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(minutes / 60)} ч`;

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Shop-local date + HH:MM → ISO with the shop offset (Asia/Tashkent has no DST). */
export const shopIso = (date: string, time: string) => `${date}T${time}:00+05:00`;
