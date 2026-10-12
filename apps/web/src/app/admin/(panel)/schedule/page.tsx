import Link from "next/link";
import { saveScheduleAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { adminFetch } from "@/lib/admin/api";
import { WEEKDAYS } from "@/lib/admin/format";
import type { AdminBarber, AdminBarberListItem } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ barber?: string }> }) {
  const { barber: requested } = await searchParams;
  const barbers = await adminFetch<AdminBarberListItem[]>("/barbers");
  const current = barbers.find((b) => b.id === requested) ?? barbers[0];

  if (!current) {
    return (
      <>
        <h1 className={styles.title}>График</h1>
        <p className={styles.empty}>
          Сначала добавьте мастера в разделе <Link href="/admin/barbers">«Барберы»</Link>.
        </p>
      </>
    );
  }

  const barber = await adminFetch<AdminBarber>(`/barbers/${encodeURIComponent(current.id)}`);
  const byDay = new Map(barber.schedule.map((day) => [day.weekday, day]));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>График</h1>
          <p className={styles.subtitle}>Недельное расписание и обед. Разовые выходные и отпуска — в разделе «Исключения».</p>
        </div>
      </div>

      <form className={`${styles.card} ${styles.actions}`} aria-label="Выбор мастера">
        <label className={styles.field} style={{ minWidth: 220 }}>
          Мастер
          <select name="barber" defaultValue={current.id}>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`${styles.button} ${styles.secondary}`} style={{ alignSelf: "flex-end" }}>
          Открыть
        </button>
      </form>

      <section className={styles.card} aria-label={`График: ${barber.name}`}>
        <h2 className={styles.cardTitle}>{barber.name}</h2>
        {/* key resets uncontrolled inputs when switching barbers */}
        <ActionForm key={barber.id} action={saveScheduleAction} label="Недельный график">
          <input type="hidden" name="barberId" value={barber.id} />
          {WEEKDAYS.map((label, index) => {
            const weekday = index + 1;
            const day = byDay.get(weekday);
            const lunch = day?.breaks[0];
            return (
              <div key={weekday} className={styles.scheduleRow}>
                <label className={styles.check}>
                  <input type="checkbox" name={`work_${weekday}`} defaultChecked={!!day} />
                  {label}
                </label>
                <label className={styles.field}>
                  Начало
                  <input type="time" name={`start_${weekday}`} defaultValue={day?.start ?? "10:00"} />
                </label>
                <label className={styles.field}>
                  Конец
                  <input type="time" name={`end_${weekday}`} defaultValue={day?.end ?? "20:00"} />
                </label>
                <label className={styles.field}>
                  Обед с
                  <input type="time" name={`breakStart_${weekday}`} defaultValue={lunch?.start ?? ""} />
                </label>
                <label className={styles.field}>
                  Обед до
                  <input type="time" name={`breakEnd_${weekday}`} defaultValue={lunch?.end ?? ""} />
                </label>
              </div>
            );
          })}
          <button type="submit" className={styles.button} style={{ marginTop: 14 }}>
            Сохранить график
          </button>
        </ActionForm>
      </section>
    </>
  );
}
