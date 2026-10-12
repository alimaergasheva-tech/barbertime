import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient();

const SHOP_UTC_OFFSET = "+05:00";

/** Shop-local date + time → UTC instant. */
function shopTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${SHOP_UTC_OFFSET}`);
}

/** Wall-clock value for Postgres TIME columns. */
function clock(time: string): Date {
  return new Date(`1970-01-01T${time}:00Z`);
}

/** Argon2id with library defaults (m=19 MiB, t=2, p=1), same as the API login check. */
function hashPassword(password: string): Promise<string> {
  return hash(password);
}

const services = [
  { id: "haircut", name: "Мужская стрижка", description: "Консультация, мытьё головы, стрижка и укладка", durationMin: 45, price: 150000 },
  { id: "fade", name: "Фейд", description: "Плавный переход машинкой от кожи, верх ножницами", durationMin: 60, price: 180000 },
  { id: "beard", name: "Оформление бороды", description: "Форма, контур и уход маслом", durationMin: 30, price: 90000 },
  { id: "shave", name: "Королевское бритьё", description: "Опасная бритва, горячие полотенца, бальзам после бритья", durationMin: 45, price: 120000 },
  { id: "combo", name: "Стрижка и борода", description: "Полный образ за один визит", durationMin: 75, price: 220000 },
  { id: "kids", name: "Детская стрижка", description: "Для мальчиков до 12 лет", durationMin: 30, price: 100000 },
];

type BarberSeed = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  specialties: string[];
  serviceIds: string[];
  /** ISO weekday the barber does not work. */
  dayOff: number;
  lunch: [string, string];
};

const barbers: BarberSeed[] = [
  {
    id: "timur",
    name: "Тимур",
    bio: "Классические стрижки и аккуратные бороды. Не торопится и всегда уточняет детали.",
    experienceYears: 8,
    specialties: ["Классика", "Борода"],
    serviceIds: ["haircut", "fade", "beard", "shave", "combo"],
    dayOff: 1,
    lunch: ["14:00", "14:45"],
  },
  {
    id: "aziz",
    name: "Азиз",
    bio: "Фейды и современные текстурные стрижки. Подскажет форму под тип волос.",
    experienceYears: 5,
    specialties: ["Фейд", "Текстура"],
    serviceIds: ["haircut", "fade", "beard", "combo", "kids"],
    dayOff: 2,
    lunch: ["15:00", "15:45"],
  },
  {
    id: "rustam",
    name: "Рустам",
    bio: "Бреет опасной бритвой с горячими полотенцами. Спокойный и внимательный мастер.",
    experienceYears: 11,
    specialties: ["Бритьё", "Классика"],
    serviceIds: ["haircut", "beard", "shave", "combo"],
    dayOff: 3,
    lunch: ["13:30", "14:15"],
  },
  {
    id: "jasur",
    name: "Жасур",
    bio: "Терпеливо стрижёт детей и подростков, хорошо делает короткие формы.",
    experienceYears: 3,
    specialties: ["Детские", "Короткие"],
    serviceIds: ["haircut", "fade", "kids"],
    dayOff: 7,
    lunch: ["14:30", "15:15"],
  },
];

/** Shop hours: Mon–Fri 10:00–21:00, Sat–Sun 10:00–20:00. */
function shopHours(weekday: number): [string, string] {
  return weekday <= 5 ? ["10:00", "21:00"] : ["10:00", "20:00"];
}

const settings: Record<string, string | number> = {
  cancel_cutoff_min: 30,
  slot_step_min: 15,
  booking_horizon_days: 30,
  min_notice_min: 30,
  reminder_day_minutes: 1440,
  reminder_short_minutes: 30,
  review_delay_min: 60,
  timezone: "Asia/Tashkent",
  review_public_min_rating: 4,
};

const timeOff = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    barberId: null,
    startsAt: shopTime("2027-01-01", "00:00"),
    endsAt: shopTime("2027-01-02", "00:00"),
    type: "holiday" as const,
    note: "Новый год — барбершоп закрыт",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    barberId: "aziz",
    startsAt: shopTime("2026-10-19", "00:00"),
    endsAt: shopTime("2026-10-26", "00:00"),
    type: "vacation" as const,
    note: "Отпуск",
  },
];

/** Past completed visits that the public reviews on the landing page belong to. */
const history = [
  {
    clientId: "00000000-0000-4000-8000-000000000201",
    bookingId: "00000000-0000-4000-8000-000000000301",
    reviewId: "00000000-0000-4000-8000-000000000401",
    clientName: "Бахтиёр",
    phone: "+998901112233",
    barberId: "timur",
    serviceId: "haircut",
    date: "2026-09-14",
    time: "12:00",
    rating: 5,
    comment: "Хожу к Тимуру уже год. Ни разу не пришлось ждать, стрижка держит форму до следующего визита.",
  },
  {
    clientId: "00000000-0000-4000-8000-000000000202",
    bookingId: "00000000-0000-4000-8000-000000000302",
    reviewId: "00000000-0000-4000-8000-000000000402",
    clientName: "Илья",
    phone: "+998935556677",
    barberId: "aziz",
    serviceId: "fade",
    date: "2026-09-21",
    time: "16:00",
    rating: 5,
    comment: "Показал фото, Азиз предложил вариант лучше. Записался через Telegram за минуту.",
  },
  {
    clientId: "00000000-0000-4000-8000-000000000203",
    bookingId: "00000000-0000-4000-8000-000000000303",
    reviewId: "00000000-0000-4000-8000-000000000403",
    clientName: "Шерзод",
    phone: "+998977778899",
    barberId: "rustam",
    serviceId: "shave",
    date: "2026-09-27",
    time: "18:00",
    rating: 4,
    comment: "Бритьё — отдельное удовольствие. Минус звезда только за парковку во дворе.",
  },
];

async function seedCatalog() {
  for (const [index, service] of services.entries()) {
    const data = { ...service, sortOrder: index, isActive: true };
    await prisma.service.upsert({ where: { id: service.id }, create: data, update: data });
  }

  for (const [index, barber] of barbers.entries()) {
    const data = {
      name: barber.name,
      bio: barber.bio,
      experienceYears: barber.experienceYears,
      specialties: barber.specialties,
      sortOrder: index,
      isActive: true,
    };
    await prisma.barber.upsert({ where: { id: barber.id }, create: { id: barber.id, ...data }, update: data });

    const weekdays = [1, 2, 3, 4, 5, 6, 7].filter((day) => day !== barber.dayOff);
    await prisma.$transaction([
      prisma.barberService.deleteMany({ where: { barberId: barber.id } }),
      prisma.barberService.createMany({
        data: barber.serviceIds.map((serviceId) => ({ barberId: barber.id, serviceId })),
      }),
      prisma.workingHours.deleteMany({ where: { barberId: barber.id } }),
      prisma.workingHours.createMany({
        data: weekdays.map((weekday) => {
          const [start, end] = shopHours(weekday);
          return { barberId: barber.id, weekday, startTime: clock(start), endTime: clock(end) };
        }),
      }),
      prisma.break.deleteMany({ where: { barberId: barber.id } }),
      prisma.break.createMany({
        data: weekdays.map((weekday) => ({
          barberId: barber.id,
          weekday,
          startTime: clock(barber.lunch[0]),
          endTime: clock(barber.lunch[1]),
        })),
      }),
    ]);
  }

  for (const item of timeOff) {
    await prisma.timeOff.upsert({ where: { id: item.id }, create: item, update: item });
  }
}

async function seedSettings() {
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

async function seedHistory() {
  for (const visit of history) {
    const service = services.find((item) => item.id === visit.serviceId);
    if (!service) throw new Error(`Unknown service ${visit.serviceId}`);
    const startsAt = shopTime(visit.date, visit.time);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

    await prisma.client.upsert({
      where: { id: visit.clientId },
      create: { id: visit.clientId, name: visit.clientName, phone: visit.phone, createdAt: startsAt },
      update: { name: visit.clientName, phone: visit.phone },
    });

    const booking = {
      clientId: visit.clientId,
      barberId: visit.barberId,
      startsAt,
      endsAt,
      totalPrice: service.price,
      totalDurationMin: service.durationMin,
      status: "completed" as const,
      source: "web" as const,
      createdAt: new Date(startsAt.getTime() - 2 * 86_400_000),
      autoCompletedAt: endsAt,
      reviewRequestedAt: new Date(endsAt.getTime() + 60 * 60_000),
    };
    await prisma.booking.upsert({
      where: { id: visit.bookingId },
      create: {
        id: visit.bookingId,
        manageToken: randomBytes(24).toString("base64url"),
        ...booking,
        services: {
          create: {
            serviceId: service.id,
            name: service.name,
            durationMin: service.durationMin,
            price: service.price,
          },
        },
      },
      update: booking,
    });

    const review = {
      bookingId: visit.bookingId,
      barberId: visit.barberId,
      clientId: visit.clientId,
      rating: visit.rating,
      comment: visit.comment,
      isPublic: visit.rating >= Number(settings.review_public_min_rating),
      createdAt: new Date(`${visit.date}T21:00:00${SHOP_UTC_OFFSET}`),
    };
    await prisma.review.upsert({ where: { id: visit.reviewId }, create: { id: visit.reviewId, ...review }, update: review });
  }
}

async function seedAdmin() {
  const login = process.env.ADMIN_LOGIN || "admin";
  const envPassword = process.env.ADMIN_PASSWORD;
  const password = envPassword || randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);

  const existing = await prisma.adminUser.findUnique({ where: { login } });
  if (existing) {
    if (envPassword) await prisma.adminUser.update({ where: { login }, data: { passwordHash } });
    return;
  }
  await prisma.adminUser.create({ data: { login, passwordHash } });
  if (!envPassword) console.log(`Admin "${login}" created with generated password: ${password}`);
}

async function main() {
  await seedCatalog();
  await seedSettings();
  await seedHistory();
  await seedAdmin();

  const [serviceCount, barberCount, hoursCount, settingCount] = await Promise.all([
    prisma.service.count(),
    prisma.barber.count(),
    prisma.workingHours.count(),
    prisma.setting.count(),
  ]);
  console.log(
    `Seed done: ${serviceCount} services, ${barberCount} barbers, ${hoursCount} working-hour rows, ${settingCount} settings.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
