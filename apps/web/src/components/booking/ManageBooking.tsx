"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { shop } from "@/data/mock";
import { ApiRequestError, cancelBooking, rescheduleBooking } from "@/lib/bookingApi";
import { formatDuration, formatPrice } from "@/lib/format";
import { BOOKING_HORIZON_DAYS, formatLongDate, shopClock, shopDate, upcomingDates, addDays } from "@/lib/time";
import type { Booking, BookingStatus } from "@/types";
import { DateStep, TimeStep } from "./Steps";
import { useDays, useSlots } from "./useSlots";
import styles from "./Booking.module.css";
import manage from "./ManageBooking.module.css";

type Mode = "view" | "confirm-cancel" | "reschedule";

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Неявка",
};

const ERROR_TEXT: Record<string, string> = {
  SLOT_TAKEN: "Это время только что заняли. Выберите другое — список обновлён.",
  TOO_SOON: "На это время уже нельзя записаться. Выберите более позднее.",
  OUTSIDE_WORKING_HOURS: "Это время больше недоступно. Выберите другое.",
  TOO_FAR: "На эту дату запись ещё не открыта.",
  TOO_LATE: "До начала осталось слишком мало времени — изменить запись онлайн уже нельзя.",
  NOT_ACTIVE: "Запись уже неактивна. Обновите страницу.",
};

const SLOT_CODES = new Set(["SLOT_TAKEN", "TOO_SOON", "OUTSIDE_WORKING_HOURS", "TOO_FAR"]);

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError && ERROR_TEXT[error.code]) return ERROR_TEXT[error.code];
  return "Не удалось выполнить действие. Проверьте подключение и попробуйте ещё раз.";
}

function when(iso: string): string {
  return `${formatLongDate(shopDate(iso))}, ${shopClock(iso)}`;
}

export function ManageBooking({ initialBooking }: { initialBooking: Booking }) {
  const [booking, setBooking] = useState(initialBooking);
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const dates = useMemo(() => upcomingDates(BOOKING_HORIZON_DAYS), []);
  const query = {
    serviceIds: booking.services.map((service) => service.id),
    barberId: mode === "reschedule" ? booking.barber.id : null,
    rescheduleToken: booking.token,
  };
  const availability = useDays(query);
  const slotsState = useSlots({ ...query, date, attempt });
  const selectedSlot =
    slotsState.status === "ready" ? slotsState.slots.find((slot) => slot.time === time) : undefined;

  const panelRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (mode !== "view") panelRef.current?.focus();
  }, [mode]);

  function open(next: Mode) {
    setError(null);
    setNotice(null);
    setMode(next);
    if (next === "reschedule") {
      setDate(null);
      setTime(null);
    }
  }

  function selectDate(value: string) {
    setDate(value);
    setTime(null);
  }

  async function run(action: () => Promise<Booking>, success: (result: Booking) => string) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      setBooking(result);
      setMode("view");
      setNotice(success(result));
    } catch (failure) {
      setError(errorText(failure));
      if (failure instanceof ApiRequestError && SLOT_CODES.has(failure.code)) {
        setTime(null);
        setAttempt((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  const isActive = booking.status === "confirmed";

  return (
    <section className={styles.success} aria-labelledby="booking-title">
      <div className={styles.successStripe} aria-hidden="true" />
      <div className={manage.head}>
        <h1 id="booking-title" className={styles.pageTitle}>
          Ваша запись
        </h1>
        <span className={`${manage.badge} ${manage[booking.status]}`}>{STATUS_LABEL[booking.status]}</span>
      </div>
      <p className={`${styles.successWhen} ${isActive ? "" : manage.muted}`}>{when(booking.startsAt)}</p>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <dl className={styles.summaryList}>
        <div>
          <dt>Мастер</dt>
          <dd>{booking.barber.name}</dd>
        </div>
        <div>
          <dt>Услуги</dt>
          <dd>{booking.services.map((service) => service.name).join(", ")}</dd>
        </div>
        <div>
          <dt>Длительность</dt>
          <dd>{formatDuration(booking.totalDurationMin)}</dd>
        </div>
        <div>
          <dt>К оплате в барбершопе</dt>
          <dd>{formatPrice(booking.totalPrice)}</dd>
        </div>
        <div>
          <dt>Адрес</dt>
          <dd>
            {shop.address}. {shop.landmark}
          </dd>
        </div>
      </dl>

      {isActive && !booking.canChange && (
        <p className={styles.hint}>
          До начала меньше {booking.cancelCutoffMin} минут — изменить запись онлайн уже нельзя. Позвоните:{" "}
          <a href={shop.phoneHref}>{shop.phone}</a>
        </p>
      )}

      {isActive && booking.canChange && mode === "view" && (
        <>
          <p className={styles.hint}>
            Отменить или перенести запись можно не позднее чем за {booking.cancelCutoffMin} минут до начала.
          </p>
          <div className={styles.messageActions}>
            <button type="button" className="btn btn-primary" onClick={() => open("reschedule")}>
              Перенести
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => open("confirm-cancel")}>
              Отменить запись
            </button>
            <a
              href={`https://t.me/${shop.telegramBot}?start=b_${booking.token}`}
              className="btn btn-ghost"
              target="_blank"
              rel="noopener noreferrer"
            >
              Напоминания в Telegram
            </a>
          </div>
        </>
      )}

      {isActive && mode === "confirm-cancel" && (
        <div className={manage.panel}>
          <h2 ref={panelRef} tabIndex={-1} className={manage.panelTitle}>
            Отменить запись на {when(booking.startsAt)}?
          </h2>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.messageActions}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              aria-busy={busy}
              onClick={() => run(() => cancelBooking(booking.token), () => "Запись отменена.")}
            >
              {busy ? "Отменяем…" : "Да, отменить"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => open("view")}>
              Не отменять
            </button>
          </div>
        </div>
      )}

      {isActive && mode === "reschedule" && (
        <div className={manage.panel}>
          <h2 ref={panelRef} tabIndex={-1} className={manage.panelTitle}>
            Новое время
          </h2>
          <DateStep dates={dates} selected={date} availability={availability} onSelect={selectDate} />
          {date && (
            <div className={manage.times}>
              <TimeStep
                state={slotsState}
                date={date}
                selected={time}
                canPickOtherBarber={false}
                onSelect={setTime}
                onRetry={() => setAttempt((value) => value + 1)}
                onNextDay={() => {
                  const next = addDays(date, 1);
                  if (dates.includes(next)) selectDate(next);
                }}
                onOtherBarber={() => {}}
              />
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.messageActions}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedSlot || busy}
              aria-busy={busy}
              onClick={() =>
                selectedSlot &&
                run(
                  () => rescheduleBooking(booking.token, selectedSlot.startsAt),
                  (result) => `Запись перенесена на ${when(result.startsAt)}.`,
                )
              }
            >
              {busy ? "Сохраняем…" : "Перенести на это время"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => open("view")}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {!isActive && (
        <div className={styles.messageActions}>
          <Link href="/book" className="btn btn-primary" transitionTypes={["nav-forward"]}>
            Записаться снова
          </Link>
        </div>
      )}

      <p className={manage.footer}>
        <Link href="/" transitionTypes={["nav-back"]}>
          На главную
        </Link>
      </p>
    </section>
  );
}
