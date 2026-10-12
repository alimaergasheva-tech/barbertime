import Link from "next/link";
import { formatDuration, formatPrice } from "@/lib/format";
import type { Service } from "@/types";
import styles from "./Services.module.css";

export function Services({ services }: { services: Service[] }) {
  return (
    <section id="services" className="section">
      <div className="container">
        <h2 className="section-title" data-reveal>
          Услуги и цены
        </h2>
        <p className="section-lead" data-reveal>
          Цена фиксированная и не меняется после стрижки. Можно выбрать несколько услуг за один
          визит.
        </p>

        <ul className={styles.list}>
          {services.map((service) => (
            <li key={service.id} className={styles.item}>
              <div className={styles.head}>
                <h3 className={styles.name}>{service.name}</h3>
                <span className={styles.leader} aria-hidden="true" />
                <span className={styles.price}>{formatPrice(service.price)}</span>
              </div>
              <div className={styles.meta}>
                <p>{service.description}</p>
                <span className={styles.duration}>{formatDuration(service.durationMin)}</span>
              </div>
              <Link
                href={`/book?service=${service.id}`}
                transitionTypes={["nav-forward"]}
                className={styles.book}
                aria-label={`Записаться: ${service.name}`}
              >
                Записаться
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
