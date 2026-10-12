import type { AvailabilityDay, Booking, CreateBookingInput, Slot } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Network error");
  }
  const body = (await response.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!response.ok) {
    throw new ApiRequestError(response.status, body?.code ?? "API_ERROR", body?.message ?? response.statusText);
  }
  return body as T;
}

type AvailabilityParams = {
  serviceIds: string[];
  barberId: string;
  rescheduleToken?: string;
};

function availabilityQuery(params: AvailabilityParams, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({
    serviceIds: params.serviceIds.join(","),
    barberId: params.barberId,
    ...extra,
  });
  if (params.rescheduleToken) query.set("rescheduleToken", params.rescheduleToken);
  return query.toString();
}

export async function fetchSlots(params: AvailabilityParams & { date: string }): Promise<Slot[]> {
  const result = await call<{ slots: Slot[] }>(`/availability?${availabilityQuery(params, { date: params.date })}`);
  return result.slots;
}

export async function fetchDays(params: AvailabilityParams): Promise<AvailabilityDay[]> {
  const result = await call<{ days: AvailabilityDay[] }>(`/availability/days?${availabilityQuery(params)}`);
  return result.days;
}

export function createBooking(input: CreateBookingInput): Promise<Booking> {
  return call<Booking>("/bookings", { method: "POST", body: JSON.stringify(input) });
}

export function cancelBooking(token: string): Promise<Booking> {
  return call<Booking>(`/bookings/${encodeURIComponent(token)}/cancel`, { method: "POST" });
}

export function rescheduleBooking(token: string, startsAt: string): Promise<Booking> {
  return call<Booking>(`/bookings/${encodeURIComponent(token)}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ startsAt }),
  });
}
