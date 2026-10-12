import { api, errorMessage } from "./api";
import { dayParts, formatLongDate } from "./format";
import { haptic } from "./telegram";
import type { Slot } from "./types";
import { useAsync } from "./useAsync";

export type AvailabilityQuery = { serviceIds: string[]; barberId: string; rescheduleToken?: string };

const queryKey = (query: AvailabilityQuery) =>
  `${query.serviceIds.join(",")}|${query.barberId}|${query.rescheduleToken ?? ""}`;

function Retry({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="message" role="alert">
      <p>{errorMessage(error)}</p>
      <button type="button" className="button secondary" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}

export function DayPicker(props: {
  query: AvailabilityQuery;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const days = useAsync(`days|${queryKey(props.query)}`, () => api.days(props.query));

  if (days.status === "error") return <Retry error={days.error} onRetry={days.reload} />;
  if (days.status !== "ready") {
    return <div className="days" aria-busy="true">{Array.from({ length: 7 }, (_, i) => <span key={i} className="day skeleton" />)}</div>;
  }

  return (
    <div className="days" role="radiogroup" aria-label="Дата" data-ready="true">
      {days.data.map(({ date, available }, index) => {
        const parts = dayParts(date);
        return (
          <button
            key={date}
            type="button"
            role="radio"
            aria-checked={props.selected === date}
            aria-label={`${formatLongDate(date)}${available ? "" : ", нет свободного времени"}`}
            className="day"
            disabled={!available}
            onClick={() => {
              haptic.select();
              props.onSelect(date);
            }}
          >
            <span className="day-weekday">{index === 0 ? "сегодня" : index === 1 ? "завтра" : parts.weekday}</span>
            <span className="day-number">{parts.day}</span>
            <span className="day-month">{parts.month}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TimePicker(props: {
  query: AvailabilityQuery;
  date: string;
  /** Bump to refetch after SLOT_TAKEN. */
  refresh: number;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  const slots = useAsync(`slots|${queryKey(props.query)}|${props.date}|${props.refresh}`, () =>
    api.slots({ ...props.query, date: props.date }),
  );

  if (slots.status === "error") return <Retry error={slots.error} onRetry={slots.reload} />;
  if (slots.status !== "ready") {
    return <div className="times" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <span key={i} className="time skeleton" />)}</div>;
  }
  if (slots.data.length === 0) {
    return <p className="message">На этот день свободного времени нет — выберите другой.</p>;
  }

  return (
    <div className="times" role="radiogroup" aria-label="Время">
      {slots.data.map((slot) => (
        <button
          key={slot.startsAt}
          type="button"
          role="radio"
          aria-checked={props.selected?.startsAt === slot.startsAt}
          className="time"
          onClick={() => {
            haptic.select();
            props.onSelect(slot);
          }}
        >
          {slot.time}
        </button>
      ))}
    </div>
  );
}
