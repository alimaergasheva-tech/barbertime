import Link from "next/link";
import { yearsLabel } from "@/lib/format";
import type { Barber } from "@/types";
import styles from "./Barbers.module.css";

export function Barbers({ barbers }: { barbers: Barber[] }) {
  return (
    <section id="barbers" className="section">
      <div className="container">
        <h2 className="section-title" data-reveal>
          Барберы
        </h2>
        <p className="section-lead" data-reveal>
          Выберите мастера заранее или запишитесь к тому, кто свободен в удобное время.
        </p>

        <ul className={styles.grid} data-reveal-group>
          {barbers.map((barber, index) => (
            <li
              key={barber.id}
              className={styles.card}
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className={`${styles.portrait} ${styles[barber.tone]}`} aria-hidden="true">
                {barber.name[0]}
              </div>
              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <h3 className={styles.name}>{barber.name}</h3>
                  {barber.rating !== null ? (
                    <span className={styles.rating} aria-label={`Рейтинг ${barber.rating}`}>
                      ★ {barber.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span className={styles.rating}>Новый мастер</span>
                  )}
                </div>
                <p className={styles.experience}>Опыт {yearsLabel(barber.experienceYears)}</p>
                <p className={styles.bio}>{barber.bio}</p>
                <ul className={styles.tags}>
                  {barber.specialties.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <Link
                  href={`/book?barber=${barber.id}`}
                  transitionTypes={["nav-forward"]}
                  className={`btn btn-ghost ${styles.book}`}
                  aria-label={`Записаться к мастеру: ${barber.name}`}
                >
                  Записаться
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
