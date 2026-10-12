import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { timeColumnMinutes } from "../../booking/time";
import { HttpError, notFound } from "../../errors";
import { Id } from "../schemas";
import { Clock, clockText, readImage, timeColumn, Uuid } from "./common";

const IdParams = z.object({ id: Id });

const ServiceBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0).max(100_000_000),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

const BarberBody = z.object({
  name: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(600).default(""),
  experienceYears: z.number().int().min(0).max(60).default(0),
  specialties: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

const BarberServices = z
  .array(
    z.object({
      serviceId: Id,
      enabled: z.boolean(),
      durationMin: z.number().int().min(5).max(480).nullable(),
      price: z.number().int().min(0).max(100_000_000).nullable(),
    }),
  )
  .max(100);

const Range = z.object({ start: Clock, end: Clock }).refine((r) => r.start < r.end, "Start must be before end");

const ScheduleBody = z.object({
  days: z
    .array(
      z
        .object({ weekday: z.number().int().min(1).max(7), start: Clock, end: Clock, breaks: z.array(Range).max(4).default([]) })
        .refine((day) => day.start < day.end, "Start must be before end")
        .refine((day) => day.breaks.every((b) => b.start >= day.start && b.end <= day.end), "Breaks must be within working hours"),
    )
    .max(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, "Each weekday once"),
});

export const adminCatalogRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app;

  // ---------- services ----------

  app.get("/services", async () => {
    const services = await prisma.service.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { barbers: { where: { isEnabled: true } } } } },
    });
    return services.map(({ _count, ...service }) => ({ ...service, barberCount: _count.barbers }));
  });

  app.post("/services", async (request, reply) => {
    const body = ServiceBody.extend({ assignToAll: z.boolean().default(true) }).parse(request.body);
    const { assignToAll, ...data } = body;
    const service = await prisma.$transaction(async (tx) => {
      const created = await tx.service.create({ data });
      if (assignToAll) {
        const barbers = await tx.barber.findMany({ select: { id: true } });
        await tx.barberService.createMany({ data: barbers.map((b) => ({ barberId: b.id, serviceId: created.id })) });
      }
      return created;
    });
    return reply.code(201).send(service);
  });

  app.patch("/services/:id", async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = ServiceBody.partial().parse(request.body);
    const exists = await prisma.service.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("Service not found");
    return prisma.service.update({ where: { id }, data: body });
  });

  /** Services with booking history are archived so past visits keep their reference. */
  app.delete("/services/:id", async (request) => {
    const { id } = IdParams.parse(request.params);
    const service = await prisma.service.findUnique({ where: { id }, include: { _count: { select: { bookingServices: true } } } });
    if (!service) throw notFound("Service not found");
    if (service._count.bookingServices > 0) {
      await prisma.service.update({ where: { id }, data: { isActive: false } });
      return { archived: true };
    }
    await prisma.service.delete({ where: { id } });
    return { archived: false };
  });

  // ---------- barbers ----------

  app.get("/barbers", async () => {
    const barbers = await prisma.barber.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { services: { where: { isEnabled: true } } } } },
    });
    return barbers.map(({ _count, telegramChatId, telegramLinkCodeHash: _hash, telegramLinkExpiresAt: _exp, ...barber }) => ({
      ...barber,
      telegramLinked: telegramChatId !== null,
      serviceCount: _count.services,
    }));
  });

  app.get("/barbers/:id", async (request) => {
    const { id } = IdParams.parse(request.params);
    const [barber, services] = await Promise.all([
      prisma.barber.findUnique({
        where: { id },
        include: {
          services: true,
          workingHours: { orderBy: { weekday: "asc" } },
          breaks: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
          portfolio: { orderBy: { sortOrder: "asc" } },
        },
      }),
      prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    ]);
    if (!barber) throw notFound("Barber not found");

    return {
      id: barber.id,
      name: barber.name,
      bio: barber.bio,
      experienceYears: barber.experienceYears,
      specialties: barber.specialties,
      photoUrl: barber.photoUrl,
      isActive: barber.isActive,
      sortOrder: barber.sortOrder,
      telegramLinked: barber.telegramChatId !== null,
      services: services.map((service) => {
        const link = barber.services.find((item) => item.serviceId === service.id);
        return {
          serviceId: service.id,
          name: service.name,
          isActive: service.isActive,
          baseDurationMin: service.durationMin,
          basePrice: service.price,
          enabled: link?.isEnabled ?? false,
          durationMin: link?.durationMin ?? null,
          price: link?.price ?? null,
        };
      }),
      schedule: barber.workingHours.map((day) => ({
        weekday: day.weekday,
        start: clockText(timeColumnMinutes(day.startTime)),
        end: clockText(timeColumnMinutes(day.endTime)),
        breaks: barber.breaks
          .filter((b) => b.weekday === day.weekday)
          .map((b) => ({ start: clockText(timeColumnMinutes(b.startTime)), end: clockText(timeColumnMinutes(b.endTime)) })),
      })),
      portfolio: barber.portfolio.map((item) => ({ id: item.id, imageUrl: item.imageUrl })),
    };
  });

  app.post("/barbers", async (request, reply) => {
    const body = BarberBody.parse(request.body);
    const barber = await prisma.barber.create({ data: body, select: { id: true } });
    return reply.code(201).send(barber);
  });

  app.patch("/barbers/:id", async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = BarberBody.partial().extend({ services: BarberServices.optional() }).parse(request.body);
    const { services, ...data } = body;
    const exists = await prisma.barber.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("Barber not found");

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.barber.update({ where: { id }, data });
      for (const item of services ?? []) {
        const values = { isEnabled: item.enabled, durationMin: item.durationMin, price: item.price };
        await tx.barberService.upsert({
          where: { barberId_serviceId: { barberId: id, serviceId: item.serviceId } },
          create: { barberId: id, serviceId: item.serviceId, ...values },
          update: values,
        });
      }
    });
    return { id };
  });

  /** Barbers with bookings are deactivated instead of deleted. */
  app.delete("/barbers/:id", async (request) => {
    const { id } = IdParams.parse(request.params);
    const barber = await prisma.barber.findUnique({ where: { id }, include: { _count: { select: { bookings: true } } } });
    if (!barber) throw notFound("Barber not found");
    if (barber._count.bookings > 0) {
      await prisma.barber.update({ where: { id }, data: { isActive: false } });
      return { archived: true };
    }
    await prisma.barber.delete({ where: { id } });
    return { archived: false };
  });

  app.put("/barbers/:id/schedule", async (request) => {
    const { id } = IdParams.parse(request.params);
    const { days } = ScheduleBody.parse(request.body);
    const exists = await prisma.barber.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("Barber not found");

    await prisma.$transaction([
      prisma.break.deleteMany({ where: { barberId: id } }),
      prisma.workingHours.deleteMany({ where: { barberId: id } }),
      prisma.workingHours.createMany({
        data: days.map((d) => ({ barberId: id, weekday: d.weekday, startTime: timeColumn(d.start), endTime: timeColumn(d.end) })),
      }),
      prisma.break.createMany({
        data: days.flatMap((d) =>
          d.breaks.map((b) => ({ barberId: id, weekday: d.weekday, startTime: timeColumn(b.start), endTime: timeColumn(b.end) })),
        ),
      }),
    ]);
    return { id };
  });

  // ---------- photos ----------

  app.post("/barbers/:id/photo", async (request) => {
    const { id } = IdParams.parse(request.params);
    const barber = await prisma.barber.findUnique({ where: { id }, select: { photoUrl: true } });
    if (!barber) throw notFound("Barber not found");
    const image = await readImage(request);
    const photoUrl = await app.storage.upload(`barbers/${id}`, image.data, image.contentType);
    await prisma.barber.update({ where: { id }, data: { photoUrl } });
    if (barber.photoUrl) await app.storage.remove(barber.photoUrl);
    return { photoUrl };
  });

  app.delete("/barbers/:id/photo", async (request) => {
    const { id } = IdParams.parse(request.params);
    const barber = await prisma.barber.findUnique({ where: { id }, select: { photoUrl: true } });
    if (!barber) throw notFound("Barber not found");
    await prisma.barber.update({ where: { id }, data: { photoUrl: null } });
    if (barber.photoUrl) await app.storage.remove(barber.photoUrl);
    return { photoUrl: null };
  });

  app.post("/barbers/:id/portfolio", async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const barber = await prisma.barber.findUnique({ where: { id }, include: { _count: { select: { portfolio: true } } } });
    if (!barber) throw notFound("Barber not found");
    if (barber._count.portfolio >= 24) throw new HttpError(422, "PORTFOLIO_FULL", "Up to 24 portfolio photos");
    const image = await readImage(request);
    const imageUrl = await app.storage.upload(`portfolio/${id}`, image.data, image.contentType);
    const item = await prisma.portfolioItem.create({ data: { barberId: id, imageUrl, sortOrder: barber._count.portfolio } });
    return reply.code(201).send({ id: item.id, imageUrl });
  });

  app.delete("/portfolio/:itemId", async (request) => {
    const { itemId } = z.object({ itemId: Uuid }).parse(request.params);
    const item = await prisma.portfolioItem.findUnique({ where: { id: itemId } });
    if (!item) throw notFound("Portfolio item not found");
    await prisma.portfolioItem.delete({ where: { id: itemId } });
    await app.storage.remove(item.imageUrl);
    return { id: itemId };
  });
};
