import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type TelegramUser = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
};

export class InitDataError extends Error {
  constructor(readonly reason: "missing_hash" | "bad_signature" | "expired" | "bad_user") {
    super(`Invalid Telegram initData: ${reason}`);
  }
}

const UserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

/** Default lifetime of initData accepted by the API. */
export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function sign(params: URLSearchParams, botToken: string): Buffer {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(dataCheckString(params)).digest();
}

/**
 * Validates Mini App initData as described in
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(
  raw: string,
  botToken: string,
  { maxAgeSec = INIT_DATA_MAX_AGE_SEC, now = Date.now() }: { maxAgeSec?: number; now?: number } = {},
): { user: TelegramUser; authDate: number } {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new InitDataError("missing_hash");

  const expected = sign(params, botToken);
  if (!timingSafeEqual(Buffer.from(hash, "hex"), expected)) throw new InitDataError("bad_signature");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSec) throw new InitDataError("expired");

  let user: z.infer<typeof UserSchema>;
  try {
    user = UserSchema.parse(JSON.parse(params.get("user") ?? ""));
  } catch {
    throw new InitDataError("bad_user");
  }

  return {
    authDate,
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      languageCode: user.language_code,
    },
  };
}

/** Builds signed initData the way Telegram does — for tests and local tooling only. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  params.set("hash", sign(params, botToken).toString("hex"));
  return params.toString();
}
