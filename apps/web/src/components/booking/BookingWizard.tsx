"use client";

import Link from "next/link";
import {
  addTransitionType,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { shop } from "@/data/mock";
import {
  ANY_BARBER,
  canPerformAll,
  eligibleBarbers,
  pluralServices,
  selectedServices,
  totals,
} from "@/lib/booking";
import { ApiRequestError, createBooking } from "@/lib/bookingApi";
import { formatDuration, formatPrice } from "@/lib/format";
import { formatLocalPhone, isValidLocalPhone, toE164, UZ_PHONE_PREFIX } from "@/lib/phone";
import { addDays, BOOKING_HORIZON_DAYS, formatLongDate, shopClock, shopDate, upcomingDates } from "@/lib/time";
import type { Barber, Booking, Service } from "@/types";
import { BarberStep, ContactsStep, DateStep, ReviewStep, ServiceStep, TimeStep } from "./Steps";
import { useDays, useSlots } from "./useSlots";
import styles from "./Booking.module.css";

const STEPS = [
  { id: "service", label: "Услуга", title: "Выберите услуги" },
  { id: "barber", label: "Барбер", title: "Выберите мастера" },
  { id: "date", label: "Дата", title: "Выберите дату" },
  { id: "time", label: "Время", title: "Выберите время" },
  { id: "contacts", label: "Контакты", title: "Как к вам обращаться" },
  { id: "review", label: "Подтверждение", title: "Проверьте запись" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const STEP_DIRECTION = {
  "step-forward": "step-forward",
  "step-back": "step-back",
  default: "none",
} as const;

const STEP_INDEX = Object.fromEntries(STEPS.map((step, index) => [step.id, index])) as Record<
  StepId,
  number
>;

export type BookingWizardProps = {
  services: Service[];
  barbers: Barber[];
  initialServiceIds: string[];
  initialBarberId: string | null;
  initialDate: string | null;
  initialTime: string | null;
};

/** API errors that mean "pick another time" rather than "try again later". */
const SLOT_ERRORS: Record<string, string> = {
  SLOT_TAKEN: "Это время только что заняли. Выберите другое — список обновлён.",
  TOO_SOON: "На это время уже нельзя записаться — до начала осталось слишком мало. Выберите другое.",
  OUTSIDE_WORKING_HOURS: "Это время больше недоступно — расписание изменилось. Выберите другое.",
  TOO_FAR: "На эту дату запись ещё не открыта. Выберите другую.",
};

function barberName(barbers: Barber[], id: string | null): string {
  if (id === ANY_BARBER) return "Любой свободный";
  return barbers.find((barber) => barber.id === id)?.name ?? "";
}

export function BookingWizard(props: BookingWizardProps) {
  const { services, barbers } = props;
  const [serviceIds, setServiceIds] = useState(props.initialServiceIds);
  const [barberId, setBarberId] = useState(props.initialBarberId);
  const [date, setDate] = useState(props.initialDate);
  const [time, setTime] = useState(props.initialTime);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showContactErrors, setShowContactErrors] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Booking | null>(null);
  const [stepIndex, setStepIndex] = useState(() => {
    if (props.initialServiceIds.length === 0) return STEP_INDEX.service;
    if (!props.initialBarberId) return STEP_INDEX.barber;
    if (!props.initialDate) return STEP_INDEX.date;
    return STEP_INDEX.time;
  });

  const dates = useMemo(() => upcomingDates(BOOKING_HORIZON_DAYS), []);
  const chosen = useMemo(() => selectedServices(services, serviceIds), [services, serviceIds]);
  const eligible = useMemo(() => eligibleBarbers(barbers, serviceIds), [barbers, serviceIds]);
  const sum = totals(chosen);

  const availability = useDays({ serviceIds, barberId });
  const slotsState = useSlots({ serviceIds, barberId, date, attempt });
  const selectedSlot =
    slotsState.status === "ready" ? slotsState.slots.find((slot) => slot.time === time) : undefined;

  const contactsValid = name.trim().length >= 2 && isValidLocalPhone(phone);
  const complete: Record<StepId, boolean> = {
    service: serviceIds.length > 0,
    barber: barberId !== null,
    date: date !== null,
    time: selectedSlot !== undefined,
    contacts: contactsValid,
    review: false,
  };
  const firstIncomplete = STEPS.findIndex((step) => !complete[step.id]);
  const maxReachable = firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete;
  const step = STEPS[stepIndex];

  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stepIndex]);

  function goTo(index: number) {
    if (index > maxReachable) return;
    startTransition(() => {
      addTransitionType(index > stepIndex ? "step-forward" : "step-back");
      setNotice(null);
      setStepIndex(index);
    });
  }

  function toggleService(id: string) {
    const next = serviceIds.includes(id)
      ? serviceIds.filter((item) => item !== id)
      : [...serviceIds, id];
    setServiceIds(next);

    const barber = barbers.find((item) => item.id === barberId);
    if (barber && !canPerformAll(barber, next)) {
      setBarberId(null);
      setTime(null);
    }
  }

  function selectBarber(id: string) {
    if (id === barberId) return;
    setBarberId(id);
    setTime(null);
  }

  function selectDate(value: string) {
    if (value === date) return;
    setDate(value);
    setTime(null);
  }

  function nextDay() {
    if (!date) return;
    const next = addDays(date, 1);
    if (dates.includes(next)) selectDate(next);
  }

  async function submit() {
    if (!selectedSlot || !barberId) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createBooking({
        serviceIds,
        barberId,
        startsAt: selectedSlot.startsAt,
        client: { name: name.trim(), phone: toE164(phone) },
      });
      setCreated(result);
    } catch (error) {
      const slotMessage = error instanceof ApiRequestError ? SLOT_ERRORS[error.code] : undefined;
      if (slotMessage) {
        setTime(null);
        setAttempt((value) => value + 1);
        setStepIndex(STEP_INDEX.time);
        setNotice(slotMessage);
      } else {
        setSubmitError("Не удалось отправить запись. Проверьте подключение и попробуйте ещё раз.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (step.id === "contacts" && !contactsValid) {
      setShowContactErrors(true);
      return;
    }
    if (step.id === "review") {
      void submit();
      return;
    }
    goTo(stepIndex + 1);
  }

  if (created) return <SuccessScreen booking={created} />;

  const primaryDisabled =
    submitting || (step.id !== "contacts" && step.id !== "review" && !complete[step.id]);
  const reviewRows = [
    { label: "Услуги", value: chosen.map((s) => s.name).join(", "), step: STEP_INDEX.service },
    { label: "Мастер", value: barberName(barbers, barberId), step: STEP_INDEX.barber },
    {
      label: "Дата и время",
      value: date && time ? `${formatLongDate(date)}, ${time}` : "",
      step: STEP_INDEX.date,
    },
    {
      label: "Контакты",
      value: `${name.trim()}, ${UZ_PHONE_PREFIX} ${formatLocalPhone(phone)}`,
      step: STEP_INDEX.contacts,
    },
  ];

  return (
    <div className={styles.wizard}>
      <div className={styles.head}>
        <h1 className={styles.pageTitle}>Запись</h1>
        <Stepper current={stepIndex} maxReachable={maxReachable} onSelect={goTo} />
      </div>

      <div className={styles.layout}>
        <ViewTransition key={step.id} enter={STEP_DIRECTION} exit={STEP_DIRECTION} default="none">
          <section className={styles.panel} aria-labelledby="step-title">
            <h2 id="step-title" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
              {step.title}
            </h2>

            {notice && (
              <p className={styles.notice} role="alert">
                {notice}
              </p>
            )}

            {step.id === "service" && (
              <ServiceStep services={services} selectedIds={serviceIds} onToggle={toggleService} />
            )}
            {step.id === "barber" && (
              <BarberStep
                barbers={barbers}
                selectedId={barberId}
                chosenServices={chosen}
                eligible={eligible}
                onSelect={selectBarber}
              />
            )}
            {step.id === "date" && (
              <DateStep dates={dates} selected={date} availability={availability} onSelect={selectDate} />
            )}
            {step.id === "time" && (
              <TimeStep
                state={slotsState}
                date={date}
                selected={time}
                canPickOtherBarber={barberId !== ANY_BARBER}
                onSelect={setTime}
                onRetry={() => setAttempt((value) => value + 1)}
                onNextDay={nextDay}
                onOtherBarber={() => goTo(STEP_INDEX.barber)}
              />
            )}
            {step.id === "contacts" && (
              <ContactsStep
                name={name}
                phone={phone}
                showErrors={showContactErrors}
                onName={setName}
                onPhone={setPhone}
              />
            )}
            {step.id === "review" && (
              <ReviewStep rows={reviewRows} error={submitError} onEdit={goTo} />
            )}
          </section>
        </ViewTransition>

        <aside className={styles.summary} aria-label="Ваша запись">
          <h2 className={styles.summaryTitle}>Ваша запись</h2>
          <dl className={styles.summaryList}>
            <div>
              <dt>Услуги</dt>
              <dd>{chosen.length ? chosen.map((s) => s.name).join(", ") : "Не выбраны"}</dd>
            </div>
            <div>
              <dt>Мастер</dt>
              <dd>{barberId ? barberName(barbers, barberId) : "Не выбран"}</dd>
            </div>
            <div>
              <dt>Когда</dt>
              <dd>
                {date ? formatLongDate(date) : "Дата не выбрана"}
                {date && time ? `, ${time}` : ""}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className={styles.bar}>
        <div className={`container ${styles.barInner}`}>
          <div className={styles.barTotals} aria-live="polite">
            {chosen.length > 0 ? (
              <>
                <span className={styles.barPrice}>{formatPrice(sum.price)}</span>
                <span className={styles.barMeta}>
                  {pluralServices(chosen.length)}, {formatDuration(sum.durationMin)}
                </span>
              </>
            ) : (
              <span className={styles.barMeta}>Выберите хотя бы одну услугу</span>
            )}
          </div>
          <div className={styles.barActions}>
            {stepIndex > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => goTo(stepIndex - 1)}>
                Назад
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={next}
              disabled={primaryDisabled}
              aria-busy={submitting}
            >
              {step.id === "review" ? (submitting ? "Записываем…" : "Записаться") : "Далее"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper(props: { current: number; maxReachable: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Шаги записи" className={styles.stepper}>
      <p className={styles.stepperCompact}>
        Шаг {props.current + 1} из {STEPS.length}: {STEPS[props.current].label}
      </p>
      <div className={styles.progress} aria-hidden="true">
        <span style={{ width: `${((props.current + 1) / STEPS.length) * 100}%` }} />
      </div>
      <ol className={styles.steps}>
        {STEPS.map((item, index) => {
          const state =
            index === props.current ? "current" : index < props.current ? "done" : "upcoming";
          const reachable = index <= props.maxReachable && index !== props.current;
          return (
            <li key={item.id} className={styles[state]}>
              {reachable ? (
                <button type="button" onClick={() => props.onSelect(index)}>
                  <span className={styles.stepNum}>{index + 1}</span>
                  {item.label}
                </button>
              ) : (
                <span aria-current={index === props.current ? "step" : undefined}>
                  <span className={styles.stepNum}>{index + 1}</span>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SuccessScreen({ booking }: { booking: Booking }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const telegramLink = `https://t.me/${shop.telegramBot}?start=b_${booking.token}`;

  return (
    <section className={styles.success} aria-labelledby="success-title">
      <div className={styles.successStripe} aria-hidden="true" />
      <h1 id="success-title" ref={headingRef} tabIndex={-1} className={styles.pageTitle}>
        Вы записаны
      </h1>
      <p className={styles.successWhen}>
        {formatLongDate(shopDate(booking.startsAt))}, {shopClock(booking.startsAt)}
      </p>
      <dl className={styles.summaryList}>
        <div>
          <dt>Мастер</dt>
          <dd>{booking.barber.name}</dd>
        </div>
        <div>
          <dt>Услуги</dt>
          <dd>{booking.services.map((service) => service.name).join(", ")}</dd>
        </div>
        <div>
          <dt>К оплате в барбершопе</dt>
          <dd>{formatPrice(booking.totalPrice)}</dd>
        </div>
        <div>
          <dt>Адрес</dt>
          <dd>
            {shop.address}. {shop.landmark}
          </dd>
        </div>
      </dl>
      <p className={styles.hint}>
        Подключите Telegram — пришлём напоминание за день и за 30 минут. Отменить или перенести
        запись можно по ссылке ниже — сохраните её.
      </p>
      <div className={styles.messageActions}>
        <a href={telegramLink} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
          Получать напоминания в Telegram
        </a>
        <Link
          href={`/booking/${booking.token}`}
          className="btn btn-ghost"
          transitionTypes={["nav-forward"]}
        >
          Управлять записью
        </Link>
        <Link href="/" className="btn btn-ghost" transitionTypes={["nav-back"]}>
          На главную
        </Link>
      </div>
    </section>
  );
}
