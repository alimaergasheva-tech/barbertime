import type { AdminBarber } from "@/lib/admin/types";
import styles from "./admin.module.css";

export function BarberFields({ barber }: { barber?: AdminBarber }) {
  return (
    <>
      <label className={styles.field}>
        Имя
        <input name="name" required minLength={2} maxLength={60} defaultValue={barber?.name} />
      </label>
      <label className={styles.field}>
        Опыт, лет
        <input name="experienceYears" type="number" min={0} max={60} defaultValue={barber?.experienceYears ?? 0} />
      </label>
      <label className={styles.field}>
        Порядок
        <input name="sortOrder" type="number" min={0} max={1000} defaultValue={barber?.sortOrder ?? 0} />
      </label>
      <label className={`${styles.field} ${styles.wide}`}>
        Специализации (через запятую)
        <input name="specialties" maxLength={400} defaultValue={barber?.specialties.join(", ")} />
      </label>
      <label className={`${styles.field} ${styles.wide}`}>
        О мастере
        <textarea name="bio" maxLength={600} defaultValue={barber?.bio} />
      </label>
    </>
  );
}
