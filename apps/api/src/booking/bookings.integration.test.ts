import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "@barbershop/db";
import { buildApp } from "../app";

/**
 * Runs against a disposable, migrated + seeded database only:
 *   TEST_DATABASE_URL=postgres://… npm run test:integration -w @barbershop/api
 */
const url = process.env.TEST_DATABASE_URL;

type Slot = { time: string; startsAt: string; barberIds: string[] };

describe.skipIf(!url)("bookings (integration)", { timeout: 30_000 }, () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const createdTokens: string[] = [];

  beforeAll(async () => {
    // `prisma dev` (PGlite) multiplexes connections unsafely; one connection still lets
    // both requests pass the availability check before either insert, so the DB constraint decides.
    prisma = createPrismaClient(url, { max: Number(process.env.TEST_DB_POOL_MAX ?? 1) });
    app = await buildApp({
      prisma,
      corsOrigins: ["http://localhost:3000"],
      logger: process.env.TEST_LOG ? { level: "error" } : false,
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { manageToken: { in: createdTokens } } });
    await prisma.client.deleteMany({ where: { phone: { startsWith: "+99800000" } } });
    await app.close();
    await prisma.$disconnect();
  });

  async function firstFreeSlot(barberId: string, serviceIds = "haircut", minBarbers = 1): Promise<Slot> {
    const days = await app.inject({ url: `/api/v1/availability/days?serviceIds=${serviceIds}&barberId=${barberId}` });
    for (const { date, available } of days.json().days as { date: string; available: boolean }[]) {
      if (!available) continue;
      const res = await app.inject({
        url: `/api/v1/availability?serviceIds=${serviceIds}&barberId=${barberId}&date=${date}`,
      });
      const slot = (res.json().slots as Slot[]).find((item) => item.barberIds.length >= minBarbers);
      if (slot) return slot;
    }
    throw new Error(`No free slot for ${barberId}`);
  }

  function book(barberId: string, startsAt: string, phoneSuffix: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      payload: {
        serviceIds: ["haircut"],
        barberId,
        startsAt,
        client: { name: "Тест", phone: `+99800000${phoneSuffix}` },
      },
    });
  }

  function remember(response: { statusCode: number; json: () => { token: string } }) {
    if (response.statusCode === 201) createdTokens.push(response.json().token);
  }

  it("two parallel requests for one slot give exactly one 201 and one 409", async () => {
    const slot = await firstFreeSlot("timur");
    const responses = await Promise.all([book("timur", slot.startsAt, "0001"), book("timur", slot.startsAt, "0002")]);
    responses.forEach(remember);

    expect(responses.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect(responses.find((res) => res.statusCode === 409)?.json()).toMatchObject({ code: "SLOT_TAKEN" });

    const after = await app.inject({
      url: `/api/v1/availability?serviceIds=haircut&barberId=timur&date=${slot.startsAt.slice(0, 10)}`,
    });
    expect((after.json().slots as Slot[]).some((item) => item.startsAt === slot.startsAt)).toBe(false);
  });

  it("'any' mode assigns different free barbers to parallel requests", async () => {
    const slot = await firstFreeSlot("any", "haircut", 2);
    const responses = await Promise.all([book("any", slot.startsAt, "0003"), book("any", slot.startsAt, "0004")]);
    responses.forEach(remember);

    expect(responses.map((res) => res.statusCode)).toEqual([201, 201]);
    const barbers = responses.map((res) => res.json().barber.id);
    expect(new Set(barbers).size).toBe(2);
    barbers.forEach((id) => expect(slot.barberIds).toContain(id));
  });

  it("reschedules and cancels by manage token", async () => {
    const slot = await firstFreeSlot("aziz");
    const created = await book("aziz", slot.startsAt, "0005");
    remember(created);
    expect(created.statusCode).toBe(201);
    const { token } = created.json();

    const options = await app.inject({
      url: `/api/v1/availability?serviceIds=haircut&barberId=aziz&date=${slot.startsAt.slice(0, 10)}&rescheduleToken=${token}`,
    });
    const target = (options.json().slots as Slot[]).find((item) => item.startsAt !== slot.startsAt)!;

    const moved = await app.inject({
      method: "POST",
      url: `/api/v1/bookings/${token}/reschedule`,
      payload: { startsAt: target.startsAt },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ startsAt: new Date(target.startsAt).toISOString(), status: "confirmed" });

    const cancelled = await app.inject({ method: "POST", url: `/api/v1/bookings/${token}/cancel` });
    expect(cancelled.json()).toMatchObject({ status: "cancelled", canChange: false });

    const again = await app.inject({ method: "POST", url: `/api/v1/bookings/${token}/cancel` });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: "NOT_ACTIVE" });
  });

  it("rejects starts outside working hours and unknown tokens", async () => {
    const slot = await firstFreeSlot("timur");
    const night = new Date(slot.startsAt);
    night.setUTCHours(20, 0, 0, 0); // 01:00 in Tashkent
    const res = await book("timur", night.toISOString(), "0006");
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "OUTSIDE_WORKING_HOURS" });

    const missing = await app.inject({ url: "/api/v1/bookings/does-not-exist-token-123" });
    expect(missing.statusCode).toBe(404);
  });
});
