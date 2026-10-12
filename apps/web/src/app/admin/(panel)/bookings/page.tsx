import Link from "next/link";
import { BookingTable } from "@/components/admin/BookingTable";
import { adminFetch } from "@/lib/admin/api";
import { addDays, shopDate, STATUS_LABEL } from "@/lib/admin/format";
import type { AdminBarberListItem, AdminBooking } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

type Search = { from?: string; to?: string; barberId?: string; status?: string; q?: string };

const isDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const today = shopDate();
  const from = isDate(params.from) ? params.from! : today;
  const to = isDate(params.to) && params.to! >= from ? params.to! : addDays(from, 6);

  const query = new URLSearchParams({ from, to });
  if (params.barberId) query.set("barberId", params.barberId);
  if (params.status && params.status in STATUS_LABEL) query.set("status", params.status);
  if (params.q) query.set("q", params.q);

  const [bookings, barbers] = await Promise.all([
    adminFetch<AdminBooking[]>(`/bookings?${query}`),
    adminFetch<AdminBarberListItem[]>("/barbers"),
  ]);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Записи</h1>
          <p className={styles.subtitle}>Найдено: {bookings.length}</p>
        </div>
        <Link href="/admin/bookings/new" className={styles.button}>
          Новая запись
        </Link>
      </div>

      <form className={`${styles.card} ${styles.grid}`} aria-label="Фильтры">
        <label className={styles.field}>
          С
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className={styles.field}>
          По
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label className={styles.field}>
          Мастер
          <select name="barberId" defaultValue={params.barberId ?? ""}>
            <option value="">Все</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Статус
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">Все</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Клиент
          <input name="q" defaultValue={params.q ?? ""} placeholder="Имя или телефон" maxLength={60} />
        </label>
        <button type="submit" className={styles.button}>
          Показать
        </button>
      </form>

      <BookingTable bookings={bookings} />
    </>
  );
}
