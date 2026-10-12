import { InlineKeyboard } from "grammy";
import type { BookingSource } from "@barbershop/db";

export type BookingView = {
  token: string;
  startsAt: string;
  totalPrice: number;
  barberName: string;
  serviceNames: string[];
};

export type Links = {
  /** Public site URL, used for «Управлять записью» buttons. */
  appUrl: string;
  /** Mini App URL; Telegram accepts only https for web_app buttons. */
  miniAppUrl: string;
};

const priceFormatter = new Intl.NumberFormat("ru-RU");

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Telegram rejects non-https (and localhost) URLs in buttons. */
export function publicUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname !== "localhost" ? url : undefined;
  } catch {
    return undefined;
  }
}

export function formatWhen(iso: string, timeZone: string): string {
  const text = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const formatPrice = (sum: number) => `${priceFormatter.format(sum)} сум`;

const SOURCE: Record<BookingSource, string> = { web: "сайт", telegram: "Telegram", admin: "администратор" };

function details(view: BookingView, timeZone: string): string {
  return [
    `<b>${escapeHtml(formatWhen(view.startsAt, timeZone))}</b>`,
    `Мастер: ${escapeHtml(view.barberName)}`,
    `Услуги: ${escapeHtml(view.serviceNames.join(", "))}`,
    `К оплате: ${formatPrice(view.totalPrice)}`,
  ].join("\n");
}

export const clientMessages = {
  created: (view: BookingView, tz: string) => `Вы записаны в Barber Time\n\n${details(view, tz)}`,
  linked: (view: BookingView, tz: string) =>
    `Запись привязана к Telegram — пришлём напоминания перед визитом.\n\n${details(view, tz)}`,
  rescheduled: (view: BookingView, tz: string, previousStartsAt: string) =>
    `Запись перенесена\nБыло: ${escapeHtml(formatWhen(previousStartsAt, tz))}\n\n${details(view, tz)}`,
  cancelled: (view: BookingView, tz: string) =>
    `Запись отменена\n\n<s>${escapeHtml(formatWhen(view.startsAt, tz))}</s>\nМастер: ${escapeHtml(view.barberName)}`,
  upcoming: (view: BookingView, tz: string) => details(view, tz),
};

export type BarberBookingView = BookingView & { clientName: string; clientPhone: string; source: BookingSource };

function barberDetails(view: BarberBookingView, timeZone: string): string {
  return [
    `<b>${escapeHtml(formatWhen(view.startsAt, timeZone))}</b>`,
    `Клиент: ${escapeHtml(view.clientName)}, ${escapeHtml(view.clientPhone)}`,
    `Услуги: ${escapeHtml(view.serviceNames.join(", "))}`,
  ].join("\n");
}

export const barberMessages = {
  created: (view: BarberBookingView, tz: string) =>
    `Новая запись (${SOURCE[view.source]})\n\n${barberDetails(view, tz)}`,
  rescheduled: (view: BarberBookingView, tz: string, previousStartsAt: string) =>
    `Запись перенесена\nБыло: ${escapeHtml(formatWhen(previousStartsAt, tz))}\n\n${barberDetails(view, tz)}`,
  cancelled: (view: BarberBookingView, tz: string) => `Запись отменена\n\n${barberDetails(view, tz)}`,
};

/** Buttons under a client's booking message. */
export function bookingKeyboard(view: BookingView, links: Links, { withCancel = false } = {}) {
  const keyboard = new InlineKeyboard();
  const miniApp = publicUrl(links.miniAppUrl);
  const site = publicUrl(links.appUrl);
  if (miniApp) keyboard.webApp("Перенести", miniApp);
  else if (site) keyboard.url("Управлять записью", `${site}/booking/${view.token}`);
  if (withCancel) keyboard.text("Отменить", `cancel:${view.token}`);
  return keyboard;
}

export const HELP_TEXT = [
  "Я бот барбершопа Barber Time.",
  "",
  "• «Записаться» — открыть запись в приложении",
  "• «Мои записи» — ближайшие визиты, отмена и перенос",
  "",
  "Подтверждения и напоминания о визитах приходят сюда.",
].join("\n");
