import type { Api, RawApi } from "grammy";
import type { UserFromGetMe } from "grammy/types";

export const TEST_BOT_INFO: UserFromGetMe = {
  id: 42,
  is_bot: true,
  first_name: "Barber Time",
  username: "barbertime_test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

export type ApiCall = { method: keyof RawApi; payload: Record<string, unknown> };

/** Answers every Bot API request locally and records it; no network. */
export function recordApiCalls(api: Api): ApiCall[] {
  const calls: ApiCall[] = [];
  let messageId = 0;
  api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const result =
      method === "sendMessage" || method === "editMessageText"
        ? { message_id: ++messageId, date: 0, chat: { id: 1, type: "private" }, text: "" }
        : true;
    return { ok: true, result } as never;
  });
  return calls;
}

let updateId = 0;
const user = (id: number) => ({ id, is_bot: false, first_name: "Тест" });

export function textUpdate(fromId: number, text: string) {
  const entities = text.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }] : undefined;
  return {
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: "private" as const, first_name: "Тест" },
      from: user(fromId),
      text,
      entities,
    },
  };
}

export function callbackUpdate(fromId: number, data: string) {
  return {
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      chat_instance: "e2e",
      from: user(fromId),
      data,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: fromId, type: "private" as const, first_name: "Тест" },
        text: "",
      },
    },
  };
}
