export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(map: Map<string, Intl.DateTimeFormat>, tz: string, make: () => Intl.DateTimeFormat) {
  let formatter = map.get(tz);
  if (!formatter) {
    formatter = make();
    map.set(tz, formatter);
  }
  return formatter;
}

/** UTC offset of `tz` at the given instant, in ms (e.g. +5h for Asia/Tashkent). */
export function tzOffsetMs(tz: string, instant: number): number {
  const formatter = cached(
    offsetFormatters,
    tz,
    () => new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }),
  );
  const name = formatter.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * MINUTE_MS;
}

/** Shop-local calendar date + minutes since local midnight → UTC epoch ms. */
export function zonedToUtc(date: string, minutes: number, tz: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, 0, minutes);
  const firstGuess = wallClock - tzOffsetMs(tz, wallClock);
  return wallClock - tzOffsetMs(tz, firstGuess);
}

/** Shop-local calendar date (YYYY-MM-DD) of an instant. */
export function localDate(instant: number, tz: string): string {
  const formatter = cached(
    dateFormatters,
    tz,
    () => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }),
  );
  return formatter.format(instant);
}

/** Shop-local wall clock (HH:MM) of an instant. */
export function localClock(instant: number, tz: string): string {
  const formatter = cached(
    clockFormatters,
    tz,
    () => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  );
  return formatter.format(instant);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/** Minutes since midnight of a Postgres TIME value (Prisma maps it to 1970-01-01T…Z). */
export function timeColumnMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}
