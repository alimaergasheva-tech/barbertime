import Link from "next/link";
import { shop } from "@/data/mock";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Header.module.css";

const nav = [
  { href: "#services", label: "Услуги" },
  { href: "#barbers", label: "Барберы" },
  { href: "#reviews", label: "Отзывы" },
  { href: "#contacts", label: "Контакты" },
];

export function Header({ showCta = true }: { showCta?: boolean }) {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo} aria-label={`${shop.name}, на главную`}>
          <svg viewBox="0 0 32 32" aria-hidden="true" className={styles.mark}>
            <path d="M4 22 L22 4 L28 10 L10 28 Z" />
            <path d="M10 28 L4 22" className={styles.edge} />
          </svg>
          {shop.name}
        </Link>

        <nav className={styles.nav} aria-label="Разделы">
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />
          {showCta && (
            <Link
              href="/book"
              className={`btn btn-primary ${styles.cta}`}
              transitionTypes={["nav-forward"]}
            >
              Записаться
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
