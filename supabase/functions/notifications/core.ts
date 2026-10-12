/**
 * Background notifications: reminders, auto-completion and review requests.
 * Dependency-free so the same code runs in the Supabase Edge Function (Deno) and in Node.
 *
 * Idempotency: a booking is claimed by a single UPDATE that stamps `*_sent_at`
 * (FOR UPDATE SKIP LOCKED), and only claimed rows are messaged. A rerun or a concurrent
 * run cannot claim the same row twice. Transient Telegram failures release the claim.
 */

export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type RunOptions = {
  db: Db;
  telegramToken: string;
  /** Public site URL; https only is used for buttons. */
  appUrl?: string;
  now?: Date;
  fetch?: typeof fetch;
  batchSize?: number;
};

export type RunResult = {
  dayReminders: number;
  shortReminders: number;
  autoCompleted: number;
  reviewRequests: number;
  failed: number;
};

type Settings = {
  dayMin: number;
  shortMin: number;
  reviewDelayMin: number;
  timezone: string;
};

type Claimed = {
  id: string;
  manage_token: string;
  starts_at: string | Date;
  total_price: number;
  chat_id: string;
  barber_name: string;
  services: string;
};

type Kind = "day" | "short" | "review";

const COLUMN: Record<Kind, string> = {
  day: "reminder_day_sent_at",
  short: "reminder_30m_sent_at",
  review: "review_requested_at",
};

/** Requests to a chat that blocked the bot will never succeed — keep the claim. */
const PERMANENT_ERRORS = new Set([400, 403]);

const REVIEW_MAX_AGE_DAYS = 3;

async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM settings
     WHERE key IN ('reminder_day_minutes', 'reminder_short_minutes', 'review_delay_min', 'timezone')`,
  );
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const num = (key: string, fallback: number) => {
    const value = Number(map.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const timezone = map.get("timezone");
  return {
    dayMin: num("reminder_day_minutes", 1440),
    shortMin: num("reminder_short_minutes", 30),
    reviewDelayMin: num("review_delay_min", 60),
    timezone: typeof timezone === "string" ? timezone : "Asia/Tashkent",
  };
}

const RETURNING = `
  RETURNING b.id, b.manage_token, b.starts_at, b.total_price,
    (SELECT c.telegram_chat_id::text FROM clients c WHERE c.id = b.client_id) AS chat_id,
    (SELECT r.name FROM barbers r WHERE r.id = b.barber_id) AS barber_name,
    (SELECT string_agg(s.name, ', ' ORDER BY s.name) FROM booking_services s WHERE s.booking_id = b.id) AS services`;

function claimSql(kind: Kind, condition: string) {
  return `
    WITH due AS (
      SELECT b.id FROM bookings b
      JOIN clients c ON c.id = b.client_id
      WHERE b.${COLUMN[kind]} IS NULL AND c.telegram_chat_id IS NOT NULL AND ${condition}
      ORDER BY b.starts_at
      LIMIT $3
      FOR UPDATE OF b SKIP LOCKED
    )
    UPDATE bookings b SET ${COLUMN[kind]} = $1::timestamptz FROM due WHERE b.id = due.id
    ${RETURNING}`;
}

/** $1 = now, $2 = window minutes, $3 = batch size. */
const CLAIM: Record<Kind, string> = {
  // Within a day but not yet in the short window; skipped for bookings made less than ~a day ahead.
  day: claimSql(
    "day",
    `b.status = 'confirmed'
     AND b.starts_at <= $1::timestamptz + make_interval(mins => $2::int)
     AND b.starts_at > $1::timestamptz + make_interval(mins => $4::int)
     AND b.starts_at - b.created_at >= make_interval(mins => $2::int - 60)`,
  ),
  short: claimSql(
    "short",
    `b.status = 'confirmed'
     AND b.starts_at > $1::timestamptz
     AND b.starts_at <= $1::timestamptz + make_interval(mins => $2::int)
     AND b.starts_at - b.created_at >= make_interval(mins => $2::int)`,
  ),
  review: claimSql(
    "review",
    `b.status = 'completed'
     AND b.ends_at <= $1::timestamptz - make_interval(mins => $2::int)
     AND b.ends_at > $1::timestamptz - make_interval(days => ${REVIEW_MAX_AGE_DAYS})
     AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id)`,
  ),
};

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatWhen(value: string | Date, timeZone: string): string {
  const text = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatClock(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function publicUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname !== "localhost" ? url.replace(/\/$/, "") : undefined;
  } catch {
    return undefined;
  }
}

type Button = { text: string; callback_data?: string; url?: string };

export function buildMessage(kind: Kind, row: Claimed, settings: Settings, appUrl?: string) {
  const details = [
    `Мастер: ${escapeHtml(row.barber_name)}`,
    `Услуги: ${escapeHtml(row.services ?? "")}`,
  ].join("\n");

  if (kind === "review") {
    const buttons: Button[] = [1, 2, 3, 4, 5].map((n) => ({ text: "★".repeat(n), callback_data: `rate:${row.id}:${n}` }));
    return {
      text: `Спасибо, что были у нас! Как прошёл визит к мастеру ${escapeHtml(row.barber_name)}?\n\nОцените от 1 до 5:`,
      buttons: [buttons.slice(0, 3), buttons.slice(3)],
    };
  }

  const site = publicUrl(appUrl);
  const actions: Button[] = [{ text: "Отменить", callback_data: `cancel:${row.manage_token}` }];
  if (site) actions.unshift({ text: "Управлять записью", url: `${site}/booking/${row.manage_token}` });

  if (kind === "day") {
    return {
      text: `Напоминаем о визите в Barber Time\n\n<b>${escapeHtml(formatWhen(row.starts_at, settings.timezone))}</b>\n${details}`,
      buttons: [actions],
    };
  }
  return {
    text: `Скоро ваш визит: ждём вас в <b>${formatClock(row.starts_at, settings.timezone)}</b>\n\n${details}`,
    buttons: [],
  };
}

async function sendMessage(options: RunOptions, chatId: string, text: string, buttons: Button[][]) {
  const fetchFn = options.fetch ?? fetch;
  const response = await fetchFn(`https://api.telegram.org/bot${options.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined,
    }),
  });
  return response.status;
}

