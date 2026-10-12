import { connection } from "next/server";
import type { ApiBarber, Barber, BarberSlots, BarberTone, Booking, Service, Slot } from "@/types";
import { todayInShop } from "./time";

// Server-only: read in Server Components, never shipped to the browser.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const TONES: BarberTone[] = ["teal", "steel", "brass"];

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

async function request<T>(path: string): Promise<T> {
  // Render per request: catalog and slots must be live, and the API is not reachable at build time.
  await connection();
  let response: Response;
  try {
    // Catalog changes from the admin panel must show up immediately.
    response = await fetch(`${API_URL}/api/v1${path}`, { cache: "no-store" });
  } catch (cause) {
    throw new ApiError(0, "API_UNREACHABLE", `API is unreachable at ${API_URL}: ${String(cause)}`);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      body?.code ?? "API_ERROR",
      body?.message ?? `GET ${path} failed with ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export function getServices(): Promise<Service[]> {
  return request<Service[]>("/services");
}

export async function getBarbers(): Promise<Barber[]> {
  const barbers = await request<ApiBarber[]>("/barbers");
  return barbers.map((barber, index) => ({ ...barber, tone: TONES[index % TONES.length] }));
}

export async function getCatalog(): Promise<{ services: Service[]; barbers: Barber[] }> {
  const [services, barbers] = await Promise.all([getServices(), getBarbers()]);
  return { services, barbers };
}

const HERO_SERVICE = "haircut";
const HERO_SLOTS_PER_BARBER = 3;

/** First free times today per barber for the hero ticket; a failing barber is just skipped. */
export async function getTodaySlots(barbers: Barber[]): Promise<BarberSlots[]> {
  const date = todayInShop();
  const rows = await Promise.all(
    barbers.map(async (barber) => {
      const serviceId = barber.serviceIds.includes(HERO_SERVICE) ? HERO_SERVICE : barber.serviceIds[0];
      if (!serviceId) return null;
      try {
        const query = new URLSearchParams({ serviceIds: serviceId, barberId: barber.id, date });
        const { slots } = await request<{ slots: Slot[] }>(`/availability?${query}`);
        return { barberId: barber.id, times: slots.slice(0, HERO_SLOTS_PER_BARBER).map((slot) => slot.time) };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((row): row is BarberSlots => row !== null && row.times.length > 0);
}

/** Free start times of a barber on a shop-local date; empty when the day is not bookable. */
export async function getSlots(serviceIds: string[], barberId: string, date: string): Promise<Slot[]> {
  try {
    const query = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId, date });
    return (await request<{ slots: Slot[] }>(`/availability?${query}`)).slots;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return [];
    throw error;
  }
}

/** Null when the token is unknown. */
export async function getBooking(token: string): Promise<Booking | null> {
  try {
    return await request<Booking>(`/bookings/${encodeURIComponent(token)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}
