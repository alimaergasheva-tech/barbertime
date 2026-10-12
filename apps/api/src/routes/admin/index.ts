import multipart from "@fastify/multipart";
import type { FastifyPluginAsync } from "fastify";
import { requireAdmin } from "../../admin/auth";
import type { LoginLimiter } from "../../admin/rateLimit";
import { MAX_IMAGE_BYTES } from "../../admin/storage";
import { adminAnalyticsRoutes } from "./analytics";
import { adminAuthRoutes } from "./auth";
import { adminBookingRoutes } from "./bookings";
import { adminCatalogRoutes } from "./catalog";
import { adminMiscRoutes } from "./misc";
import { adminScheduleRoutes } from "./schedule";

/** /api/v1/admin — called only by the Next.js server with the session token as Bearer. */
export const adminRoutes: FastifyPluginAsync<{ limiter?: LoginLimiter }> = async (app, options) => {
  await app.register(adminAuthRoutes, { limiter: options.limiter });

  await app.register(async (secured) => {
    secured.addHook("preHandler", requireAdmin);
    await secured.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 } });
    for (const routes of [adminBookingRoutes, adminCatalogRoutes, adminScheduleRoutes, adminMiscRoutes, adminAnalyticsRoutes]) {
      await secured.register(routes);
    }
  });
};
