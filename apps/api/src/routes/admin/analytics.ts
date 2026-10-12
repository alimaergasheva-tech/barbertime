import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  barberLoad,
  cancellations,
  heatmap,
  type Period,
  periodDays,
  popularServices,
  retention,
  revenue,
} from "../../analytics/analytics";
import { loadSettings } from "../../booking/settings";
import { IsoDate } from "../schemas";

export const MAX_PERIOD_DAYS = 366;

const PeriodQuery = z
  .object({ from: IsoDate, to: IsoDate })
  .refine((p) => p.from <= p.to, "from must not be after to")
  .refine((p) => periodDays(p) <= MAX_PERIOD_DAYS, `Period is limited to ${MAX_PERIOD_DAYS} days`);

export const adminAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app;
  const sections = {
    revenue,
    services: popularServices,
    load: barberLoad,
    heatmap,
    cancellations,
    retention,
  } satisfies Record<string, (prisma: typeof app.prisma, period: Period, tz: string) => Promise<unknown>>;

  for (const [name, compute] of Object.entries(sections)) {
    app.get(`/analytics/${name}`, async (request) => {
      const period = PeriodQuery.parse(request.query);
      const { timezone } = await loadSettings(prisma);
      return { period, data: await compute(prisma, period, timezone) };
    });
  }
};
