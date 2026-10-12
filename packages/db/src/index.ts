import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL,
  pool: { max?: number } = {},
): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...pool }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Lazily created singleton; reused across dev hot reloads to avoid exhausting connections. */
export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
