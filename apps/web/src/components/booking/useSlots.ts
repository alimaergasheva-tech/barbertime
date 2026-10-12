"use client";

import { useEffect, useState } from "react";
import { fetchDays, fetchSlots } from "@/lib/bookingApi";
import type { Slot } from "@/types";

export type SlotsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; slots: Slot[] }
  | { status: "error" };

type Loaded<T> = { key: string; value: T };

type Query = {
  serviceIds: string[];
  barberId: string | null;
  rescheduleToken?: string;
};

function queryKey({ serviceIds, barberId, rescheduleToken }: Query): string | null {
  if (serviceIds.length === 0 || !barberId) return null;
  return `${serviceIds.join(",")}|${barberId}|${rescheduleToken ?? ""}`;
}

export function useSlots(query: Query & { date: string | null; attempt: number }): SlotsState {
  const base = queryKey(query);
  const key = base && query.date ? `${base}|${query.date}|${query.attempt}` : null;
  const [loaded, setLoaded] = useState<Loaded<SlotsState> | null>(null);

  useEffect(() => {
    if (!key) return;
    const [serviceIds, barberId, rescheduleToken, date] = key.split("|");
    let cancelled = false;

    fetchSlots({ serviceIds: serviceIds.split(","), barberId, date, rescheduleToken: rescheduleToken || undefined }).then(
      (slots) => {
        if (!cancelled) setLoaded({ key, value: { status: "ready", slots } });
      },
      () => {
        if (!cancelled) setLoaded({ key, value: { status: "error" } });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!key) return { status: "idle" };
  if (!loaded || loaded.key !== key) return { status: "loading" };
  return loaded.value;
}

/** Date → has free slots. Null while loading or when the request failed (all dates stay selectable). */
export function useDays(query: Query): Map<string, boolean> | null {
  const key = queryKey(query);
  const [loaded, setLoaded] = useState<Loaded<Map<string, boolean> | null> | null>(null);

  useEffect(() => {
    if (!key) return;
    const [serviceIds, barberId, rescheduleToken] = key.split("|");
    let cancelled = false;

    fetchDays({ serviceIds: serviceIds.split(","), barberId, rescheduleToken: rescheduleToken || undefined }).then(
      (days) => {
        if (!cancelled) setLoaded({ key, value: new Map(days.map((day) => [day.date, day.available])) });
      },
      () => {
        if (!cancelled) setLoaded({ key, value: null });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [key]);

  return key && loaded?.key === key ? loaded.value : null;
}
