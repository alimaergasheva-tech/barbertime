import type { FastifyRequest } from "fastify";
import { HttpError } from "../errors";
import { InitDataError, verifyInitData, type TelegramUser } from "./initData";

const SCHEME = "tma ";

/**
 * Telegram user from `Authorization: tma <initData>`, or null without the header.
 * A present but invalid header is always 401 — never silently treated as a guest.
 */
export function optionalTelegramUser(request: FastifyRequest): TelegramUser | null {
  const header = request.headers.authorization;
  if (!header?.startsWith(SCHEME)) return null;

  const botToken = request.server.config.telegramBotToken;
  if (!botToken) throw new HttpError(503, "TELEGRAM_NOT_CONFIGURED", "TELEGRAM_BOT_TOKEN is not set");

  try {
    return verifyInitData(header.slice(SCHEME.length), botToken).user;
  } catch (error) {
    if (error instanceof InitDataError) throw new HttpError(401, "INVALID_INIT_DATA", error.message);
    throw error;
  }
}

export function requireTelegramUser(request: FastifyRequest): TelegramUser {
  const user = optionalTelegramUser(request);
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "Open the app from Telegram");
  return user;
}
