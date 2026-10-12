import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", db: "ok" };
    } catch (error) {
      app.log.error(error, "database health check failed");
      return reply.code(503).send({ status: "degraded", db: "unreachable" });
    }
  });
};
