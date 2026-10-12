import { createTimeOffAction, deleteTimeOffAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { adminFetch } from "@/lib/admin/api";
import { formatDateTime, shopDate, TIME_OFF_LABEL } from "@/lib/admin/format";
import type { AdminBarberListItem, AdminTimeOff } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

export default async function TimeOffPage() {
  const [rows, barbers] = await Promise.all([
    adminFetch<AdminTimeOff[]>("/time-off"),
    adminFetch<AdminBarberListItem[]>("/barbers"),
  ]);
  const today = shopDate();

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Исключения</h1>
          <p className={styles.subtitle}>Выходные, отпуска, больничные и праздники. На эти периоды запись на сайте закрывается.</p>
        </div>
      </div>

      <section className={styles.card} aria-labelledby="new-time-off">
        <h2 className={styles.cardTitle} id="new-time-off">
          Добавить исключение
        </h2>
        <ActionForm action={createTimeOffAction} className={styles.grid} label="Новое исключение">
          <label className={styles.field}>
            Кто
            <select name="barberId" defaultValue="">
              <option value="">Весь барбершоп</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Тип
            <select name="type" defaultValue="day_off">
              {Object.entries(TIME_OFF_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            С даты
            <input type="date" name="from" required defaultValue={today} min={today} />
          </label>
          <label className={styles.field}>
            По дату
            <input type="date" name="to" defaultValue={today} min={today} />
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="allDay" defaultChecked />
            Весь день
          </label>
          <label className={styles.field}>
            Время с (если не весь день)
            <input type="time" name="startTime" />
          </label>
          <label className={styles.field}>
            Время до
            <input type="time" name="endTime" />
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            Комментарий
            <input name="note" maxLength={200} />
          </label>
          <button type="submit" className={styles.button}>
            Добавить
          </button>
        </ActionForm>
      </section>

      {rows.length === 0 ? (
        <p className={styles.empty}>Предстоящих исключений нет.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {TIME_OFF_LABEL[row.type]} · {row.barber?.name ?? "весь барбершоп"}
                </span>
                <span className={styles.muted}>
                  {formatDateTime(row.startsAt)} — {formatDateTime(row.endsAt)}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
                {row.conflicts > 0 && (
                  <span className={styles.error} style={{ margin: 0 }}>
                    Пересекается с активными записями: {row.conflicts}
                  </span>
                )}
              </div>
              <ActionForm action={deleteTimeOffAction} confirmText="Удалить исключение?" label="Удаление исключения">
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className={`${styles.button} ${styles.danger} ${styles.small}`}>
                  Удалить
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
