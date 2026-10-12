import { z } from "zod";
import type { PrismaClient } from "@barbershop/db";

const SettingsSchema = z.object({
  cancel_cutoff_min: z.coerce.number().int().min(0).default(30),
  slot_step_min: z.coerce.number().int().min(5).max(120).default(15),
  booking_horizon_days: z.coerce.number().int().min(1).max(365).default(30),
  min_notice_min: z.coerce.number().int().min(0).default(30),
  timezone: z.string().default("Asia/Tashkent"),
});

export type BookingSettings = {
  cancelCutoffMin: number;
  slotStepMin: number;
  horizonDays: number;
  minNoticeMin: number;
  timezone: string;
};

export async function loadSettings(prisma: PrismaClient): Promise<BookingSettings> {
  const rows = await prisma.setting.findMany();
  const raw = SettingsSchema.parse(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  return {
    cancelCutoffMin: raw.cancel_cutoff_min,
    slotStepMin: raw.slot_step_min,
    horizonDays: raw.booking_horizon_days,
    minNoticeMin: raw.min_notice_min,
    timezone: raw.timezone,
  };
}
