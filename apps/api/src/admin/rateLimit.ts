/**
 * Fixed-window failure counter for login. In-memory: one API instance in the MVP;
 * a restart only resets the counters.
 */
export class LoginLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limits: { perKey: number; windowMs: number },
    private readonly now: () => number = Date.now,
  ) {}

  /** Milliseconds until another attempt is allowed for any of the keys, 0 if allowed. */
  retryAfter(keys: string[]): number {
    const now = this.now();
    let wait = 0;
    for (const key of keys) {
      const entry = this.hits.get(key);
      if (!entry || entry.resetAt <= now) continue;
      if (entry.count >= this.limits.perKey) wait = Math.max(wait, entry.resetAt - now);
    }
    return wait;
  }

  fail(keys: string[]) {
    const now = this.now();
    for (const key of keys) {
      const entry = this.hits.get(key);
      if (!entry || entry.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.limits.windowMs });
      else entry.count += 1;
    }
    if (this.hits.size > 10_000) {
      for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
    }
  }

  reset(keys: string[]) {
    for (const key of keys) this.hits.delete(key);
  }
}
