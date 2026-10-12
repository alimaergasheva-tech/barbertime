import Link from "next/link";
import { shop } from "@/data/mock";
import type { Barber, BarberSlots } from "@/types";
import { FlapTime } from "./FlapTime";
import { HeroBackdrop } from "./HeroBackdrop";
import styles from "./Hero.module.css";

const TITLE_WORDS = ["Стрижка", "и\u00a0бритьё", "в\u00a0центре", "Ташкента"];
const ROW_DELAY_MS = 120;
const SLOT_DELAY_MS = 60;

export function Hero({ barbers, todaySlots }: { barbers: Barber[]; todaySlots: BarberSlots[] }) {
  const rows = todaySlots
    .map((slot) => ({ ...slot, barber: barbers.find((b) => b.id === slot.barberId) }))
    .filter((row) => row.barber && row.times.length > 0);

  return (
    <section className={styles.stage}>
      <HeroBackdrop />
      <div className={`container ${styles.hero}`}>
        <div className={styles.copy}>
          <h1 className={styles.title} aria-label={TITLE_WORDS.join(" ")}>
            <span aria-hidden="true">
              {TITLE_WORDS.map((word, index) => (
                <span key={word} className={styles.wordMask}>
                  <span className={styles.word} style={{ "--i": index } as React.CSSProperties}>
                    {word}
                  </span>{" "}
                </span>
              ))}
            </span>
          </h1>
          <p className={styles.lead}>
            Выберите мастера и время — запись занимает минуту. Напомним в Telegram за день и за
            30 минут до визита.
          </p>
          <div className={styles.buttons}>
            <Link href="/book" className="btn btn-primary" transitionTypes={["nav-forward"]}>
              Записаться
            </Link>
            <a href="#services" className="btn btn-ghost">
              Услуги и цены
            </a>
          </div>
          <p className={styles.address}>{shop.address}, ежедневно с 10:00</p>
        </div>

        <aside className={styles.ticket} aria-labelledby="today-title">
          <div className={styles.stripe} aria-hidden="true" />
          <div className={styles.ticketBody}>
            <h2 id="today-title" className={styles.ticketTitle}>
              Сегодня свободно
            </h2>
            {rows.length === 0 && (
              <p className={styles.empty}>На сегодня всё занято — посмотрите ближайшие дни.</p>
            )}
            <ul className={styles.rows}>
              {rows.map(({ barberId, barber, times }, rowIndex) => (
                <li key={barberId} className={styles.row}>
                  <span className={styles.barber}>{barber?.name}</span>
                  <span className={styles.times}>
                    {times.map((time, slotIndex) => (
                      <Link
                        key={time}
                        href={`/book?barber=${barberId}&time=${time}`}
                        className={styles.slot}
                        aria-label={`Записаться к мастеру ${barber?.name} на ${time}`}
                        transitionTypes={["nav-forward"]}
                      >
                        <FlapTime
                          value={time}
                          delayMs={rowIndex * ROW_DELAY_MS + slotIndex * SLOT_DELAY_MS}
                        />
                      </Link>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/book" className={styles.more} transitionTypes={["nav-forward"]}>
              Другие дни
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
