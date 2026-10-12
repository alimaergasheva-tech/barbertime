import { useState } from "react";
import { api, ApiError, errorMessage, SLOT_ERROR_CODES } from "./api";
import { formatDuration, formatPrice, formatWhen } from "./format";
import { DayPicker, TimePicker } from "./pickers";
import { confirmAction, haptic, isInTelegram, useBackButton } from "./telegram";
import type { Booking, BookingStatus, Slot } from "./types";
import { useAsync } from "./useAsync";

const STATUS: Record<BookingStatus, string> = {
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Неявка",
};

function Reschedule({ booking, onDone, onClose }: {
  booking: Booking;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const query = { serviceIds: booking.services.map((s) => s.id), barberId: booking.barber.id, rescheduleToken: booking.token };

  useBackButton(onClose);

  async function save() {
    if (!slot) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.reschedule(booking.token, slot.startsAt);
      haptic.success();
      onDone(`Запись перенесена на ${formatWhen(updated.startsAt)}`);
    } catch (failure) {
      haptic.error();
      if (failure instanceof ApiError && SLOT_ERROR_CODES.has(failure.code)) {
        setSlot(null);
        setRefresh((value) => value + 1);
      }
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="reschedule-title">
      <h2 id="reschedule-title" className="step-title">
        Перенос записи
      </h2>
      <p className="hint">
        {booking.barber.name} · сейчас {formatWhen(booking.startsAt)}
      </p>
      <DayPicker
        query={query}
        selected={date}
        onSelect={(value) => {
          setDate(value);
          setSlot(null);
        }}
      />
      {date && <TimePicker query={query} date={date} refresh={refresh} selected={slot} onSelect={setSlot} />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="bar">
        <button type="button" className="button secondary" onClick={onClose}>
          Назад
        </button>
        <button type="button" className="button" disabled={!slot || saving} aria-busy={saving} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Перенести"}
        </button>
      </div>
    </section>
  );
}

function BookingCard({ booking, busy, onCancel, onReschedule }: {
  booking: Booking;
  busy: boolean;
  onCancel?: () => void;
  onReschedule?: () => void;
}) {
  return (
    <article className="card booking" data-status={booking.status}>
      <header>
        <p className="when">{formatWhen(booking.startsAt)}</p>
        <span className="status">{STATUS[booking.status]}</span>
      </header>
      <p>{booking.services.map((s) => s.name).join(", ")}</p>
      <p className="hint">
        {booking.barber.name} · {formatDuration(booking.totalDurationMin)} · {formatPrice(booking.totalPrice)}
      </p>
      {booking.status === "confirmed" &&
        (booking.canChange ? (
          <div className="actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onReschedule}>
              Перенести
            </button>
            <button type="button" className="button danger" disabled={busy} onClick={onCancel}>
              Отменить
            </button>
          </div>
        ) : (
          <p className="hint">
            Изменить запись можно не позднее чем за {formatDuration(booking.cancelCutoffMin)} до начала — позвоните нам.
          </p>
        ))}
    </article>
  );
}

export function MyBookings({ onBook }: { onBook: () => void }) {
  const list = useAsync(isInTelegram ? "my-bookings" : null, api.myBookings);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isInTelegram) {
    return (
      <div className="message">
        <p>Список записей доступен, когда приложение открыто в Telegram.</p>
        <button type="button" className="button" onClick={onBook}>
          Записаться
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <Reschedule
        booking={editing}
        onClose={() => setEditing(null)}
        onDone={(message) => {
          setEditing(null);
          setNotice(message);
          list.reload();
        }}
      />
    );
  }

  async function cancel(booking: Booking) {
    if (!(await confirmAction(`Отменить запись на ${formatWhen(booking.startsAt)}?`))) return;
    setBusyToken(booking.token);
    setNotice(null);
    try {
      await api.cancel(booking.token);
      haptic.success();
      setNotice("Запись отменена");
      list.reload();
    } catch (failure) {
      haptic.error();
      setNotice(errorMessage(failure));
    } finally {
      setBusyToken(null);
    }
  }

  if (list.status === "error") {
    return (
      <div className="message" role="alert">
        <p>{errorMessage(list.error)}</p>
        <button type="button" className="button secondary" onClick={list.reload}>
          Повторить
        </button>
      </div>
    );
  }
  if (list.status !== "ready") {
    return (
      <div aria-busy="true">
        <div className="card skeleton tall" />
        <div className="card skeleton tall" />
      </div>
    );
  }

  const { upcoming, past } = list.data;
  return (
    <>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <h2 className="step-title">Предстоящие</h2>
      {upcoming.length === 0 ? (
        <div className="message">
          <p>Активных записей нет.</p>
          <button type="button" className="button" onClick={onBook}>
            Записаться
          </button>
        </div>
      ) : (
        upcoming.map((booking) => (
          <BookingCard
            key={booking.token}
            booking={booking}
            busy={busyToken === booking.token}
            onCancel={() => void cancel(booking)}
            onReschedule={() => {
              setNotice(null);
              setEditing(booking);
            }}
          />
        ))
      )}
      {past.length > 0 && (
        <>
          <h2 className="step-title">История</h2>
          {past.map((booking) => (
            <BookingCard key={booking.token} booking={booking} busy={false} />
          ))}
        </>
      )}
    </>
  );
}
