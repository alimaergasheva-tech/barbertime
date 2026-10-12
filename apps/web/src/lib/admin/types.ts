export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";
export type BookingSource = "web" | "telegram" | "admin";

export type AdminBooking = {
  id: string;
  token: string;
  status: BookingStatus;
  source: BookingSource;
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  createdAt: string;
  barber: { id: string; name: string };
  client: { name: string; phone: string; telegram: boolean };
  services: { id: string; name: string }[];
};

export type AdminService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  barberCount: number;
};

export type AdminBarberListItem = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  experienceYears: number;
  specialties: string[];
  isActive: boolean;
  sortOrder: number;
  telegramLinked: boolean;
  serviceCount: number;
};

export type ScheduleDay = { weekday: number; start: string; end: string; breaks: { start: string; end: string }[] };

export type AdminBarber = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  specialties: string[];
  photoUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  telegramLinked: boolean;
  services: {
    serviceId: string;
    name: string;
    isActive: boolean;
    baseDurationMin: number;
    basePrice: number;
    enabled: boolean;
    durationMin: number | null;
    price: number | null;
  }[];
  schedule: ScheduleDay[];
  portfolio: { id: string; imageUrl: string }[];
};

export type TimeOffType = "day_off" | "vacation" | "sick" | "holiday" | "other";

export type AdminTimeOff = {
  id: string;
  barber: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string;
  type: TimeOffType;
  note: string | null;
  conflicts: number;
};

export type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  isPublic: boolean;
  createdAt: string;
  visitAt: string;
  barber: { id: string; name: string };
  clientName: string;
};

export type AdminSettings = {
  cancel_cutoff_min: number;
  slot_step_min: number;
  booking_horizon_days: number;
  min_notice_min: number;
  reminder_day_minutes: number;
  reminder_short_minutes: number;
  review_delay_min: number;
  review_public_min_rating: number;
  timezone: string;
};

export type AnalyticsPeriod = { from: string; to: string };
export type AnalyticsResponse<T> = { period: AnalyticsPeriod; data: T };

export type RevenueStats = {
  total: number;
  completed: number;
  averageCheck: number;
  previousTotal: number;
  previousCompleted: number;
  days: { date: string; revenue: number; completed: number }[];
};

export type StatusStats = {
  total: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  cancelRate: number | null;
  noShowRate: number | null;
  bySource: Record<BookingSource, number>;
};

export type ServiceStats = { serviceId: string; name: string; count: number; revenue: number }[];

export type BarberLoadStats = {
  barberId: string;
  name: string;
  isActive: boolean;
  availableMin: number;
  bookedMin: number;
  load: number | null;
  bookings: number;
  completed: number;
  revenue: number;
  cancelled: number;
  noShow: number;
}[];

export type HeatmapStats = { cells: { weekday: number; hour: number; count: number }[]; max: number };

export type RetentionStats = {
  clients: number;
  newClients: number;
  returningClients: number;
  returningRate: number | null;
  repeatInPeriod: number;
  visitsPerClient: number;
};

/** Result of every admin Server Action, shown by <ActionForm>. */
export type ActionState = { ok: boolean; message: string } | null;
