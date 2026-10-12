import { shop } from "@/data/mock";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <span>
          {shop.name}, {shop.city}
        </span>
        <a href={shop.phoneHref}>{shop.phone}</a>
      </div>
      <div className={`container ${styles.wordmarkWrap}`} aria-hidden="true">
        <p className={styles.wordmark}>{shop.name}</p>
      </div>
    </footer>
  );
}
