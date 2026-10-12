import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

export type ErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);

export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`,
    } satisfies ErrorBody);
  });

  app.setErrorHandler((error: FastifyError | HttpError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      } satisfies ErrorBody);
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ code: error.code, message: error.message } satisfies ErrorBody);
    }

    const status = error.statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send({ code: error.code ?? "BAD_REQUEST", message: error.message } satisfies ErrorBody);
    }

    request.log.error(error);
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" } satisfies ErrorBody);
  });
}
