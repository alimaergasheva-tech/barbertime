import { randomBytes } from "node:crypto";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient();

class Rollback extends Error {}

function hhmm(value: Date): string {
  return value.toISOString().slice(11, 16);
}

async function printData() {
  const [services, barbers, settings, publicReviews] = await Promise.all([
    prisma.service.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({
      orderBy: { sortOrder: "asc" },
      include: { services: true, workingHours: { orderBy: { weekday: "asc" } }, breaks: true },
    }),
    prisma.setting.findMany({ orderBy: { key: "asc" } }),
    prisma.review.count({ where: { isPublic: true } }),
  ]);

  console.table(services.map(({ id, name, durationMin, price }) => ({ id, name, durationMin, price })));
  console.table(
    barbers.map((barber) => ({
      id: barber.id,
      name: barber.name,
      services: barber.services.map((item) => item.serviceId).join(", "),
      weekdays: barber.workingHours.map((row) => row.weekday).join(""),
      hours: barber.workingHours[0] ? `${hhmm(barber.workingHours[0].startTime)}–${hhmm(barber.workingHours[0].endTime)}` : "—",
      lunch: barber.breaks[0] ? `${hhmm(barber.breaks[0].startTime)}–${hhmm(barber.breaks[0].endTime)}` : "—",
    })),
  );
  console.table(Object.fromEntries(settings.map((row) => [row.key, JSON.stringify(row.value)])));
  console.log(`Public reviews: ${publicReviews}`);
}

/** Inserts two overlapping confirmed bookings inside a rolled-back transaction. */
async function checkOverlapGuard() {
  const client = await prisma.client.findFirstOrThrow();
  const startsAt = new Date("2030-01-07T10:00:00+05:00");
  const booking = (offsetMin: number) => ({
    clientId: client.id,
    barberId: "timur",
    startsAt: new Date(startsAt.getTime() + offsetMin * 60_000),
    endsAt: new Date(startsAt.getTime() + (offsetMin + 45) * 60_000),
    totalPrice: 150000,
    totalDurationMin: 45,
    manageToken: randomBytes(24).toString("base64url"),
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.booking.create({ data: booking(0) });
      await tx.booking.create({ data: booking(30) });
      throw new Rollback();
    });
  } catch (error) {
    if (error instanceof Rollback) {
      console.error("✗ Overlap guard is missing: overlapping bookings were accepted");
      process.exitCode = 1;
      return;
    }
    const text = `${String(error)} ${JSON.stringify(error)}`;
    if (text.includes("bookings_no_overlap") || text.includes("23P01")) {
      console.log("✓ Overlap guard works: Postgres rejected the second booking (23P01)");
    } else {
      throw error;
    }
  }
}

async function main() {
  await printData();
  await checkOverlapGuard();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
