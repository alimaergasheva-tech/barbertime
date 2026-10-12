import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminFetch } from "@/lib/admin/api";
import { logoutAction } from "../actions";
import styles from "@/components/admin/admin.module.css";

export const metadata: Metadata = { title: "Админка — Barber Time", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await adminFetch<{ login: string }>("/me");
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.brand}>
          Barber <span>Time</span>
        </Link>
        <AdminNav />
        <div className={styles.sidebarFooter}>
          <span>{me.login}</span>
          <form action={logoutAction}>
            <button type="submit" className={`${styles.button} ${styles.secondary} ${styles.small}`}>
              Выйти
            </button>
          </form>
          <Link href="/" className={styles.muted}>
            На сайт
          </Link>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
