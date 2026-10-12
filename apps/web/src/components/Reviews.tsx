import { reviews } from "@/data/mock";
import { formatDate } from "@/lib/format";
import type { Barber } from "@/types";
import styles from "./Reviews.module.css";

export function Reviews({ barbers }: { barbers: Barber[] }) {
  return (
    <section id="reviews" className="section">
      <div className="container">
        <h2 className="section-title" data-reveal>
          Отзывы гостей
        </h2>
        <p className="section-lead" data-reveal>
          После визита бот просит оценить мастера. Здесь публикуются отзывы с оценкой от четырёх
          звёзд.
        </p>

        <ul className={styles.list} data-reveal-group>
          {reviews.map((review, index) => {
            const barber = barbers.find((b) => b.id === review.barberId);
            return (
              <li
                key={review.id}
                className={styles.item}
                style={{ "--i": index } as React.CSSProperties}
              >
                <p className={styles.stars} aria-label={`Оценка ${review.rating} из 5`}>
                  {"★".repeat(review.rating)}
                  <span className={styles.empty}>{"★".repeat(5 - review.rating)}</span>
                </p>
                <blockquote className={styles.quote}>{review.comment}</blockquote>
                <p className={styles.author}>
                  {review.author}, мастер {barber?.name}
                  <time dateTime={review.date} className={styles.date}>
                    {formatDate(review.date)}
                  </time>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
