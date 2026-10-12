export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

export type Barber = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  specialties: string[];
  serviceIds: string[];
  rating: number | null;
  reviewCount: number;
};

export type Slot = {
  time: string;
  startsAt: string;
  barberIds: string[];
};

export type AvailabilityDay = {
  date: string;
  available: boolean;
};

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";

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

export type Me = {
  user: { id: number; firstName: string; lastName?: string; username?: string };
  client: { name: string; phone: string } | null;
};

export const ANY_BARBER = "any";
