import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@barbershop/db";
import { notFound } from "../errors";
import { Id } from "./schemas";

const IdParams = z.object({ id: Id });

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  durationMin: true,
  price: true,
} as const;

const barberSelect = {
  id: true,
  name: true,
  photoUrl: true,
  bio: true,
  experienceYears: true,
  specialties: true,
  services: {
    where: { isEnabled: true, service: { isActive: true } },
    select: { serviceId: true },
  },
} as const;

type RatingMap = Map<string, { rating: number; reviewCount: number }>;

async function loadRatings(prisma: PrismaClient, barberIds?: string[]): Promise<RatingMap> {
  const rows = await prisma.review.groupBy({
    by: ["barberId"],
    where: { isPublic: true, ...(barberIds ? { barberId: { in: barberIds } } : {}) },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((row) => [
      row.barberId,
      { rating: Math.round((row._avg.rating ?? 0) * 10) / 10, reviewCount: row._count._all },
    ]),
  );
}

type BarberRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  specialties: string[];
  services: { serviceId: string }[];
};

function toBarberDto(barber: BarberRow, ratings: RatingMap) {
  const { services, ...rest } = barber;
  const stats = ratings.get(barber.id);
  return {
    ...rest,
    serviceIds: services.map((item) => item.serviceId),
    rating: stats?.rating ?? null,
    reviewCount: stats?.reviewCount ?? 0,
  };
}

function hhmm(value: Date): string {
  return value.toISOString().slice(11, 16);
}

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/services", async () => {
    return app.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: serviceSelect,
    });
  });

  app.get("/barbers", async () => {
    const [barbers, ratings] = await Promise.all([
      app.prisma.barber.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: barberSelect,
      }),
      loadRatings(app.prisma),
    ]);
    return barbers.map((barber) => toBarberDto(barber, ratings));
  });

  app.get("/barbers/:id", async (request) => {
    const { id } = IdParams.parse(request.params);
    const barber = await app.prisma.barber.findFirst({
      where: { id, isActive: true },
      select: {
        ...barberSelect,
        portfolio: { orderBy: { sortOrder: "asc" }, select: { id: true, imageUrl: true } },
        workingHours: { orderBy: { weekday: "asc" }, select: { weekday: true, startTime: true, endTime: true } },
      },
    });
    if (!barber) throw notFound(`Barber "${id}" not found`);

    const { portfolio, workingHours, ...base } = barber;
    const ratings = await loadRatings(app.prisma, [id]);
    return {
      ...toBarberDto(base, ratings),
      portfolio,
      workingHours: workingHours.map((row) => ({
        weekday: row.weekday,
        start: hhmm(row.startTime),
        end: hhmm(row.endTime),
      })),
    };
  });
};
