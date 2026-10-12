import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { login, logout } from "../../admin/auth";
import { LoginLimiter } from "../../admin/rateLimit";
import { HttpError } from "../../errors";

const LoginBody = z.object({
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const LOGIN_LIMIT = { perKey: 5, windowMs: 15 * 60 * 1000 };

export const adminAuthRoutes: FastifyPluginAsync<{ limiter?: LoginLimiter }> = async (app, options) => {
  const limiter = options.limiter ?? new LoginLimiter(LOGIN_LIMIT);

  app.post("/login", async (request) => {
    const body = LoginBody.parse(request.body);
    // The web server forwards the browser's address; the login key bounds attempts even if it is spoofed.
    const forwarded = request.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") || request.ip;
    const keys = [`login:${body.login.toLowerCase()}`, `ip:${ip}`];

    const wait = limiter.retryAfter(keys);
    if (wait > 0) {
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", `Too many attempts. Try again in ${Math.ceil(wait / 60_000)} min`);
    }
    const session = await login(app.prisma, body.login, body.password);
    if (!session) {
      limiter.fail(keys);
      throw new HttpError(401, "INVALID_CREDENTIALS", "Wrong login or password");
    }
    limiter.reset([keys[0]]);
    return { token: session.token, expiresAt: session.expiresAt.toISOString(), admin: { login: session.admin.login } };
  });

  app.post("/logout", async (request, reply) => {
    await logout(app.prisma, request);
    return reply.code(204).send();
  });
};
