import { MINUTE_MS } from "./time";

/** Half-open interval [start, end) in epoch ms. */
export type Interval = { start: number; end: number };

export type SlotInput = {
  /** Working window of the barber for the day; null = day off. */
  work: Interval | null;
  /** Breaks, time off and confirmed bookings. */
  blocked: Interval[];
  durationMin: number;
  stepMin: number;
  /** Earliest allowed start (now + min notice). */
  notBefore: number;
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Start instants on a `stepMin` grid anchored at the start of the working window,
 * where the whole service fits inside work hours and touches no blocked interval.
 */
export function computeStarts({ work, blocked, durationMin, stepMin, notBefore }: SlotInput): number[] {
  if (!work || durationMin <= 0 || stepMin <= 0) return [];

  const duration = durationMin * MINUTE_MS;
  const step = stepMin * MINUTE_MS;
  const relevant = blocked.filter((item) => overlaps(item, work));
  const starts: number[] = [];

  for (let start = work.start; start + duration <= work.end; start += step) {
    if (start < notBefore) continue;
    const candidate = { start, end: start + duration };
    if (!relevant.some((item) => overlaps(item, candidate))) starts.push(start);
  }
  return starts;
}
