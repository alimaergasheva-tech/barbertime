import type { PrismaClient } from "@barbershop/db";
import type { Db } from "../../../../supabase/functions/notifications/core.ts";

/** Runs the Edge Function core against Prisma (local runs and tests). */
export function prismaDb(prisma: PrismaClient): Db {
  return { query: (text, params = []) => prisma.$queryRawUnsafe(text, ...params) };
}
