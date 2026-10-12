"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/admin/types";
import styles from "./admin.module.css";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** Form bound to an admin Server Action: pending state, confirmation and result message. */
export function ActionForm({
  action,
  children,
  className,
  confirmText,
  label,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Native confirm() before destructive actions. */
  confirmText?: string;
  /** Accessible name of the form. */
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // After success inputs fall back to their (refreshed) defaults; after an error the typed values stay.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className} aria-label={label} aria-busy={pending}>
      <fieldset className={styles.fieldset} disabled={pending}>
        {children}
      </fieldset>
      {state?.message && (
        <p className={state.ok ? styles.success : styles.error} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
