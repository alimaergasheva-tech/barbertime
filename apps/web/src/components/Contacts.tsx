import Link from "next/link";
import { shop } from "@/data/mock";
import styles from "./Contacts.module.css";

export function Contacts() {
  const { lat, lon } = shop.coords;
  const delta = 0.006;
  const bbox = [lon - delta, lat - delta / 2, lon + delta, lat + delta / 2].join(",");
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <section id="contacts" className="section">
      <div className={`container ${styles.layout}`}>
        <div>
          <h2 className="section-title" data-reveal>
            Как нас найти
          </h2>

          <dl className={styles.facts}>
            <div>
              <dt>Адрес</dt>
              <dd>
                {shop.city}, {shop.address}
                <span className={styles.note}>{shop.landmark}</span>
              </dd>
            </div>
            <div>
              <dt>Часы работы</dt>
              <dd>
                {shop.hours.map((row) => (
                  <span key={row.days} className={styles.hoursRow}>
                    <span>{row.days}</span>
                    <span>{row.time}</span>
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>
                <a href={shop.phoneHref}>{shop.phone}</a>
              </dd>
            </div>
            <div>
              <dt>Telegram</dt>
              <dd>
                <a href={shop.telegramHref} target="_blank" rel="noopener noreferrer">
                  {shop.telegram}
                </a>
              </dd>
            </div>
          </dl>

          <Link href="/book" className="btn btn-primary" transitionTypes={["nav-forward"]}>
            Записаться
          </Link>
        </div>

        <div className={styles.map}>
          <iframe
            title={`Карта: ${shop.address}`}
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
