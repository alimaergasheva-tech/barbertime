"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./admin.module.css";

const LINKS = [
  { href: "/admin", label: "Сегодня" },
  { href: "/admin/bookings", label: "Записи" },
  { href: "/admin/barbers", label: "Барберы" },
  { href: "/admin/services", label: "Услуги" },
  { href: "/admin/schedule", label: "График" },
  { href: "/admin/time-off", label: "Исключения" },
  { href: "/admin/reviews", label: "Отзывы" },
  { href: "/admin/analytics", label: "Аналитика" },
  { href: "/admin/settings", label: "Настройки" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Разделы админки">
      {LINKS.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={styles.navLink} aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
