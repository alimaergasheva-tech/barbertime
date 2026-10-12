import { formatClock, formatDateTime, formatSum, SOURCE_LABEL, STATUS_LABEL } from "@/lib/admin/format";
import type { AdminBooking } from "@/lib/admin/types";
import { BookingActions } from "./BookingActions";
import styles from "./admin.module.css";

export function BookingTable({ bookings, timeOnly = false }: { bookings: AdminBooking[]; timeOnly?: boolean }) {
  if (bookings.length === 0) return <p className={styles.empty}>Записей нет.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Время</th>
          <th>Клиент</th>
          <th>Мастер</th>
          <th>Услуги</th>
          <th>Сумма</th>
          <th>Статус</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {bookings.map((booking) => (
          <tr key={booking.id} data-booking={booking.id}>
            <td data-label="Время">
              <strong>{timeOnly ? formatClock(booking.startsAt) : formatDateTime(booking.startsAt)}</strong>
              <br />
              <span className={styles.muted}>до {formatClock(booking.endsAt)}</span>
            </td>
            <td data-label="Клиент">
              {booking.client.name}
              <br />
              <a href={`tel:${booking.client.phone}`} className={styles.muted}>
                {booking.client.phone}
              </a>
              {booking.client.telegram && <span className={styles.muted}> · TG</span>}
            </td>
            <td data-label="Мастер">{booking.barber.name}</td>
            <td data-label="Услуги">
              {booking.services.map((s) => s.name).join(", ")}
              <br />
              <span className={styles.muted}>{SOURCE_LABEL[booking.source]}</span>
            </td>
            <td data-label="Сумма">{formatSum(booking.totalPrice)}</td>
            <td data-label="Статус">
              <span className={styles.badge} data-status={booking.status}>
                {STATUS_LABEL[booking.status]}
              </span>
            </td>
            <td>
              <BookingActions booking={booking} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
