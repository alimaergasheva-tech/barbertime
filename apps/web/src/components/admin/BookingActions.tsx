import { rescheduleBookingAction, setBookingStatusAction } from "@/app/admin/actions";
import { formatClock, shopDate } from "@/lib/admin/format";
import type { AdminBooking, BookingStatus } from "@/lib/admin/types";
import { ActionForm } from "./ActionForm";
import styles from "./admin.module.css";

function StatusButton({ booking, status, label, tone, confirmText }: {
  booking: AdminBooking;
  status: BookingStatus;
  label: string;
  tone?: "secondary" | "danger";
  confirmText?: string;
}) {
  return (
    <ActionForm action={setBookingStatusAction} confirmText={confirmText} label={`${label}: ${booking.client.name}`}>
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`${styles.button} ${styles.small} ${tone ? styles[tone] : ""}`}>
        {label}
      </button>
    </ActionForm>
  );
}

export function BookingActions({ booking }: { booking: AdminBooking }) {
  if (booking.status !== "confirmed") {
    return <StatusButton booking={booking} status="confirmed" label="Вернуть" tone="secondary" />;
  }
  return (
    <div className={styles.actions}>
      <StatusButton booking={booking} status="completed" label="Пришёл" />
      <StatusButton booking={booking} status="no_show" label="Неявка" tone="secondary" />
      <StatusButton
        booking={booking}
        status="cancelled"
        label="Отменить"
        tone="danger"
        confirmText={`Отменить запись ${booking.client.name}? Клиент получит уведомление, если подключён Telegram.`}
      />
      <details>
        <summary className={`${styles.button} ${styles.small} ${styles.secondary}`}>Перенести</summary>
        <ActionForm action={rescheduleBookingAction} className={styles.actions} label={`Перенос: ${booking.client.name}`}>
          <input type="hidden" name="id" value={booking.id} />
          <input className={styles.input} type="date" name="date" defaultValue={shopDate(booking.startsAt)} required aria-label="Дата" />
          <input className={styles.input} type="time" name="time" defaultValue={formatClock(booking.startsAt)} required aria-label="Время" />
          <button type="submit" className={`${styles.button} ${styles.small}`}>
            Сохранить
          </button>
        </ActionForm>
      </details>
    </div>
  );
}
