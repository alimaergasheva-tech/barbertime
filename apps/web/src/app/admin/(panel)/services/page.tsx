import { createServiceAction, deleteServiceAction, updateServiceAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { adminFetch } from "@/lib/admin/api";
import type { AdminService } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

function ServiceFields({ service }: { service?: AdminService }) {
  return (
    <>
      <label className={styles.field}>
        Название
        <input name="name" required minLength={2} maxLength={80} defaultValue={service?.name} />
      </label>
      <label className={styles.field}>
        Длительность, мин
        <input name="durationMin" type="number" required min={5} max={480} step={5} defaultValue={service?.durationMin ?? 30} />
      </label>
      <label className={styles.field}>
        Цена, сум
        <input name="price" type="number" required min={0} step={1000} defaultValue={service?.price ?? 0} />
      </label>
      <label className={styles.field}>
        Порядок
        <input name="sortOrder" type="number" min={0} max={1000} defaultValue={service?.sortOrder ?? 0} />
      </label>
      <label className={`${styles.field} ${styles.wide}`}>
        Описание
        <input name="description" maxLength={300} defaultValue={service?.description} />
      </label>
    </>
  );
}

export default async function ServicesPage() {
  const services = await adminFetch<AdminService[]>("/services");
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Услуги</h1>
          <p className={styles.subtitle}>Базовые длительность и цена; у мастера их можно переопределить в его профиле.</p>
        </div>
      </div>

      <section className={styles.card} aria-labelledby="new-service">
        <h2 className={styles.cardTitle} id="new-service">
          Новая услуга
        </h2>
        <ActionForm action={createServiceAction} className={styles.grid} label="Новая услуга">
          <ServiceFields />
          <label className={styles.check}>
            <input type="checkbox" name="assignToAll" defaultChecked />
            Включить всем мастерам
          </label>
          <button type="submit" className={styles.button}>
            Добавить
          </button>
        </ActionForm>
      </section>

      {services.length === 0 && <p className={styles.empty}>Услуг пока нет.</p>}
      {services.map((service) => (
        <section key={service.id} className={styles.card} aria-label={service.name} data-service={service.id}>
          <ActionForm action={updateServiceAction} className={styles.grid} label={`Услуга ${service.name}`}>
            <input type="hidden" name="id" value={service.id} />
            <ServiceFields service={service} />
            <label className={styles.check}>
              <input type="checkbox" name="isActive" defaultChecked={service.isActive} />
              Активна · мастеров: {service.barberCount}
            </label>
            <button type="submit" className={styles.button}>
              Сохранить
            </button>
          </ActionForm>
          <ActionForm action={deleteServiceAction} confirmText={`Удалить услугу «${service.name}»?`} label={`Удаление ${service.name}`}>
            <input type="hidden" name="id" value={service.id} />
            <button type="submit" className={`${styles.button} ${styles.danger} ${styles.small}`} style={{ marginTop: 12 }}>
              Удалить
            </button>
          </ActionForm>
        </section>
      ))}
    </>
  );
}
