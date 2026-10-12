"use client";

import { useEffect } from "react";
import { shop } from "@/data/mock";
import styles from "./error.module.css";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={`container ${styles.wrap}`}>
      <div className={styles.card} role="alert">
        <h1 className="section-title">Сайт временно недоступен</h1>
        <p className="section-lead">
          Не удалось загрузить услуги и мастеров. Попробуйте ещё раз через минуту или запишитесь по
          телефону.
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            Повторить
          </button>
          <a href={shop.phoneHref} className="btn btn-ghost">
            Позвонить
          </a>
        </div>
      </div>
    </main>
  );
}
