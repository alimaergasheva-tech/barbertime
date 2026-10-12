import { initData, isInTelegram } from "./telegram";
import type { AvailabilityDay, Barber, Booking, Me, Service, Slot } from "./types";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (isInTelegram) headers.set("Authorization", `tma ${initData}`);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Network error");
  }
  const body = (await response.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!response.ok) {
    throw new ApiError(response.status, body?.code ?? "API_ERROR", body?.message ?? response.statusText);
  }
  return body as T;
}

type AvailabilityQuery = { serviceIds: string[]; barberId: string; rescheduleToken?: string };

function query(params: AvailabilityQuery, extra: Record<string, string> = {}) {
  const search = new URLSearchParams({ serviceIds: params.serviceIds.join(","), barberId: params.barberId, ...extra });
  if (params.rescheduleToken) search.set("rescheduleToken", params.rescheduleToken);
  return search.toString();
}

export const api = {
  services: () => call<Service[]>("/services"),
  barbers: () => call<Barber[]>("/barbers"),
  days: (params: AvailabilityQuery) =>
    call<{ days: AvailabilityDay[] }>(`/availability/days?${query(params)}`).then((r) => r.days),
  slots: (params: AvailabilityQuery & { date: string }) =>
    call<{ slots: Slot[] }>(`/availability?${query(params, { date: params.date })}`).then((r) => r.slots),
  createBooking: (input: {
    serviceIds: string[];
    barberId: string;
    startsAt: string;
    client: { name: string; phone: string };
  }) => call<Booking>("/bookings", { method: "POST", body: JSON.stringify(input) }),
  me: () => call<Me>("/me"),
  myBookings: () => call<{ upcoming: Booking[]; past: Booking[] }>("/me/bookings"),
  cancel: (token: string) => call<Booking>(`/bookings/${encodeURIComponent(token)}/cancel`, { method: "POST" }),
  reschedule: (token: string, startsAt: string) =>
    call<Booking>(`/bookings/${encodeURIComponent(token)}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ startsAt }),
    }),
};

const MESSAGES: Record<string, string> = {
  SLOT_TAKEN: "Это время только что заняли. Выберите другое — список обновлён.",
  TOO_SOON: "На это время уже нельзя записаться. Выберите более позднее.",
  OUTSIDE_WORKING_HOURS: "Это время больше недоступно. Выберите другое.",
  TOO_FAR: "На эту дату запись ещё не открыта.",
  TOO_LATE: "До начала осталось слишком мало времени — изменить запись уже нельзя.",
  NOT_ACTIVE: "Запись уже неактивна.",
  INVALID_INIT_DATA: "Сессия Telegram устарела. Закройте и откройте приложение заново.",
  NETWORK_ERROR: "Нет соединения. Проверьте интернет и попробуйте ещё раз.",
};

export const SLOT_ERROR_CODES = new Set(["SLOT_TAKEN", "TOO_SOON", "OUTSIDE_WORKING_HOURS", "TOO_FAR"]);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && MESSAGES[error.code]) return MESSAGES[error.code];
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
