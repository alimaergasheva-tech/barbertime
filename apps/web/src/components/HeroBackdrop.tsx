"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HeroBackdrop.module.css";

type Props = {
  /** Путь к ролику в public/, например "/videos/hero.mp4". Без него показывается CSS-анимация. */
  videoSrc?: string;
  videoPoster?: string;
};

export function HeroBackdrop({ videoSrc, videoPoster }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (paused || offscreen || reduce) {
      video.pause();
    } else {
      video.play().catch(() => {
        // Autoplay can be blocked by the browser; the poster stays visible.
      });
    }
  }, [paused, offscreen]);

  return (
    <>
      <div
        ref={rootRef}
        className={styles.backdrop}
        data-paused={paused || offscreen}
        aria-hidden="true"
      >
        {videoSrc ? (
          <video
            ref={videoRef}
            className={styles.video}
            src={videoSrc}
            poster={videoPoster}
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <>
            <span className={`${styles.blob} ${styles.blobTeal}`} />
            <span className={`${styles.blob} ${styles.blobSteel}`} />
            <span className={`${styles.blob} ${styles.blobBrass}`} />
          </>
        )}
        <span className={styles.grain} />
      </div>

      <button
        type="button"
        className={styles.toggle}
        onClick={() => setPaused((value) => !value)}
        aria-pressed={paused}
      >
        <span className="visually-hidden">
          {paused ? "Запустить анимацию фона" : "Остановить анимацию фона"}
        </span>
        {paused ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l10.5-6.5z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
        )}
      </button>
    </>
  );
}
