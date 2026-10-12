"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import styles from "@/components/admin/admin.module.css";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  return (
    <form action={formAction}>
      <label className={styles.field}>
        Логин
        <input name="login" autoComplete="username" required maxLength={64} />
      </label>
      <label className={styles.field}>
        Пароль
        <input name="password" type="password" autoComplete="current-password" required maxLength={256} />
      </label>
      {state && !state.ok && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" className={styles.button} disabled={pending} style={{ width: "100%", marginTop: 8 }}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
