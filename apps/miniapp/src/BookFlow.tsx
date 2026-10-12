import { useMemo, useState } from "react";
import { api, ApiError, errorMessage, SLOT_ERROR_CODES } from "./api";
import { formatDuration, formatLocalPhone, formatPrice, formatWhen, normalizeLocalDigits, yearsLabel } from "./format";
import { DayPicker, TimePicker } from "./pickers";
import { haptic, isInTelegram, telegramUser, useBackButton } from "./telegram";
import { ANY_BARBER, type Barber, type Booking, type Service, type Slot } from "./types";
import { useAsync } from "./useAsync";

const STEPS = ["service", "barber", "when", "confirm"] as const;
type Step = (typeof STEPS)[number];

const TITLES: Record<Step, string> = {
  service: "Выберите услуги",
  barber: "Выберите мастера",
  when: "Дата и время",
  confirm: "Подтверждение",
};

export function BookFlow({ services, barbers, onShowMine }: {
  services: Service[];
  barbers: Barber[];
  onShowMine: () => void;
}) {
  const [step, setStep] = useState<Step>("service");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Booking | null>(null);

  const me = useAsync(isInTelegram ? "me" : null, api.me);
  const saved = me.status === "ready" ? me.data.client : null;
  const nameValue = name ?? saved?.name ?? telegramUser?.first_name ?? "";
  const phoneValue = phone ?? (saved ? normalizeLocalDigits(saved.phone) : "");

  const chosen = useMemo(() => services.filter((s) => serviceIds.includes(s.id)), [services, serviceIds]);
  const total = chosen.reduce((acc, s) => ({ price: acc.price + s.price, min: acc.min + s.durationMin }), { price: 0, min: 0 });
  const canPerform = (barber: Barber) => serviceIds.every((id) => barber.serviceIds.includes(id));
  const barberName = barberId === ANY_BARBER ? "Любой свободный" : barbers.find((b) => b.id === barberId)?.name ?? "";

  const index = STEPS.indexOf(step);
  const contactsValid = nameValue.trim().length >= 2 && phoneValue.length === 9;
  const canContinue =
    (step === "service" && serviceIds.length > 0) ||
    (step === "barber" && barberId !== null) ||
    (step === "when" && slot !== null) ||
    (step === "confirm" && contactsValid && !submitting);

  function go(next: Step) {
    setNotice(null);
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  useBackButton(created ? null : index > 0 ? () => go(STEPS[index - 1]) : null);

  function toggleService(id: string) {
    haptic.select();
    const next = serviceIds.includes(id) ? serviceIds.filter((item) => item !== id) : [...serviceIds, id];
    setServiceIds(next);
    const barber = barbers.find((b) => b.id === barberId);
    if (barber && !next.every((sid) => barber.serviceIds.includes(sid))) setBarberId(null);
    setSlot(null);
  }

  async function submit() {
    if (!slot || !barberId) return;
    setSubmitting(true);
    setError(null);
    try {
      const booking = await api.createBooking({
        serviceIds,
        barberId,
        startsAt: slot.startsAt,
        client: { name: nameValue.trim(), phone: `+998${phoneValue}` },
      });
      haptic.success();
      setCreated(booking);
    } catch (failure) {
      haptic.error();
      if (failure instanceof ApiError && SLOT_ERROR_CODES.has(failure.code)) {
        setSlot(null);
        setRefresh((value) => value + 1);
        setStep("when");
        setNotice(errorMessage(failure));
      } else {
        setError(errorMessage(failure));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section className="card success" aria-labelledby="done-title">
        <h2 id="done-title">Вы записаны</h2>
        <p className="when">{formatWhen(created.startsAt)}</p>
        <dl className="summary">
          <dt>Мастер</dt>
          <dd>{created.barber.name}</dd>
          <dt>Услуги</dt>
          <dd>{created.services.map((s) => s.name).join(", ")}</dd>
          <dt>К оплате</dt>
          <dd>{formatPrice(created.totalPrice)}</dd>
        </dl>
        <p className="hint">Напомним в Telegram за день и за 30 минут до визита.</p>
        <button type="button" className="button" onClick={onShowMine}>
          Мои записи
        </button>
      </section>
    );
  }

  return (
    <>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
      </div>
      <h2 className="step-title">{TITLES[step]}</h2>
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      {step === "service" && (
        <ul className="list" aria-label="Услуги">
          {services.map((service) => (
            <li key={service.id}>
              <label className="option">
                <input type="checkbox" checked={serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                <span className="option-main">
                  <span className="option-title">{service.name}</span>
                  <span className="option-note">{formatDuration(service.durationMin)}</span>
                </span>
                <span className="option-side">{formatPrice(service.price)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {step === "barber" && (
        <ul className="list" aria-label="Мастер">
          <li>
            <label className="option">
              <input
                type="radio"
                name="barber"
                checked={barberId === ANY_BARBER}
                onChange={() => {
                  haptic.select();
                  setBarberId(ANY_BARBER);
                  setSlot(null);
                }}
              />
              <span className="option-main">
                <span className="option-title">Любой свободный</span>
                <span className="option-note">Покажем время всех подходящих мастеров</span>
              </span>
            </label>
          </li>
          {barbers.map((barber) => (
            <li key={barber.id}>
              <label className="option">
                <input
                  type="radio"
                  name="barber"
                  checked={barberId === barber.id}
                  disabled={!canPerform(barber)}
                  onChange={() => {
                    haptic.select();
                    setBarberId(barber.id);
                    setSlot(null);
                  }}
                />
                <span className="option-main">
                  <span className="option-title">{barber.name}</span>
                  <span className="option-note">
                    {canPerform(barber) ? `Опыт ${yearsLabel(barber.experienceYears)}` : "Не выполняет выбранные услуги"}
                  </span>
                </span>
                <span className="option-side">{barber.rating !== null ? `★ ${barber.rating.toFixed(1)}` : "Новый"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {step === "when" && barberId && (
        <>
          <DayPicker
            query={{ serviceIds, barberId }}
            selected={date}
            onSelect={(value) => {
              setDate(value);
              setSlot(null);
            }}
          />
          {date && (
            <TimePicker query={{ serviceIds, barberId }} date={date} refresh={refresh} selected={slot} onSelect={setSlot} />
          )}
        </>
      )}

      {step === "confirm" && slot && (
        <>
          <dl className="summary card">
            <dt>Услуги</dt>
            <dd>{chosen.map((s) => s.name).join(", ")}</dd>
            <dt>Мастер</dt>
            <dd>{barberName}</dd>
            <dt>Когда</dt>
            <dd>{formatWhen(slot.startsAt)}</dd>
          </dl>
          <label className="field">
            <span>Имя</span>
            <input value={nameValue} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} />
          </label>
          <label className="field">
            <span>Телефон</span>
            <span className="phone">
              <span aria-hidden="true">+998</span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="90 123-45-67"
                value={formatLocalPhone(phoneValue)}
                onChange={(e) => setPhone(normalizeLocalDigits(e.target.value))}
                autoComplete="tel-national"
              />
            </span>
          </label>
          <p className="hint">Отменить или перенести запись можно в разделе «Мои записи».</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      <div className="bar">
        {chosen.length > 0 && (
          <span className="bar-total">
            {formatPrice(total.price)} · {formatDuration(total.min)}
          </span>
        )}
        <button
          type="button"
          className="button"
          disabled={!canContinue}
          aria-busy={submitting}
          onClick={() => (step === "confirm" ? void submit() : go(STEPS[index + 1]))}
        >
          {step === "confirm" ? (submitting ? "Записываем…" : "Записаться") : "Далее"}
        </button>
      </div>
    </>
  );
}
