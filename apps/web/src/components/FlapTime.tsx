"use client";

import { useEffect, useState } from "react";
import styles from "./FlapTime.module.css";

const TICK_MS = 55;
const BASE_TICKS = 6;
const TICKS_PER_DIGIT = 2;

function randomDigit() {
  return String(Math.floor(Math.random() * 10));
}

/** Время в стиле перекидного табло. Анимируется только во время интро главной страницы. */
export function FlapTime({ value, delayMs = 0 }: { value: string; delayMs?: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (document.documentElement.dataset.intro !== "run") return;

    const chars = value.split("");
    const offset = Math.round(delayMs / TICK_MS);
    const settleAt = chars.map((_, index) => offset + BASE_TICKS + index * TICKS_PER_DIGIT);
    const lastTick = settleAt[settleAt.length - 1];
    let tick = 0;

    const timer = window.setInterval(() => {
      tick += 1;
      setShown(
        chars
          .map((char, index) => (char === ":" || tick >= settleAt[index] ? char : randomDigit()))
          .join(""),
      );
      if (tick >= lastTick) window.clearInterval(timer);
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [value, delayMs]);

  return (
    <span className={styles.flap} aria-hidden="true">
      {shown.split("").map((char, index) => (
        <span key={`${index}-${char}`} className={char === ":" ? styles.colon : styles.digit}>
          {char}
        </span>
      ))}
    </span>
  );
}