export async function runNotifications(options: RunOptions): Promise<RunResult> {
  const { db } = options;
  const now = (options.now ?? new Date()).toISOString();
  const batch = options.batchSize ?? 100;
  const settings = await loadSettings(db);
  const result: RunResult = { dayReminders: 0, shortReminders: 0, autoCompleted: 0, reviewRequests: 0, failed: 0 };

  async function handle(kind: Kind, windowMin: number, counter: keyof RunResult) {
    const params: unknown[] = [now, windowMin, batch];
    if (kind === "day") params.push(settings.shortMin);
    const rows = await db.query<Claimed>(CLAIM[kind], params);

    for (const row of rows) {
      const message = buildMessage(kind, row, settings, options.appUrl);
      let status = 0;
      try {
        status = await sendMessage(options, row.chat_id, message.text, message.buttons);
      } catch {
        status = 0;
      }
      if (status === 200) {
        result[counter] += 1;
        continue;
      }
      result.failed += 1;
      if (!PERMANENT_ERRORS.has(status)) {
        await db.query(`UPDATE bookings SET ${COLUMN[kind]} = NULL WHERE id = $1::uuid`, [row.id]);
      }
    }
  }

  // Short first: a booking entering the short window should not also get a day reminder.
  await handle("short", settings.shortMin, "shortReminders");
  await handle("day", settings.dayMin, "dayReminders");

  const completed = await db.query(
    `UPDATE bookings SET status = 'completed', auto_completed_at = $1::timestamptz
     WHERE status = 'confirmed' AND ends_at < $1::timestamptz
     RETURNING id`,
    [now],
  );
  result.autoCompleted = completed.length;

  await handle("review", settings.reviewDelayMin, "reviewRequests");
  return result;
}
