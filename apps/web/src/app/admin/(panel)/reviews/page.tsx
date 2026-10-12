import Link from "next/link";
import { setReviewVisibilityAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { adminFetch } from "@/lib/admin/api";
import { formatDateTime } from "@/lib/admin/format";
import type { AdminReview } from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";

const FILTERS = [
  { value: "all", label: "Все" },
  { value: "public", label: "Опубликованные" },
  { value: "hidden", label: "Скрытые" },
] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ visibility?: string }> }) {
  const { visibility: requested } = await searchParams;
  const visibility = FILTERS.find((f) => f.value === requested)?.value ?? "all";
  const reviews = await adminFetch<AdminReview[]>(`/reviews?visibility=${visibility}`);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Отзывы</h1>
          <p className={styles.subtitle}>Отзывы из Telegram после визита. Публикация — на сайте в карточке мастера.</p>
        </div>
        <nav className={styles.actions} aria-label="Фильтр отзывов">
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/admin/reviews?visibility=${filter.value}`}
              className={`${styles.button} ${styles.small} ${filter.value === visibility ? "" : styles.secondary}`}
              aria-current={filter.value === visibility ? "page" : undefined}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
      </div>

      {reviews.length === 0 ? (
        <p className={styles.empty}>Отзывов нет.</p>
      ) : (
        <ul className={styles.list}>
          {reviews.map((review) => (
            <li key={review.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  <span aria-label={`Оценка ${review.rating} из 5`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span> ·{" "}
                  {review.clientName} → {review.barber.name}
                </span>
                {review.comment && <span>{review.comment}</span>}
                <span className={styles.muted}>
                  Визит {formatDateTime(review.visitAt)} · {review.isPublic ? "опубликован" : "скрыт"}
                </span>
              </div>
              <ActionForm action={setReviewVisibilityAction} label={`Отзыв ${review.clientName}`}>
                <input type="hidden" name="id" value={review.id} />
                <input type="hidden" name="isPublic" value={review.isPublic ? "false" : "true"} />
                <button type="submit" className={`${styles.button} ${styles.small} ${review.isPublic ? styles.secondary : ""}`}>
                  {review.isPublic ? "Скрыть" : "Опубликовать"}
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
