const TZ = "Asia/Tashkent";

const priceFormatter = new Intl.NumberFormat("ru-RU");
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shopDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const longDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export const formatPrice = (sum: number) => `${priceFormatter.format(sum)} сум`;

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export const formatLongDate = (date: string) => longDate.format(utc(date));

export function dayParts(date: string) {
  const value = utc(date);
  return {
    weekday: weekday.format(value).replace(".", ""),
    day: value.getUTCDate(),
    month: month.format(value).replace(".", ""),
  };
}

/** UTC instant → «понедельник, 6 октября, 10:00» in shop time. */
export function formatWhen(iso: string): string {
  const instant = new Date(iso);
  return `${formatLongDate(shopDay.format(instant))}, ${clock.format(instant)}`;
}

export function yearsLabel(years: number): string {
  const mod10 = years % 10;
  const mod100 = years % 100;
  if (mod10 === 1 && mod100 !== 11) return `${years} год`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${years} года`;
  return `${years} лет`;
}

/** 901234567 → «90 123-45-67» */
export function formatLocalPhone(digits: string): string {
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return parts.filter(Boolean).reduce((acc, part, index) => acc + (index === 0 ? part : index === 1 ? ` ${part}` : `-${part}`), "");
}

export function normalizeLocalDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 9 && digits.startsWith("998")) digits = digits.slice(3);
  return digits.slice(0, 9);
}
