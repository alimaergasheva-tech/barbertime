import type { PrismaClient } from "@barbershop/db";
import { HttpError, notFound } from "../errors";
import { loadSettings, type BookingSettings } from "./settings";
import { computeStarts, overlaps, type Interval } from "./slots";
import { addDays, isoWeekday, localClock, localDate, MINUTE_MS, timeColumnMinutes, zonedToUtc } from "./time";

export const ANY_BARBER = "any";

export type QuoteItem = { serviceId: string; name: string; durationMin: number; price: number };

/** A barber able to perform every requested service, with per-barber price and duration. */
export type Candidate = {
  barberId: string;
  durationMin: number;
  price: number;
  items: QuoteItem[];
};

type MinuteRange = { start: number; end: number };

export type AvailabilityContext = {
  settings: BookingSettings;
  now: number;
  today: string;
  lastDay: string;
  candidates: Candidate[];
  hours: Map<string, Map<number, MinuteRange>>;
  breaks: Map<string, Map<number, MinuteRange[]>>;
  timeOff: (Interval & { barberId: string | null })[];
  bookings: (Interval & { barberId: string })[];
};

export type LoadParams = {
  serviceIds: string[];
  barberId: string;
  from: string;
  to: string;
  /** Booking being rescheduled: its own time must not block the new one. */
  excludeBookingId?: string;
  now?: number;
  settings?: BookingSettings;
};

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export async function loadAvailabilityContext(
  prisma: PrismaClient,
  params: LoadParams,
): Promise<AvailabilityContext> {
  const settings = params.settings ?? (await loadSettings(prisma));
  const now = params.now ?? Date.now();
  const tz = settings.timezone;
  const today = localDate(now, tz);
  const lastDay = addDays(today, settings.horizonDays - 1);
  const serviceIds = [...new Set(params.serviceIds)];

  const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, isActive: true } });
  if (services.length !== serviceIds.length) {
    throw new HttpError(422, "UNKNOWN_SERVICE", "One or more services do not exist or are inactive");
  }
  const orderedServices = serviceIds.map((id) => services.find((service) => service.id === id)!);

  const isAny = params.barberId === ANY_BARBER;
  const barbers = await prisma.barber.findMany({
    where: { isActive: true, ...(isAny ? {} : { id: params.barberId }) },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      services: { where: { serviceId: { in: serviceIds }, isEnabled: true } },
    },
  });
  if (!isAny && barbers.length === 0) throw notFound(`Barber "${params.barberId}" not found`);

  const candidates: Candidate[] = barbers
    .filter((barber) => barber.services.length === serviceIds.length)
    .map((barber) => {
      const items = orderedServices.map((service) => {
        const override = barber.services.find((item) => item.serviceId === service.id);
        return {
          serviceId: service.id,
          name: service.name,
          durationMin: override?.durationMin ?? service.durationMin,
          price: override?.price ?? service.price,
        };
      });
      return {
        barberId: barber.id,
        items,
        durationMin: items.reduce((sum, item) => sum + item.durationMin, 0),
        price: items.reduce((sum, item) => sum + item.price, 0),
      };
    });
  if (!isAny && candidates.length === 0) {
    throw new HttpError(422, "SERVICE_NOT_PROVIDED", "The barber does not perform all selected services");
  }

  const context: AvailabilityContext = {
    settings,
    now,
    today,
    lastDay,
    candidates,
    hours: new Map(),
    breaks: new Map(),
    timeOff: [],
    bookings: [],
  };
  if (candidates.length === 0) return context;

  const ids = candidates.map((candidate) => candidate.barberId);
  const rangeStart = new Date(zonedToUtc(params.from, 0, tz));
  const rangeEnd = new Date(zonedToUtc(addDays(params.to, 1), 0, tz));

  const [hours, breaks, timeOff, bookings] = await Promise.all([
    prisma.workingHours.findMany({ where: { barberId: { in: ids } } }),
    prisma.break.findMany({ where: { barberId: { in: ids } } }),
    prisma.timeOff.findMany({
      where: {
        OR: [{ barberId: { in: ids } }, { barberId: null }],
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
    }),
    prisma.booking.findMany({
      where: {
        barberId: { in: ids },
        status: "confirmed",
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...(params.excludeBookingId ? { id: { not: params.excludeBookingId } } : {}),
      },
      select: { barberId: true, startsAt: true, endsAt: true },
    }),
  ]);

  for (const row of hours) {
    const byDay = context.hours.get(row.barberId) ?? new Map<number, MinuteRange>();
    byDay.set(row.weekday, { start: timeColumnMinutes(row.startTime), end: timeColumnMinutes(row.endTime) });
    context.hours.set(row.barberId, byDay);
  }
  for (const row of breaks) {
    const byDay = context.breaks.get(row.barberId) ?? new Map<number, MinuteRange[]>();
    pushTo(byDay, row.weekday, { start: timeColumnMinutes(row.startTime), end: timeColumnMinutes(row.endTime) });
    context.breaks.set(row.barberId, byDay);
  }
  context.timeOff = timeOff.map((row) => ({
    barberId: row.barberId,
    start: row.startsAt.getTime(),
    end: row.endsAt.getTime(),
  }));
  context.bookings = bookings.map((row) => ({
    barberId: row.barberId,
    start: row.startsAt.getTime(),
    end: row.endsAt.getTime(),
  }));

  return context;
}

