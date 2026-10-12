import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "@barbershop/db";
import { buildApp } from "../app";
import { addDays, localDate, zonedToUtc } from "../booking/time";
import { hashPassword } from "./auth";
import { LoginLimiter } from "./rateLimit";
import type { ImageStorage } from "./storage";

const url = process.env.TEST_DATABASE_URL;

const LOGIN = "test-admin-integration";
const PASSWORD = "correct horse battery";
const PHONE_PREFIX = "+99800003";
const TZ = "Asia/Tashkent";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

function multipart(field: string, filename: string, type: string, data: Buffer) {
  const boundary = "----bt-test-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!url)("admin API (integration)", { timeout: 30_000 }, () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: { authorization: string };
  let serviceId: string;
  let barberId: string;
  const uploads: string[] = [];

  const storage: ImageStorage = {
    upload: async (folder) => {
      const url = `https://storage.test/${folder}/${uploads.length}.png`;
      uploads.push(url);
      return url;
    },
    remove: async () => undefined,
  };

  // Next weekday that is not Sunday keeps the test independent of seed day-offs (our barber works daily).
  const day = addDays(localDate(Date.now(), TZ), 2);
  const at = (minutes: number) => new Date(zonedToUtc(day, minutes, TZ)).toISOString();

  beforeAll(async () => {
    prisma = createPrismaClient(url, { max: Number(process.env.TEST_DB_POOL_MAX ?? 1) });
    await prisma.adminUser.upsert({
      where: { login: LOGIN },
      create: { login: LOGIN, passwordHash: await hashPassword(PASSWORD) },
      update: { passwordHash: await hashPassword(PASSWORD) },
    });
    app = await buildApp({
      prisma,
      corsOrigins: [],
      logger: false,
      storage,
      loginLimiter: new LoginLimiter({ perKey: 3, windowMs: 60_000 }),
    });
  });

  afterAll(async () => {
    if (barberId) {
      await prisma.booking.deleteMany({ where: { barberId } });
      await prisma.timeOff.deleteMany({ where: { barberId } });
      await prisma.barber.deleteMany({ where: { id: barberId } });
    }
    if (serviceId) await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.client.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    await prisma.adminUser.deleteMany({ where: { login: LOGIN } });
    await app.close();
    await prisma.$disconnect();
  });

  const login = (password: string, ip = "10.0.0.1") =>
    app.inject({ method: "POST", url: "/api/v1/admin/login", headers: { "x-forwarded-for": ip }, payload: { login: LOGIN, password } });

  it("requires a session and rate-limits failed logins", async () => {
    expect((await app.inject({ url: "/api/v1/admin/bookings?from=2026-01-01&to=2026-01-02" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/v1/admin/me", headers: { authorization: "Bearer nope" } })).statusCode).toBe(401);

    for (let i = 0; i < 3; i++) expect((await login("wrong", "10.0.0.9")).statusCode).toBe(401);
    const blocked = await login(PASSWORD, "10.0.0.9");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("logs in, works with the session and revokes it on logout", async () => {
    // Fresh limiter state for this login key: a successful login is still blocked above, use a new app.
    const fresh = await buildApp({ prisma, corsOrigins: [], logger: false, storage });
    const res = await fresh.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login: LOGIN, password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    const token = res.json().token as string;
    expect(token.length).toBeGreaterThan(30);

    const session = { authorization: `Bearer ${token}` };
    expect((await fresh.inject({ url: "/api/v1/admin/me", headers: session })).json()).toEqual({ login: LOGIN });
    expect((await fresh.inject({ method: "POST", url: "/api/v1/admin/logout", headers: session })).statusCode).toBe(204);
    expect((await fresh.inject({ url: "/api/v1/admin/me", headers: session })).statusCode).toBe(401);
    await fresh.close();

    const again = await buildApp({ prisma, corsOrigins: [], logger: false, storage });
    const second = await again.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login: LOGIN, password: PASSWORD } });
    auth = { authorization: `Bearer ${second.json().token}` };
    await again.close();
  });

  it("manages services, a barber and the weekly schedule", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/services",
      headers: auth,
      payload: { name: "Тестовая услуга", durationMin: 40, price: 99_000, assignToAll: false },
    });
    expect(created.statusCode).toBe(201);
    serviceId = created.json().id;

    const patched = await app.inject({ method: "PATCH", url: `/api/v1/admin/services/${serviceId}`, headers: auth, payload: { price: 120_000 } });
    expect(patched.json().price).toBe(120_000);
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/services/${serviceId}`, headers: auth, payload: { durationMin: 1 } })).statusCode).toBe(400);

    const barber = await app.inject({
      method: "POST",
      url: "/api/v1/admin/barbers",
      headers: auth,
      payload: { name: "Тест Админов", experienceYears: 3, specialties: ["фейд"] },
    });
    barberId = barber.json().id;

    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/barbers/${barberId}`,
      headers: auth,
      payload: { services: [{ serviceId, enabled: true, durationMin: 30, price: null }] },
    });
    const schedule = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/barbers/${barberId}/schedule`,
      headers: auth,
      payload: {
        days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: "10:00", end: "18:00", breaks: [{ start: "13:00", end: "14:00" }] })),
      },
    });
    expect(schedule.statusCode).toBe(200);
    const badSchedule = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/barbers/${barberId}/schedule`,
      headers: auth,
      payload: { days: [{ weekday: 1, start: "10:00", end: "18:00", breaks: [{ start: "17:30", end: "19:00" }] }] },
    });
    expect(badSchedule.statusCode).toBe(400);

    const detail = (await app.inject({ url: `/api/v1/admin/barbers/${barberId}`, headers: auth })).json();
    expect(detail.schedule).toHaveLength(7);
    expect(detail.schedule[0]).toEqual({ weekday: 1, start: "10:00", end: "18:00", breaks: [{ start: "13:00", end: "14:00" }] });
    expect(detail.services.find((s: { serviceId: string }) => s.serviceId === serviceId)).toMatchObject({ enabled: true, durationMin: 30 });

    const slots = await app.inject({ url: `/api/v1/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${day}` });
    const times = (slots.json().slots as { time: string }[]).map((s) => s.time);
    expect(times).toContain("10:00");
    expect(times).not.toContain("13:00");
  });

  it("creates off-grid admin bookings and changes them", async () => {
    const book = (minutes: number, suffix: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/admin/bookings",
        headers: auth,
        payload: { serviceIds: [serviceId], barberId, startsAt: at(minutes), client: { name: "Гость", phone: `${PHONE_PREFIX}000${suffix}` } },
      });

    const created = await book(10 * 60 + 5, "1");
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ source: "admin", status: "confirmed", totalDurationMin: 30, totalPrice: 120_000 });
    const id = created.json().id as string;

    expect((await book(13 * 60 + 15, "2")).json().code).toBe("OUTSIDE_WORKING_HOURS");
    expect((await book(10 * 60 + 20, "2")).json().code).toBe("SLOT_TAKEN");

    const list = await app.inject({ url: `/api/v1/admin/bookings?from=${day}&to=${day}&barberId=${barberId}`, headers: auth });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].client).toMatchObject({ name: "Гость", telegram: false });

    const moved = await app.inject({ method: "PATCH", url: `/api/v1/admin/bookings/${id}`, headers: auth, payload: { startsAt: at(15 * 60 + 10) } });
    expect(moved.json().startsAt).toBe(at(15 * 60 + 10));

    const done = await app.inject({ method: "PATCH", url: `/api/v1/admin/bookings/${id}`, headers: auth, payload: { status: "no_show" } });
    expect(done.json().status).toBe("no_show");
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/bookings/${id}`, headers: auth, payload: {} })).statusCode).toBe(400);
  });

  it("adds time off with conflict count and blocks the slots", async () => {
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/v1/admin/bookings",
      headers: auth,
      payload: { serviceIds: [serviceId], barberId, startsAt: at(11 * 60), client: { name: "Гость", phone: `${PHONE_PREFIX}0003` } },
    });
    expect(confirmed.statusCode).toBe(201);

    const off = await app.inject({
      method: "POST",
      url: "/api/v1/admin/time-off",
      headers: auth,
      payload: { barberId, from: day, to: day, type: "sick", note: "тест" },
    });
    expect(off.statusCode).toBe(201);
    expect(off.json().conflicts).toBe(1);

    const slots = await app.inject({ url: `/api/v1/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${day}` });
    expect(slots.json().slots).toHaveLength(0);

    const list = (await app.inject({ url: "/api/v1/admin/time-off", headers: auth })).json() as { id: string }[];
    expect(list.some((item) => item.id === off.json().id)).toBe(true);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/admin/time-off/${off.json().id}`, headers: auth })).statusCode).toBe(200);
  });

  it("uploads checked images and validates settings", async () => {
    const png = multipart("file", "a.png", "image/png", PNG);
    const photo = await app.inject({
      method: "POST",
      url: `/api/v1/admin/barbers/${barberId}/photo`,
      payload: png.payload,
      headers: { ...auth, ...png.headers },
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.json().photoUrl).toMatch(/^https:\/\/storage\.test\/barbers\//);

    const fake = multipart("file", "a.png", "image/png", Buffer.from("not an image"));
    const rejected = await app.inject({ method: "POST", url: `/api/v1/admin/barbers/${barberId}/portfolio`, payload: fake.payload, headers: { ...auth, ...fake.headers } });
    expect(rejected.statusCode).toBe(415);

    const bad = await app.inject({ method: "PUT", url: "/api/v1/admin/settings", headers: auth, payload: { slot_step_min: 1 } });
    expect(bad.statusCode).toBe(400);
    const unknown = await app.inject({ method: "PUT", url: "/api/v1/admin/settings", headers: auth, payload: { hacker: 1 } });
    expect(unknown.statusCode).toBe(400);
    const current = (await app.inject({ url: "/api/v1/admin/settings", headers: auth })).json();
    const ok = await app.inject({ method: "PUT", url: "/api/v1/admin/settings", headers: auth, payload: { cancel_cutoff_min: current.cancel_cutoff_min } });
    expect(ok.statusCode).toBe(200);
  });

  it("archives a service with booking history instead of deleting it", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/v1/admin/services/${serviceId}`, headers: auth });
    expect(res.json()).toEqual({ archived: true });
    const services = (await app.inject({ url: "/api/v1/services" })).json() as { id: string }[];
    expect(services.some((s) => s.id === serviceId)).toBe(false);
  });
});
