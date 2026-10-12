import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@barbershop/db";
import { HttpError } from "../errors";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminIdentity = { id: string; login: string };

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminIdentity;
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => hash(password);

/** Verifying against a dummy hash keeps response time the same for unknown logins. */
let dummyHash: Promise<string> | undefined;

export async function login(prisma: PrismaClient, loginName: string, password: string, now = Date.now()) {
  const admin = await prisma.adminUser.findUnique({ where: { login: loginName } });
  dummyHash ??= hash(randomBytes(16).toString("hex"));
  const ok = await verify(admin?.passwordHash ?? (await dummyHash), password).catch(() => false);
  if (!admin || !ok) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  await prisma.$transaction([
    prisma.adminSession.deleteMany({ where: { adminId: admin.id, expiresAt: { lt: new Date(now) } } }),
    prisma.adminSession.create({ data: { id: hashToken(token), adminId: admin.id, expiresAt } }),
  ]);
  return { token, expiresAt, admin: { id: admin.id, login: admin.login } };
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function logout(prisma: PrismaClient, request: FastifyRequest) {
  const token = bearer(request);
  if (token) await prisma.adminSession.deleteMany({ where: { id: hashToken(token) } });
}

/** preHandler for every admin route except login. */
export async function requireAdmin(request: FastifyRequest) {
  const token = bearer(request);
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "Admin session required");
  const session = await request.server.prisma.adminSession.findUnique({
    where: { id: hashToken(token) },
    include: { admin: { select: { id: true, login: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, "UNAUTHORIZED", "Session expired");
  }
  request.admin = session.admin;
}