/** Free start instants for a shop-local date → barber ids (in display order) free at that start. */
export function slotsForDay(
  context: AvailabilityContext,
  date: string,
  options: { ignoreBookings?: boolean } = {},
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (date < context.today || date > context.lastDay) return result;

  const { timezone: tz, minNoticeMin, slotStepMin } = context.settings;
  const weekday = isoWeekday(date);
  const notBefore = context.now + minNoticeMin * MINUTE_MS;

  for (const candidate of context.candidates) {
    const hours = context.hours.get(candidate.barberId)?.get(weekday);
    if (!hours) continue;

    const toInterval = (range: MinuteRange): Interval => ({
      start: zonedToUtc(date, range.start, tz),
      end: zonedToUtc(date, range.end, tz),
    });
    const blocked: Interval[] = [
      ...(context.breaks.get(candidate.barberId)?.get(weekday) ?? []).map(toInterval),
      ...context.timeOff.filter((item) => item.barberId === null || item.barberId === candidate.barberId),
      ...(options.ignoreBookings ? [] : context.bookings.filter((item) => item.barberId === candidate.barberId)),
    ];

    const starts = computeStarts({
      work: toInterval(hours),
      blocked,
      durationMin: candidate.durationMin,
      stepMin: slotStepMin,
      notBefore,
    });
    for (const start of starts) pushTo(result, start, candidate.barberId);
  }

  return new Map([...result.entries()].sort(([a], [b]) => a - b));
}

export function serializeSlots(context: AvailabilityContext, slots: Map<number, string[]>) {
  return [...slots.entries()].map(([start, barberIds]) => ({
    time: localClock(start, context.settings.timezone),
    startsAt: new Date(start).toISOString(),
    barberIds,
  }));
}

export function horizonDays(context: AvailabilityContext): string[] {
  const days: string[] = [];
  for (let date = context.today; date <= context.lastDay; date = addDays(date, 1)) days.push(date);
  return days;
}

/**
 * Barbers (in preference order) that can take a booking starting exactly at `start`.
 * Throws the precise business error when nobody can.
 */
export function resolveStart(context: AvailabilityContext, start: number): string[] {
  const { minNoticeMin, timezone } = context.settings;
  if (start < context.now + minNoticeMin * MINUTE_MS) {
    throw new HttpError(422, "TOO_SOON", `Bookings need at least ${minNoticeMin} minutes notice`);
  }
  const date = localDate(start, timezone);
  if (date > context.lastDay) {
    throw new HttpError(422, "TOO_FAR", `Bookings are open ${context.settings.horizonDays} days ahead`);
  }

  const free = slotsForDay(context, date).get(start);
  if (free?.length) return free;

  const workable = slotsForDay(context, date, { ignoreBookings: true }).get(start);
  if (!workable?.length) {
    throw new HttpError(422, "OUTSIDE_WORKING_HOURS", "The selected time is outside working hours");
  }
  throw slotTaken();
}

/**
 * Admin bookings: any minute (walk-ins, past visits) within working hours, outside breaks
 * and time off, without notice/horizon/grid rules. Overlaps are still rejected.
 */
export function resolveAdminStart(context: AvailabilityContext, start: number): string[] {
  const { timezone: tz } = context.settings;
  const date = localDate(start, tz);
  const weekday = isoWeekday(date);
  const free: string[] = [];
  let workable = false;

  for (const candidate of context.candidates) {
    const hours = context.hours.get(candidate.barberId)?.get(weekday);
    if (!hours) continue;
    const slot = { start, end: start + candidate.durationMin * MINUTE_MS };
    const work = { start: zonedToUtc(date, hours.start, tz), end: zonedToUtc(date, hours.end, tz) };
    if (slot.start < work.start || slot.end > work.end) continue;

    const blocked: Interval[] = [
      ...(context.breaks.get(candidate.barberId)?.get(weekday) ?? []).map((range) => ({
        start: zonedToUtc(date, range.start, tz),
        end: zonedToUtc(date, range.end, tz),
      })),
      ...context.timeOff.filter((item) => item.barberId === null || item.barberId === candidate.barberId),
    ];
    if (blocked.some((item) => overlaps(item, slot))) continue;
    workable = true;

    const busy = context.bookings.some((item) => item.barberId === candidate.barberId && overlaps(item, slot));
    if (!busy) free.push(candidate.barberId);
  }

  if (free.length) return free;
  if (!workable) throw new HttpError(422, "OUTSIDE_WORKING_HOURS", "The selected time is outside working hours");
  throw slotTaken();
}

export const slotTaken = () => new HttpError(409, "SLOT_TAKEN", "The selected time has just been taken");
