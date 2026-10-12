import { describe, expect, it } from "vitest";
import { InitDataError, signInitData, verifyInitData } from "./initData";

const TOKEN = "123456:TEST-token";
const NOW = Date.UTC(2030, 0, 1, 12);
const user = { id: 777000, first_name: "Иван", username: "ivan" };

function initData(overrides: Record<string, string> = {}, token = TOKEN) {
  return signInitData(
    {
      query_id: "AAE",
      user: JSON.stringify(user),
      auth_date: String(Math.floor(NOW / 1000) - 60),
      ...overrides,
    },
    token,
  );
}

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof InitDataError ? error.reason : "other";
  }
  return "ok";
};

describe("verifyInitData", () => {
  it("accepts data signed with the bot token and extracts the user", () => {
    const result = verifyInitData(initData(), TOKEN, { now: NOW });
    expect(result.user).toEqual({ id: 777000, firstName: "Иван", username: "ivan", lastName: undefined, languageCode: undefined });
  });

  it("rejects data signed with another token", () => {
    expect(reason(() => verifyInitData(initData({}, "999:other"), TOKEN, { now: NOW }))).toBe("bad_signature");
  });

  it("rejects tampered fields", () => {
    const tampered = initData().replace("ivan", "admin");
    expect(reason(() => verifyInitData(tampered, TOKEN, { now: NOW }))).toBe("bad_signature");
  });

  it("rejects missing hash and expired data", () => {
    expect(reason(() => verifyInitData("user=%7B%7D&auth_date=1", TOKEN, { now: NOW }))).toBe("missing_hash");
    const old = initData({ auth_date: String(Math.floor(NOW / 1000) - 2 * 86400) });
    expect(reason(() => verifyInitData(old, TOKEN, { now: NOW }))).toBe("expired");
  });

  it("rejects a valid signature over a malformed user", () => {
    expect(reason(() => verifyInitData(initData({ user: "{\"id\":\"x\"}" }), TOKEN, { now: NOW }))).toBe("bad_user");
  });
});
