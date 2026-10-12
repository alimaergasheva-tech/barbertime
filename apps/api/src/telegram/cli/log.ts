import type { Log } from "../notifier";

export const consoleLog: Log = {
  warn: (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};
