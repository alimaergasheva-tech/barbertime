"use client";

import { ANY_BARBER, missingServices } from "@/lib/booking";
import { formatDuration, formatPrice, yearsLabel } from "@/lib/format";
import { formatLocalPhone, normalizeLocalDigits, UZ_PHONE_PREFIX } from "@/lib/phone";
import { dateParts, formatLongDate } from "@/lib/time";
import type { Barber, Service } from "@/types";
import type { SlotsState } from "./useSlots";
import styles from "./Booking.module.css";

export function ServiceStep(props: {
  services: Service[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className="visually-hidden">Услуги</legend>
      <p className={styles.hint}>Можно выбрать несколько — время и цена сложатся.</p>
      <ul className={styles.options}>
        {props.services.map((service) => (
          <li key={service.id}>
            <label className={styles.option}>
              <input
                type="checkbox"
                className="visually-hidden"
                checked={props.selectedIds.includes(service.id)}
                onChange={() => props.onToggle(service.id)}
              />
              <span className={`${styles.marker} ${styles.markerSquare}`} aria-hidden="true" />
              <span className={styles.optionMain}>
                <span className={styles.optionTitle}>{service.name}</span>
                <span className={styles.optionNote}>{service.description}</span>
              </span>
              <span className={styles.optionSide}>
                <span className={styles.optionPrice}>{formatPrice(service.price)}</span>
                <span className={styles.optionNote}>{formatDuration(service.durationMin)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function BarberStep(props: {
  barbers: Barber[];
  selectedId: string | null;
  chosenServices: Service[];
  eligible: Barber[];
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className="visually-hidden">Мастер</legend>
      <ul className={styles.options}>
        <li>
          <label className={styles.option}>
            <input
              type="radio"
              name="barber"
              className="visually-hidden"
              checked={props.selectedId === ANY_BARBER}
              disabled={props.eligible.length === 0}
              onChange={() => props.onSelect(ANY_BARBER)}
            />
            <span className={styles.marker} aria-hidden="true" />
            <span className={styles.optionMain}>
              <span className={styles.optionTitle}>Любой свободный</span>
              <span className={styles.optionNote}>
                Покажем время всех подходящих мастеров, а мастера назначим при записи
              </span>
            </span>
          </label>
        </li>

        {props.barbers.map((barber) => {
          const missing = missingServices(barber, props.chosenServices);
          const disabled = missing.length > 0;
          return (
            <li key={barber.id}>
              <label className={styles.option}>
                <input
                  type="radio"
                  name="barber"
                  className="visually-hidden"
                  checked={props.selectedId === barber.id}
                  disabled={disabled}
                  onChange={() => props.onSelect(barber.id)}
                  aria-describedby={`barber-note-${barber.id}`}
                />
                <span className={`${styles.avatar} ${styles[barber.tone]}`} aria-hidden="true">
                  {barber.name[0]}
                </span>
                <span className={styles.optionMain}>
                  <span className={styles.optionTitle}>{barber.name}</span>
                  <span id={`barber-note-${barber.id}`} className={styles.optionNote}>
                    {disabled
                      ? `Не выполняет: ${missing.map((s) => s.name.toLowerCase()).join(", ")}`
                      : `Опыт ${yearsLabel(barber.experienceYears)}`}
                  </span>
                </span>
                <span className={styles.rating}>
                  {barber.rating !== null ? `★ ${barber.rating.toFixed(1)}` : "Новый"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function DateStep(props: {
  dates: string[];
  selected: string | null;
  /** Date → has free time; null while unknown. */
  availability: Map<string, boolean> | null;
  onSelect: (date: string) => void;
}) {
  return (
    <fieldset className={styles.fieldset} data-availability={props.availability ? "ready" : "pending"}>
      <legend className="visually-hidden">Дата</legend>
      <ul className={styles.dates}>
        {props.dates.map((date, index) => {
          const parts = dateParts(date);
          const showMonth = index === 0 || parts.day === 1;
          const full = props.availability?.get(date) === false;
          return (
            <li key={date}>
              <label className={styles.dateCell}>
                <input
                  type="radio"
                  name="date"
                  className="visually-hidden"
                  checked={props.selected === date}
                  disabled={full && props.selected !== date}
                  onChange={() => props.onSelect(date)}
                  aria-label={`${formatLongDate(date)}${full ? ", нет свободного времени" : ""}`}
                />
                <span className={styles.dateWeekday}>
                  {index === 0 ? "сегодня" : index === 1 ? "завтра" : parts.weekday}
                </span>
                <span className={styles.dateDay}>{parts.day}</span>
                <span className={styles.dateMonth}>{showMonth ? parts.month : "\u00a0"}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function TimeStep(props: {
  state: SlotsState;
  date: string | null;
  selected: string | null;
  canPickOtherBarber: boolean;
  onSelect: (time: string) => void;
  onRetry: () => void;
  onNextDay: () => void;
  onOtherBarber: () => void;
}) {
  const { state } = props;

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div role="status" aria-live="polite">
        <span className="visually-hidden">Загружаем свободное время</span>
        <ul className={styles.times} aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className={styles.skeleton} />
          ))}
        </ul>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={styles.message} role="alert">
        <p className={styles.messageTitle}>Не удалось загрузить свободное время</p>
        <p>Проверьте подключение к интернету и попробуйте ещё раз.</p>
        <button type="button" className="btn btn-ghost" onClick={props.onRetry}>
          Повторить
        </button>
      </div>
    );
  }

  if (state.slots.length === 0) {
    return (
      <div className={styles.message}>
        <p className={styles.messageTitle}>
          {props.date ? `На ${formatLongDate(props.date)} свободного времени нет` : "Свободного времени нет"}
        </p>
        <p>Попробуйте следующий день или другого мастера.</p>
        <div className={styles.messageActions}>
          <button type="button" className="btn btn-primary" onClick={props.onNextDay}>
            Следующий день
          </button>
          {props.canPickOtherBarber && (
            <button type="button" className="btn btn-ghost" onClick={props.onOtherBarber}>
              Другой мастер
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className="visually-hidden">Время</legend>
      <ul className={styles.times}>
        {state.slots.map((slot) => (
          <li key={slot.time}>
            <label className={styles.timeCell}>
              <input
                type="radio"
                name="time"
                className="visually-hidden"
                checked={props.selected === slot.time}
                onChange={() => props.onSelect(slot.time)}
              />
              {slot.time}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function ContactsStep(props: {
  name: string;
  phone: string;
  showErrors: boolean;
  onName: (value: string) => void;
  onPhone: (digits: string) => void;
}) {
  const nameError = props.showErrors && props.name.trim().length < 2;
  const phoneError = props.showErrors && props.phone.length !== 9;

  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <label htmlFor="client-name">Имя</label>
        <input
          id="client-name"
          name="name"
          autoComplete="given-name"
          value={props.name}
          onChange={(event) => props.onName(event.target.value)}
          aria-invalid={nameError}
          aria-describedby={nameError ? "client-name-error" : undefined}
          maxLength={60}
        />
        {nameError && (
          <p id="client-name-error" className={styles.error}>
            Введите имя — хотя бы две буквы.
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="client-phone">Телефон</label>
        <div className={styles.phone}>
          <span className={styles.phonePrefix} aria-hidden="true">
            {UZ_PHONE_PREFIX}
          </span>
          <input
            id="client-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="90 123-45-67"
            value={formatLocalPhone(props.phone)}
            onChange={(event) => props.onPhone(normalizeLocalDigits(event.target.value))}
            aria-invalid={phoneError}
            aria-describedby={phoneError ? "client-phone-error" : "client-phone-hint"}
          />
        </div>
        {phoneError ? (
          <p id="client-phone-error" className={styles.error}>
            Введите 9 цифр номера после +998.
          </p>
        ) : (
          <p id="client-phone-hint" className={styles.fieldHint}>
            Позвоним, только если запись изменится.
          </p>
        )}
      </div>
    </div>
  );
}

export function ReviewStep(props: {
  rows: { label: string; value: string; step: number }[];
  error: string | null;
  onEdit: (step: number) => void;
}) {
  return (
    <div>
      <dl className={styles.review}>
        {props.rows.map((row) => (
          <div key={row.label} className={styles.reviewRow}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
            <button
              type="button"
              className={styles.edit}
              onClick={() => props.onEdit(row.step)}
              aria-label={`Изменить: ${row.label.toLowerCase()}`}
            >
              Изменить
            </button>
          </div>
        ))}
      </dl>
      <p className={styles.hint}>
        Отменить или перенести запись можно не позднее чем за 30 минут до начала.
      </p>
      {props.error && (
        <p className={styles.error} role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}
