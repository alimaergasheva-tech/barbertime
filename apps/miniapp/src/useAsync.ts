import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: unknown };

type Loaded<T> = { key: string; state: AsyncState<T> };

/**
 * Loads data for `key` (null = nothing to load). State is keyed, so switching keys
 * shows "loading" immediately and late responses for old keys are ignored.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> & { reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const fullKey = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    if (fullKey === null) return;
    let cancelled = false;
    loadRef.current().then(
      (data) => !cancelled && setLoaded({ key: fullKey, state: { status: "ready", data } }),
      (error: unknown) => !cancelled && setLoaded({ key: fullKey, state: { status: "error", error } }),
    );
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  if (fullKey === null) return { status: "idle", reload };
  if (!loaded || loaded.key !== fullKey) return { status: "loading", reload };
  return { ...loaded.state, reload };
}
