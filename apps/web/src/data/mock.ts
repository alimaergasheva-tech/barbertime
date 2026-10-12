import type { Review } from "@/types";

export const shop = {
  name: "Barber Time",
  city: "Ташкент",
  address: "ул. Шота Руставели, 12",
  landmark: "Вход со двора, рядом с кофейней «Чинор»",
  phone: "+998 90 123-45-67",
  phoneHref: "tel:+998901234567",
  telegram: "@barbertime_tashkent",
  telegramHref: "https://t.me/barbertime_tashkent",
  telegramBot: process.env.NEXT_PUBLIC_TELEGRAM_BOT || "barbertime_bot",
  hours: [
    { days: "Пн–Пт", time: "10:00–21:00" },
    { days: "Сб–Вс", time: "10:00–20:00" },
  ],
  coords: { lat: 41.2995, lon: 69.2721 },
};

export const reviews: Review[] = [
  {
    id: "r1",
    author: "Бахтиёр",
    barberId: "timur",
    rating: 5,
    comment:
      "Хожу к Тимуру уже год. Ни разу не пришлось ждать, стрижка держит форму до следующего визита.",
    date: "2026-09-14",
  },
  {
    id: "r2",
    author: "Илья",
    barberId: "aziz",
    rating: 5,
    comment: "Показал фото, Азиз предложил вариант лучше. Записался через Telegram за минуту.",
    date: "2026-09-21",
  },
  {
    id: "r3",
    author: "Шерзод",
    barberId: "rustam",
    rating: 4,
    comment: "Бритьё — отдельное удовольствие. Минус звезда только за парковку во дворе.",
    date: "2026-09-27",
  },
];
