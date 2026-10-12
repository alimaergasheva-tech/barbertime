import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteBarberAction,
  deletePhotoAction,
  deletePortfolioAction,
  updateBarberAction,
  updateBarberServicesAction,
  uploadPhotoAction,
  uploadPortfolioAction,
} from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { BarberFields } from "@/components/admin/BarberFields";
import { AdminApiError, adminFetch } from "@/lib/admin/api";
import { formatSum } from "@/lib/admin/format";
import type { AdminBarber } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

async function loadBarber(id: string): Promise<AdminBarber> {
  try {
    return await adminFetch<AdminBarber>(`/barbers/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export default async function BarberPage({ params }: { params: Promise<{ id: string }> }) {
  const barber = await loadBarber((await params).id);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>{barber.name}</h1>
          <p className={styles.subtitle}>
            {barber.isActive ? "Показывается на сайте" : "Скрыт с сайта"} · Telegram: {barber.telegramLinked ? "подключён" : "не подключён (npm run bot:barber-link)"}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href={`/admin/schedule?barber=${barber.id}`} className={`${styles.button} ${styles.secondary}`}>
            График
          </Link>
          <Link href="/admin/barbers" className={`${styles.button} ${styles.secondary}`}>
            Все мастера
          </Link>
        </div>
      </div>

      <section className={styles.card} aria-labelledby="profile">
        <h2 className={styles.cardTitle} id="profile">
          Профиль
        </h2>
        <ActionForm action={updateBarberAction} className={styles.grid} label="Профиль мастера">
          <input type="hidden" name="id" value={barber.id} />
          <BarberFields barber={barber} />
          <label className={styles.check}>
            <input type="checkbox" name="isActive" defaultChecked={barber.isActive} />
            Показывать на сайте
          </label>
          <button type="submit" className={styles.button}>
            Сохранить
          </button>
        </ActionForm>
      </section>

      <section className={styles.card} aria-labelledby="services">
        <h2 className={styles.cardTitle} id="services">
          Услуги мастера
        </h2>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          Пустые поля — базовые длительность и цена услуги.
        </p>
        <ActionForm action={updateBarberServicesAction} label="Услуги мастера">
          <input type="hidden" name="id" value={barber.id} />
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Услуга</th>
                <th>Длительность, мин</th>
                <th>Цена, сум</th>
              </tr>
            </thead>
            <tbody>
              {barber.services.map((service) => (
                <tr key={service.serviceId}>
                  <td>
                    <input type="hidden" name="serviceId" value={service.serviceId} />
                    <label className={styles.check}>
                      <input type="checkbox" name={`enabled_${service.serviceId}`} defaultChecked={service.enabled} />
                      {service.name}
                      {!service.isActive && <span className={styles.muted}> (скрыта)</span>}
                    </label>
                  </td>
                  <td data-label="Длительность">
                    <input
                      className={styles.input}
                      type="number"
                      name={`duration_${service.serviceId}`}
                      min={5}
                      max={480}
                      step={5}
                      placeholder={String(service.baseDurationMin)}
                      defaultValue={service.durationMin ?? undefined}
                      aria-label={`Длительность: ${service.name}`}
                    />
                  </td>
                  <td data-label="Цена">
                    <input
                      className={styles.input}
                      type="number"
                      name={`price_${service.serviceId}`}
                      min={0}
                      step={1000}
                      placeholder={formatSum(service.basePrice)}
                      defaultValue={service.price ?? undefined}
                      aria-label={`Цена: ${service.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="submit" className={styles.button} style={{ marginTop: 12 }}>
            Сохранить услуги
          </button>
        </ActionForm>
      </section>

      <section className={styles.card} aria-labelledby="photo">
        <h2 className={styles.cardTitle} id="photo">
          Фото
        </h2>
        <div className={styles.actions} style={{ alignItems: "flex-start" }}>
          {barber.photoUrl ? (
            <Image src={barber.photoUrl} alt={barber.name} width={120} height={120} className={styles.photo} unoptimized />
          ) : (
            <div className={styles.photo} aria-hidden />
          )}
          <div style={{ display: "grid", gap: 8 }}>
            <ActionForm action={uploadPhotoAction} className={styles.actions} label="Загрузка фото">
              <input type="hidden" name="id" value={barber.id} />
              <input type="file" name="file" accept={IMAGE_ACCEPT} required aria-label="Файл фото" />
              <button type="submit" className={`${styles.button} ${styles.small}`}>
                Загрузить
              </button>
            </ActionForm>
            {barber.photoUrl && (
              <ActionForm action={deletePhotoAction} confirmText="Удалить фото мастера?" label="Удаление фото">
                <input type="hidden" name="id" value={barber.id} />
                <button type="submit" className={`${styles.button} ${styles.danger} ${styles.small}`}>
                  Удалить фото
                </button>
              </ActionForm>
            )}
            <span className={styles.muted}>JPEG, PNG или WebP до 5 МБ.</span>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="portfolio">
        <h2 className={styles.cardTitle} id="portfolio">
          Портфолио · {barber.portfolio.length}/24
        </h2>
        <ActionForm action={uploadPortfolioAction} className={styles.actions} label="Добавление в портфолио">
          <input type="hidden" name="id" value={barber.id} />
          <input type="file" name="file" accept={IMAGE_ACCEPT} required aria-label="Файл для портфолио" />
          <button type="submit" className={`${styles.button} ${styles.small}`}>
            Добавить
          </button>
        </ActionForm>
        {barber.portfolio.length > 0 && (
          <div className={styles.gallery} style={{ marginTop: 14 }}>
            {barber.portfolio.map((item, index) => (
              <div key={item.id} className={styles.galleryItem}>
                <Image src={item.imageUrl} alt={`Работа ${index + 1}`} width={160} height={160} unoptimized />
                <ActionForm action={deletePortfolioAction} confirmText="Удалить фото из портфолио?" label={`Удаление работы ${index + 1}`}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit" className={`${styles.button} ${styles.danger} ${styles.small}`}>
                    Удалить
                  </button>
                </ActionForm>
              </div>
            ))}
          </div>
        )}
      </section>

      <ActionForm
        action={deleteBarberAction}
        confirmText={`Удалить мастера ${barber.name}? Если у него есть записи, он будет скрыт с сайта.`}
        label="Удаление мастера"
      >
        <input type="hidden" name="id" value={barber.id} />
        <button type="submit" className={`${styles.button} ${styles.danger}`}>
          Удалить мастера
        </button>
      </ActionForm>
    </>
  );
}
