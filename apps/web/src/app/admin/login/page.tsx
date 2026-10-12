import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import styles from "@/components/admin/admin.module.css";

export const metadata: Metadata = { title: "Вход — Barber Time", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <main className={styles.login}>
      <div className={styles.loginCard}>
        <p className={styles.brand}>
          Barber <span>Time</span>
        </p>
        <h1 className={styles.title} style={{ margin: "12px 0 20px" }}>
          Вход в админку
        </h1>
        {expired && <p className={styles.muted}>Сессия истекла — войдите снова.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
