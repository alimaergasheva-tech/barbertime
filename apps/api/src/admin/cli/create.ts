/**
 * Creates an admin or resets its password (Argon2id):
 *   npm run admin:create -- [login]            password from ADMIN_PASSWORD or generated and printed once
 *   npm run admin:create -- <login> --delete   removes the admin and its sessions
 */
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "@barbershop/db";
import { hashPassword } from "../auth";

const args = process.argv.slice(2);
const login = (args.find((arg) => !arg.startsWith("--")) ?? process.env.ADMIN_LOGIN ?? "admin").trim();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const prisma = createPrismaClient(process.env.DATABASE_URL);
try {
  if (args.includes("--delete")) {
    const { count } = await prisma.adminUser.deleteMany({ where: { login } });
    console.log(count ? `Admin "${login}" deleted` : `Admin "${login}" not found`);
  } else {
    const fromEnv = process.env.ADMIN_PASSWORD;
    if (fromEnv && fromEnv.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
    const password = fromEnv || randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(password);
    const existing = await prisma.adminUser.findUnique({ where: { login } });
    if (existing) {
      await prisma.$transaction([
        prisma.adminUser.update({ where: { login }, data: { passwordHash } }),
        prisma.adminSession.deleteMany({ where: { adminId: existing.id } }),
      ]);
    } else {
      await prisma.adminUser.create({ data: { login, passwordHash } });
    }
    console.log(`Admin "${login}" ${existing ? "password reset" : "created"}.`);
    if (!fromEnv) console.log(`Password (shown once): ${password}`);
  }
} finally {
  await prisma.$disconnect();
}
