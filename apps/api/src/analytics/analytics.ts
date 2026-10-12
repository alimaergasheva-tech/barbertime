import type { PrismaClient } from "@barbershop/db";
import { addDays, DAY_MS, isoWeekday, localClock, localDate, timeColumnMinutes, zonedToUtc } from "../booking/time";

/** Shop-local dates, both inclusive; bookings belong to the period by their start time. */
export type Period = { from: string; to: string };

const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const ratio = (part: number, whole: number) => (whole > 0 ? round(part / whole) : null);

function bounds({ from, to }: Period, tz: string) {
  return { start: new Date(zonedToUtc(from, 0, tz)), end: new Date(zonedToUtc(addDays(to, 1), 0, tz)) };
}

function datesOf({ from, to }: Period): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function periodDays({ from, to }: Period): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The same number of days right before the period. */
export function previousPeriod(period: Period): Period {
  const days = periodDays(period);
  return { from: addDays(period.from, -days), to: addDays(period.from, -1) };
}

function periodBookings(prisma: PrismaClient, period: Period, tz: string) {
  const { start, end } = bounds(period, tz);
  return prisma.booking.findMany({
    where: { startsAt: { gte: start, lt: end } },
    select: {
      id: true,
      clientId: true,
      barberId: true,
      startsAt: true,
      totalPrice: true,
      totalDurationMin: true,
      status: true,
      source: true,
      services: { select: { serviceId: true, name: true, price: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

// ---------- revenue ----------

export async function revenue(prisma: PrismaClient, period: Period, tz: string) {
  const before = bounds(previousPeriod(period), tz);
  const [bookings, previous] = await Promise.all([
    periodBookings(prisma, period, tz),
    prisma.booking.aggregate({
      where: { status: "completed", startsAt: { gte: before.start, lt: before.end } },
      _sum: { totalPrice: true },
      _count: true,
    }),
  ]);
  const completed = bookings.filter((b) => b.status === "completed");
  const byDay = new Map(datesOf(period).map((date) => [date, { date, revenue: 0, completed: 0 }]));
  for (const booking of completed) {
    const day = byDay.get(localDate(booking.startsAt.getTime(), tz));
    if (!day) continue;
    day.revenue += booking.totalPrice;
    day.completed += 1;
  }
  const total = completed.reduce((sum, b) => sum + b.totalPrice, 0);
  return {
    total,
    completed: completed.length,
    averageCheck: completed.length ? Math.round(total / completed.length) : 0,
    previousTotal: previous._sum.totalPrice ?? 0,
    previousCompleted: previous._count,
    days: [...byDay.values()],
  };
}

// ---------- statuses: bookings count, cancellations, no-shows ----------

export async function cancellations(prisma: PrismaClient, period: Period, tz: string) {
  const bookings = await periodBookings(prisma, period, tz);
  const count = (status: string) => bookings.filter((b) => b.status === status).length;
  const completed = count("completed");
  const cancelled = count("cancelled");
  const noShow = count("no_show");
  const bySource = { web: 0, telegram: 0, admin: 0 };
  for (const booking of bookings) bySource[booking.source] += 1;
  return {
    total: bookings.length,
    confirmed: count("confirmed"),
    completed,
    cancelled,
    noShow,
    /** Share of all bookings of the period. */
    cancelRate: ratio(cancelled, bookings.length),
    /** Share of visits that should have happened (completed + no-show). */
    noShowRate: ratio(noShow, completed + noShow),
    bySource,
  };
}

// ---------- services ----------

export async function popularServices(prisma: PrismaClient, period: Period, tz: string) {
  const bookings = await periodBookings(prisma, period, tz);
  const stats = new Map<string, { serviceId: string; name: string; count: number; revenue: number }>();
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    for (const service of booking.services) {
      const row = stats.get(service.serviceId) ?? { serviceId: service.serviceId, name: service.name, count: 0, revenue: 0 };
      row.count += 1;
      if (booking.status === "completed") row.revenue += service.price;
      stats.set(service.serviceId, row);
    }
  }
  return [...stats.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.name.localeCompare(b.name));
}

// ---------- barber load ----------

type Interval = [number, number];

/** Total length of `base` not covered by `cuts`. */
function freeMinutes(base: Interval, cuts: Interval[]): number {
  let free = base[1] - base[0];
  const clipped = cuts
    .map(([s, e]): Interval => [Math.max(s, base[0]), Math.min(e, base[1])])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let cursor = base[0];
  for (const [s, e] of clipped) {
    const from = Math.max(s, cursor);
    if (e > from) {
      free -= e - from;
      cursor = e;
    }
  }
  return free;
}

export async function barberLoad(prisma: PrismaClient, period: Period, tz: string) {
  const { start, end } = bounds(period, tz);
  const [bookings, barbers, timeOff] = await Promise.all([
    periodBookings(prisma, period, tz),
    prisma.barber.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true, workingHours: true, breaks: true },
    }),
    prisma.timeOff.findMany({ where: { startsAt: { lt: end }, endsAt: { gt: start } } }),
  ]);
  const dates = datesOf(period);

  return barbers
    .map((barber) => {
      const own = timeOff.filter((t) => t.barberId === null || t.barberId === barber.id);
      let availableMin = 0;
      for (const date of dates) {
        const weekday = isoWeekday(date);
        const hours = barber.workingHours.find((h) => h.weekday === weekday);
        if (!hours) continue;
        const toUtc = (minutes: number) => zonedToUtc(date, minutes, tz);
        const day: Interval = [toUtc(timeColumnMinutes(hours.startTime)), toUtc(timeColumnMinutes(hours.endTime))];
        const cuts: Interval[] = [
          ...barber.breaks
            .filter((b) => b.weekday === weekday)
            .map((b): Interval => [toUtc(timeColumnMinutes(b.startTime)), toUtc(timeColumnMinutes(b.endTime))]),
          ...own.map((t): Interval => [t.startsAt.getTime(), t.endsAt.getTime()]),
        ];
        availableMin += freeMinutes(day, cuts) / 60_000;
      }

      const mine = bookings.filter((b) => b.barberId === barber.id);
      const occupied = mine.filter((b) => b.status !== "cancelled");
      const completed = mine.filter((b) => b.status === "completed");
      const bookedMin = occupied.reduce((sum, b) => sum + b.totalDurationMin, 0);
      return {
        barberId: barber.id,
        name: barber.name,
        isActive: barber.isActive,
        availableMin: Math.round(availableMin),
        bookedMin,
        load: ratio(bookedMin, availableMin),
        bookings: mine.length,
        completed: completed.length,
        revenue: completed.reduce((sum, b) => sum + b.totalPrice, 0),
        cancelled: mine.filter((b) => b.status === "cancelled").length,
        noShow: mine.filter((b) => b.status === "no_show").length,
      };
    })
    .filter((row) => row.isActive || row.bookings > 0);
}

// ---------- heatmap ----------

export async function heatmap(prisma: PrismaClient, period: Period, tz: string) {
  const bookings = await periodBookings(prisma, period, tz);
  const cells = new Map<string, { weekday: number; hour: number; count: number }>();
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    const instant = booking.startsAt.getTime();
    const weekday = isoWeekday(localDate(instant, tz));
    const hour = Number(localClock(instant, tz).slice(0, 2));
    const key = `${weekday}:${hour}`;
    const cell = cells.get(key) ?? { weekday, hour, count: 0 };
    cell.count += 1;
    cells.set(key, cell);
  }
  const list = [...cells.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
  return { cells: list, max: list.reduce((max, c) => Math.max(max, c.count), 0) };
}

// ---------- retention ----------

/** Among clients with a completed visit in the period: who had visited before or came at least twice. */
export async function retention(prisma: PrismaClient, period: Period, tz: string) {
  const { start } = bounds(period, tz);
  const bookings = (await periodBookings(prisma, period, tz)).filter((b) => b.status === "completed");
  const visits = new Map<string, number>();
  for (const booking of bookings) visits.set(booking.clientId, (visits.get(booking.clientId) ?? 0) + 1);

  const earlier = visits.size
    ? await prisma.booking.findMany({
        where: { status: "completed", startsAt: { lt: start }, clientId: { in: [...visits.keys()] } },
        select: { clientId: true },
        distinct: ["clientId"],
      })
    : [];
  const visitedBefore = new Set(earlier.map((b) => b.clientId));

  const clients = visits.size;
  const returningClients = [...visits.keys()].filter((id) => visitedBefore.has(id) || visits.get(id)! >= 2).length;
  const repeatInPeriod = [...visits.values()].filter((count) => count >= 2).length;
  return {
    clients,
    newClients: [...visits.keys()].filter((id) => !visitedBefore.has(id)).length,
    returningClients,
    returningRate: ratio(returningClients, clients),
    repeatInPeriod,
    visitsPerClient: clients ? round(bookings.length / clients, 2) : 0,
  };
}
