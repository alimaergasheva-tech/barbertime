import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "@barbershop/db";
import { buildApp } from "../app";
import { hashPassword } from "../admin/auth";
import { zonedToUtc } from "../booking/time";

const url = process.env.TEST_DATABASE_URL;

const TZ = "Asia/Tashkent";
const LOGIN = "test-admin-analytics";
const PASSWORD = "analytics password 1";
const PHONE_PREFIX = "+99800004";
const A = "an-test-a";
const B = "an-test-b";
const CUT = { serviceId: "an-test-cut", name: "Тест стрижка", durationMin: 60, price: 100_000 };
const BEARD = { serviceId: "an-test-beard", name: "Тест борода", durationMin: 30, price: 50_000 };

/** Mon 2020-03-02 … Sun 2020-03-08 — a past week with no other data. */
const PERIOD = "from=2020-03-02&to=2020-03-08";
const time = (date: string, clock: string) => new Date(zonedToUtc(date, Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3)), TZ));
const column = (clock: string) => new Date(`1970-01-01T${clock}:00Z`);

describe.skipIf(!url)("admin analytics (integration)", { timeout: 30_000 }, () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: { authorization: string };
  let holidayId: string;
  const clients: Record<string, string> = {};

  const get = async (section: string, query = PERIOD) => {
    const response = await app.inject({ url: `/api/v1/admin/analytics/${section}?${query}`, headers: auth });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data;
  };

  async function book(
    barberId: string,
    client: string,
    date: string,
    clock: string,
    services: (typeof CUT)[],
    status: "confirmed" | "completed" | "cancelled" | "no_show",
    source: "web" | "telegram" | "admin",
  ) {
    const startsAt = time(date, clock);
    const duration = services.reduce((sum, s) => sum + s.durationMin, 0);
    await prisma.booking.create({
      data: {
        clientId: clients[client],
        barberId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + duration * 60_000),
        totalDurationMin: duration,
        totalPrice: services.reduce((sum, s) => sum + s.price, 0),
        status,
        source,
        manageToken: randomUUID(),
        services: { create: services },
      },
    });
  }

  beforeAll(async () => {
    prisma = createPrismaClient(url, { max: Number(process.env.TEST_DB_POOL_MAX ?? 1) });
    await prisma.adminUser.upsert({
      where: { login: LOGIN },
      create: { login: LOGIN, passwordHash: await hashPassword(PASSWORD) },
      update: { passwordHash: await hashPassword(PASSWORD) },
    });
    app = await buildApp({ prisma, corsOrigins: [], logger: false });
    const login = await app.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login: LOGIN, password: PASSWORD } });
    auth = { authorization: `Bearer ${login.json().token}` };

    for (const { serviceId, name, durationMin, price } of [CUT, BEARD]) {
      await prisma.service.create({ data: { id: serviceId, name, durationMin, price } });
    }
    // A: Mon–Fri 10–20 with lunch 14–15 (540 min/day). B: Saturday 11–19 (480 min).
    await prisma.barber.create({
      data: {
        id: A,
        name: "Аналитик А",
        sortOrder: 900,
        workingHours: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: column("10:00"), endTime: column("20:00") })) },
        breaks: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: column("14:00"), endTime: column("15:00") })) },
      },
    });
    await prisma.barber.create({
      data: { id: B, name: "Аналитик Б", sortOrder: 901, workingHours: { create: { weekday: 6, startTime: column("11:00"), endTime: column("19:00") } } },
    });
    // A on vacation on Wednesday; the whole shop closed Friday 10–12.
    await prisma.timeOff.create({ data: { barberId: A, startsAt: time("2020-03-04", "00:00"), endsAt: time("2020-03-05", "00:00"), type: "vacation" } });
    holidayId = (await prisma.timeOff.create({ data: { barberId: null, startsAt: time("2020-03-06", "10:00"), endsAt: time("2020-03-06", "12:00"), type: "holiday" } })).id;

    for (const key of ["c1", "c2", "c3"]) {
      clients[key] = (await prisma.client.create({ data: { name: `Клиент ${key}`, phone: `${PHONE_PREFIX}00${key.slice(1)}0` } })).id;
    }

    // Previous week: c1 already visited.
    await book(A, "c1", "2020-02-28", "10:00", [BEARD], "completed", "web");
    // The period.
    await book(A, "c1", "2020-03-02", "10:00", [CUT], "completed", "web");
    await book(A, "c2", "2020-03-02", "12:00", [CUT, BEARD], "completed", "telegram");
    await book(A, "c3", "2020-03-03", "10:00", [BEARD], "cancelled", "web");
    await book(A, "c2", "2020-03-05", "16:00", [CUT], "completed", "admin");
    await book(A, "c3", "2020-03-05", "18:00", [CUT], "no_show", "web");
    await book(B, "c3", "2020-03-07", "11:00", [BEARD], "completed", "web");
    await book(B, "c1", "2020-03-07", "12:00", [CUT], "confirmed", "telegram");
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { barberId: { in: [A, B] } } });
    await prisma.timeOff.deleteMany({ where: { OR: [{ barberId: { in: [A, B] } }, { id: holidayId }] } });
    await prisma.barber.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.service.deleteMany({ where: { id: { in: [CUT.serviceId, BEARD.serviceId] } } });
    await prisma.client.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    await prisma.adminUser.deleteMany({ where: { login: LOGIN } });
    await app.close();
    await prisma.$disconnect();
  });

  it("validates the period and requires a session", async () => {
    expect((await app.inject({ url: `/api/v1/admin/analytics/revenue?${PERIOD}` })).statusCode).toBe(401);
    for (const query of ["from=2020-03-08&to=2020-03-02", "from=2020-01-01&to=2021-02-01", "from=2020-03-02"]) {
      const response = await app.inject({ url: `/api/v1/admin/analytics/revenue?${query}`, headers: auth });
      expect(response.statusCode, query).toBe(400);
    }
  });

  it("revenue: completed bookings only, by day, vs the previous week", async () => {
    const data = await get("revenue");
    // 100 000 + 150 000 + 100 000 + 50 000
    expect(data).toMatchObject({ total: 400_000, completed: 4, averageCheck: 100_000, previousTotal: 50_000, previousCompleted: 1 });
    expect(data.days).toHaveLength(7);
    expect(data.days.filter((d: { revenue: number }) => d.revenue > 0)).toEqual([
      { date: "2020-03-02", revenue: 250_000, completed: 2 },
      { date: "2020-03-05", revenue: 100_000, completed: 1 },
      { date: "2020-03-07", revenue: 50_000, completed: 1 },
    ]);
  });

  it("statuses: counts, cancellations, no-shows, sources", async () => {
    expect(await get("cancellations")).toEqual({
      total: 7,
      confirmed: 1,
      completed: 4,
      cancelled: 1,
      noShow: 1,
      cancelRate: 0.1429, // 1 / 7
      noShowRate: 0.2, // 1 / (4 + 1)
      bySource: { web: 4, telegram: 2, admin: 1 },
    });
  });

  it("services: popularity without cancelled bookings, revenue from completed", async () => {
    const data = await get("services");
    expect(data).toEqual([
      { serviceId: CUT.serviceId, name: CUT.name, count: 5, revenue: 300_000 },
      { serviceId: BEARD.serviceId, name: BEARD.name, count: 2, revenue: 100_000 },
    ]);
  });

  it("load: booked minutes over working time minus lunch and time off", async () => {
    const rows = (await get("load")).filter((r: { barberId: string }) => [A, B].includes(r.barberId));
    // A: Mon, Tue, Thu 540 + Fri 420 (holiday 10–12), Wed vacation = 2040; booked 60 + 90 + 60 + 60 = 270.
    // B: Sat 480; booked 30 + 60 = 90.
    expect(rows).toEqual([
      { barberId: A, name: "Аналитик А", isActive: true, availableMin: 2040, bookedMin: 270, load: 0.1324, bookings: 5, completed: 3, revenue: 350_000, cancelled: 1, noShow: 1 },
      { barberId: B, name: "Аналитик Б", isActive: true, availableMin: 480, bookedMin: 90, load: 0.1875, bookings: 2, completed: 1, revenue: 50_000, cancelled: 0, noShow: 0 },
    ]);
  });

  it("heatmap: weekday × hour of non-cancelled bookings", async () => {
    expect(await get("heatmap")).toEqual({
      cells: [
        { weekday: 1, hour: 10, count: 1 },
        { weekday: 1, hour: 12, count: 1 },
        { weekday: 4, hour: 16, count: 1 },
        { weekday: 4, hour: 18, count: 1 },
        { weekday: 6, hour: 11, count: 1 },
        { weekday: 6, hour: 12, count: 1 },
      ],
      max: 1,
    });
  });

  it("retention: visited before the period or twice within it", async () => {
    // Completed in the period: c1 (also last week), c2 twice, c3 once.
    expect(await get("retention")).toEqual({
      clients: 3,
      newClients: 2,
      returningClients: 2,
      returningRate: 0.6667,
      repeatInPeriod: 1,
      visitsPerClient: 1.33,
    });
  });
});
