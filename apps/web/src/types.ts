export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

export type BarberTone = "teal" | "steel" | "brass";

/** Shape returned by GET /api/v1/barbers. */
export type ApiBarber = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  specialties: string[];
  serviceIds: string[];
  /** Average of public reviews; null while the barber has none. */
  rating: number | null;
  reviewCount: number;
};

export type Barber = ApiBarber & {
  tone: BarberTone;
};

export type Review = {
  id: string;
  author: string;
  barberId: string;
  rating: number;
  comment: string;
  date: string;
};

export type BarberSlots = {
  barberId: string;
  times: string[];
};

export type Slot = {
  /** Shop-local HH:MM */
  time: string;
  /** UTC ISO instant */
  startsAt: string;
  barberIds: string[];
};

export type AvailabilityDay = {
  date: string;
  available: boolean;
};

export type CreateBookingInput = {
  serviceIds: string[];
  /** Barber id or "any" — the API picks a free barber. */
  barberId: string;
  startsAt: string;
  client: {
    name: string;
    phone: string;
  };
};

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";

/** Shape returned by the bookings endpoints. */
export type Booking = {
  token: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  barber: { id: string; name: string };
  services: { id: string; name: string; durationMin: number; price: number }[];
  client: { name: string };
  cancelCutoffMin: number;
  canChange: boolean;
};
