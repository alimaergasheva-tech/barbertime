import { loadEnv } from "./env";
import { createServerApp } from "./serverApp";

const env = loadEnv();
const { app, prisma, notifier } = await createServerApp(env);

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await notifier.idle();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
