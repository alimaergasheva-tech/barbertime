export const SHOP_TIMEZONE = "Asia/Tashkent";
export const BOOKING_HORIZON_DAYS = 30;

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Календарная дата в барбершопе в формате YYYY-MM-DD. */
export function todayInShop(now: Date = new Date()): string {
  return isoDateFormatter.format(now);
}

/** UTC ISO instant → shop-local HH:MM */
export function shopClock(iso: string): string {
  return clockFormatter.format(new Date(iso));
}

/** UTC ISO instant → shop-local YYYY-MM-DD */
export function shopDate(iso: string): string {
  return todayInShop(new Date(iso));
}

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: string, days: number): string {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function upcomingDates(count: number, from: string = todayInShop()): string[] {
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

const weekdayShort = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function dateParts(date: string) {
  const value = toUtcDate(date);
  return {
    weekday: weekdayShort.format(value).replace(".", ""),
    day: value.getUTCDate(),
    month: monthShort.format(value).replace(".", ""),
  };
}

export function formatLongDate(date: string): string {
  return longDate.format(toUtcDate(date));
}

export function isTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
