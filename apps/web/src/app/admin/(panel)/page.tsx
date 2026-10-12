import Link from "next/link";
import { BookingTable } from "@/components/admin/BookingTable";
import { adminFetch } from "@/lib/admin/api";
import { formatDay, formatSum, shopDate } from "@/lib/admin/format";
import type { AdminBooking } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

export default async function TodayPage() {
  const today = shopDate();
  const bookings = await adminFetch<AdminBooking[]>(`/bookings?from=${today}&to=${today}`);
  const active = bookings.filter((b) => b.status !== "cancelled");
  const expected = active.filter((b) => b.status !== "no_show").reduce((sum, b) => sum + b.totalPrice, 0);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Сегодня</h1>
          <p className={styles.subtitle}>
            {formatDay(today)} · визитов: {active.length} · ожидаемая выручка: {formatSum(expected)}
          </p>
        </div>
        <Link href="/admin/bookings/new" className={styles.button}>
          Новая запись
        </Link>
      </div>
      <BookingTable bookings={bookings} timeOnly />
    </>
  );
}
