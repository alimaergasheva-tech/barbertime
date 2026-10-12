import { saveSettingsAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { adminFetch } from "@/lib/admin/api";
import type { AdminSettings } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

const FIELDS: { key: Exclude<keyof AdminSettings, "timezone">; label: string; min: number; max: number }[] = [
  { key: "slot_step_min", label: "Шаг сетки слотов, мин", min: 5, max: 120 },
  { key: "min_notice_min", label: "Минимум до записи, мин", min: 0, max: 1440 },
  { key: "booking_horizon_days", label: "Запись вперёд, дней", min: 1, max: 365 },
  { key: "cancel_cutoff_min", label: "Отмена клиентом не позже чем за, мин", min: 0, max: 1440 },
  { key: "reminder_day_minutes", label: "Первое напоминание за, мин", min: 60, max: 4320 },
  { key: "reminder_short_minutes", label: "Второе напоминание за, мин", min: 5, max: 240 },
  { key: "review_delay_min", label: "Запрос отзыва через, мин после визита", min: 0, max: 10080 },
  { key: "review_public_min_rating", label: "Автопубликация отзыва от оценки", min: 1, max: 5 },
];

export default async function SettingsPage() {
  const settings = await adminFetch<AdminSettings>("/settings");
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Настройки</h1>
          <p className={styles.subtitle}>Правила записи и уведомлений. Применяются сразу.</p>
        </div>
      </div>
      <section className={styles.card}>
        <ActionForm action={saveSettingsAction} className={styles.grid} label="Настройки">
          {FIELDS.map((field) => (
            <label key={field.key} className={styles.field}>
              {field.label}
              <input name={field.key} type="number" required min={field.min} max={field.max} defaultValue={settings[field.key]} />
            </label>
          ))}
          <label className={styles.field}>
            Часовой пояс
            <input name="timezone" required defaultValue={settings.timezone} />
          </label>
          <button type="submit" className={styles.button}>
            Сохранить
          </button>
        </ActionForm>
      </section>
    </>
  );
}
