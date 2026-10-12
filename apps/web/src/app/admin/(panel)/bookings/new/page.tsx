import Link from "next/link";
import { createBookingAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { adminFetch } from "@/lib/admin/api";
import { formatDay, formatSum, shopDate } from "@/lib/admin/format";
import type { AdminBarberListItem, AdminService } from "@/lib/admin/types";
import { getSlots } from "@/lib/api";
import styles from "@/components/admin/admin.module.css";

type Search = { serviceIds?: string | string[]; barberId?: string; date?: string };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [services, barbers] = await Promise.all([
    adminFetch<AdminService[]>("/services").then((list) => list.filter((s) => s.isActive)),
    adminFetch<AdminBarberListItem[]>("/barbers").then((list) => list.filter((b) => b.isActive)),
  ]);

  const selected = [params.serviceIds ?? []].flat().filter((id) => services.some((s) => s.id === id));
  const barberId = barbers.some((b) => b.id === params.barberId) ? params.barberId! : "";
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : shopDate();
  const ready = selected.length > 0 && barberId !== "";
  const slots = ready ? await getSlots(selected, barberId, date) : [];
  const chosen = services.filter((s) => selected.includes(s.id));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Новая запись</h1>
          <p className={styles.subtitle}>Для звонков и визитов без записи. Ограничения по горизонту и минимальному запасу времени не действуют.</p>
        </div>
        <Link href="/admin/bookings" className={`${styles.button} ${styles.secondary}`}>
          К записям
        </Link>
      </div>

      <form className={styles.card} aria-label="Параметры записи">
        <h2 className={styles.cardTitle}>1. Услуги, мастер и дата</h2>
        <div className={styles.grid} style={{ marginBottom: 14 }}>
          {services.map((service) => (
            <label key={service.id} className={styles.check}>
              <input type="checkbox" name="serviceIds" value={service.id} defaultChecked={selected.includes(service.id)} />
              {service.name} · {service.durationMin} мин
            </label>
          ))}
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>
            Мастер
            <select name="barberId" defaultValue={barberId} required>
              <option value="" disabled>
                Выберите мастера
              </option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Дата
            <input type="date" name="date" defaultValue={date} required />
          </label>
          <button type="submit" className={`${styles.button} ${styles.secondary}`}>
            Показать время
          </button>
        </div>
      </form>

      {ready && (
        <section className={styles.card} aria-labelledby="step-2">
          <h2 className={styles.cardTitle} id="step-2">
            2. Время и клиент — {formatDay(date)}
          </h2>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            {chosen.map((s) => s.name).join(" + ")} · ориентировочно {formatSum(chosen.reduce((sum, s) => sum + s.price, 0))}
          </p>
          <ActionForm action={createBookingAction} label="Создание записи">
            {selected.map((id) => (
              <input key={id} type="hidden" name="serviceIds" value={id} />
            ))}
            <input type="hidden" name="barberId" value={barberId} />
            <input type="hidden" name="date" value={date} />
            {slots.length > 0 ? (
              <div className={styles.slotButtons} role="radiogroup" aria-label="Свободное время" style={{ marginBottom: 14 }}>
                {slots.map((slot) => (
                  <label key={slot.time}>
                    <input type="radio" name="time" value={slot.time} />
                    <span>{slot.time}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>Свободных слотов по сетке нет — можно указать время вручную.</p>
            )}
            <div className={styles.grid}>
              <label className={styles.field}>
                Другое время
                <input type="time" name="manualTime" />
              </label>
              <label className={styles.field}>
                Имя клиента
                <input name="name" required minLength={2} maxLength={60} autoComplete="off" />
              </label>
              <label className={styles.field}>
                Телефон
                <input name="phone" type="tel" required placeholder="+998 90 123 45 67" autoComplete="off" />
              </label>
              <button type="submit" className={styles.button}>
                Создать запись
              </button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
