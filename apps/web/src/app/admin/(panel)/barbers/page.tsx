import Link from "next/link";
import { createBarberAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { BarberFields } from "@/components/admin/BarberFields";
import { adminFetch } from "@/lib/admin/api";
import type { AdminBarberListItem } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

export default async function BarbersPage() {
  const barbers = await adminFetch<AdminBarberListItem[]>("/barbers");
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Барберы</h1>
          <p className={styles.subtitle}>Профили, услуги, фото и портфолио мастеров.</p>
        </div>
      </div>

      <ul className={styles.list} style={{ marginBottom: 16 }}>
        {barbers.map((barber) => (
          <li key={barber.id} className={styles.row}>
            <div className={styles.rowMain}>
              <Link href={`/admin/barbers/${barber.id}`} className={styles.rowTitle}>
                {barber.name}
              </Link>
              <span className={styles.muted}>
                {barber.isActive ? "На сайте" : "Скрыт"} · услуг: {barber.serviceCount} · Telegram: {barber.telegramLinked ? "подключён" : "нет"}
              </span>
            </div>
            <div className={styles.actions}>
              <Link href={`/admin/schedule?barber=${barber.id}`} className={`${styles.button} ${styles.secondary} ${styles.small}`}>
                График
              </Link>
              <Link href={`/admin/barbers/${barber.id}`} className={`${styles.button} ${styles.small}`}>
                Открыть
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <section className={styles.card} aria-labelledby="new-barber">
        <h2 className={styles.cardTitle} id="new-barber">
          Новый мастер
        </h2>
        <ActionForm action={createBarberAction} className={styles.grid} label="Новый мастер">
          <BarberFields />
          <button type="submit" className={styles.button}>
            Добавить
          </button>
        </ActionForm>
      </section>
    </>
  );
}
