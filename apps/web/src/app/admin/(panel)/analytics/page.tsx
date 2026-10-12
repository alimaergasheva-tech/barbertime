import Link from "next/link";
import { adminFetch } from "@/lib/admin/api";
import {
  addDays,
  formatDay,
  formatHours,
  formatPercent,
  formatSum,
  shopDate,
  SOURCE_LABEL,
  WEEKDAYS,
} from "@/lib/admin/format";
import type {
  AnalyticsResponse,
  BarberLoadStats,
  BookingSource,
  HeatmapStats,
  RetentionStats,
  RevenueStats,
  ServiceStats,
  StatusStats,
} from "@/lib/admin/types";
import styles from "@/components/admin/admin.module.css";
import a from "./analytics.module.css";

const MAX_DAYS = 366;
const PRESETS = [7, 30, 90];
const SHORT_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const isDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
const shortDate = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`;

/** Invalid or too long periods fall back to the last 30 days. */
function resolvePeriod(params: { from?: string; to?: string }, today: string) {
  const { from, to } = params;
  if (isDate(from) && isDate(to) && from! <= to! && daysBetween(from!, to!) <= MAX_DAYS) return { from: from!, to: to! };
  return { from: addDays(today, -29), to: today };
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={a.kpi}>
      <span className={a.kpiLabel}>{label}</span>
      <strong className={a.kpiValue}>{value}</strong>
      {hint && <span className={a.kpiHint}>{hint}</span>}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className={a.meter} aria-hidden>
      <span style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const today = shopDate();
  const period = resolvePeriod(await searchParams, today);
  const query = `from=${period.from}&to=${period.to}`;
  const load = <T,>(section: string) => adminFetch<AnalyticsResponse<T>>(`/analytics/${section}?${query}`).then((r) => r.data);

  const [revenue, statuses, services, barbers, heatmap, retention] = await Promise.all([
    load<RevenueStats>("revenue"),
    load<StatusStats>("cancellations"),
    load<ServiceStats>("services"),
    load<BarberLoadStats>("load"),
    load<HeatmapStats>("heatmap"),
    load<RetentionStats>("retention"),
  ]);

  const delta = revenue.previousTotal > 0 ? (revenue.total - revenue.previousTotal) / revenue.previousTotal : null;
  const maxDay = Math.max(0, ...revenue.days.map((d) => d.revenue));
  const maxService = Math.max(0, ...services.map((s) => s.count));
  const hours = heatmap.cells.map((c) => c.hour);
  const [firstHour, lastHour] = hours.length ? [Math.min(9, ...hours), Math.max(20, ...hours)] : [9, 20];
  const hourRange = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const cell = (weekday: number, hour: number) => heatmap.cells.find((c) => c.weekday === weekday && c.hour === hour)?.count ?? 0;
  const days = daysBetween(period.from, period.to);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Аналитика</h1>
          <p className={styles.subtitle}>
            {formatDay(period.from)} — {formatDay(period.to)} · дней: {days}
          </p>
        </div>
        <nav className={styles.actions} aria-label="Период">
          {PRESETS.map((n) => {
            const href = `/admin/analytics?from=${addDays(today, 1 - n)}&to=${today}`;
            const active = period.to === today && days === n;
            return (
              <Link key={n} href={href} className={`${styles.button} ${styles.small} ${active ? "" : styles.secondary}`} aria-current={active ? "page" : undefined}>
                {n} дней
              </Link>
            );
          })}
        </nav>
      </div>

      <form className={`${styles.card} ${styles.actions}`} aria-label="Свой период">
        <label className={styles.field}>
          С
          <input type="date" name="from" defaultValue={period.from} required />
        </label>
        <label className={styles.field}>
          По
          <input type="date" name="to" defaultValue={period.to} required />
        </label>
        <button type="submit" className={`${styles.button} ${styles.secondary}`} style={{ alignSelf: "flex-end" }}>
          Показать
        </button>
        <span className={styles.muted} style={{ alignSelf: "flex-end" }}>
          До {MAX_DAYS} дней. Записи относятся к периоду по дате визита.
        </span>
      </form>

      <section className={a.kpis} aria-label="Ключевые показатели">
        <Kpi
          label="Выручка"
          value={formatSum(revenue.total)}
          hint={delta === null ? "по завершённым визитам" : `${delta >= 0 ? "+" : ""}${formatPercent(delta)} к прошлым ${days} дн.`}
        />
        <Kpi label="Записей" value={String(statuses.total)} hint={`завершено ${statuses.completed}, впереди ${statuses.confirmed}`} />
        <Kpi label="Средний чек" value={formatSum(revenue.averageCheck)} hint={`визитов: ${revenue.completed}`} />
        <Kpi label="Отмены" value={formatPercent(statuses.cancelRate)} hint={`${statuses.cancelled} из ${statuses.total}`} />
        <Kpi label="Неявки" value={formatPercent(statuses.noShowRate)} hint={`${statuses.noShow} из ${statuses.completed + statuses.noShow} визитов`} />
        <Kpi
          label="Возвращаемость"
          value={formatPercent(retention.returningRate)}
          hint={`${retention.returningClients} из ${retention.clients} клиентов`}
        />
      </section>

      <section className={styles.card} aria-labelledby="revenue-chart">
        <h2 className={styles.cardTitle} id="revenue-chart">
          Выручка по дням
        </h2>
        {maxDay === 0 ? (
          <p className={styles.muted}>Завершённых визитов за период нет.</p>
        ) : (
          <>
            <div className={a.chart} role="img" aria-label={`Выручка по дням, максимум ${formatSum(maxDay)}`}>
              {revenue.days.map((day) => (
                <span key={day.date} className={a.column} title={`${shortDate(day.date)}: ${formatSum(day.revenue)} · визитов ${day.completed}`}>
                  <span style={{ height: `${(day.revenue / maxDay) * 100}%` }} />
                </span>
              ))}
            </div>
            <div className={a.chartAxis} aria-hidden>
              <span>{shortDate(period.from)}</span>
              <span>макс. {formatSum(maxDay)}</span>
              <span>{shortDate(period.to)}</span>
            </div>
          </>
        )}
      </section>

      <div className={a.split}>
        <section className={styles.card} aria-labelledby="services-stats">
          <h2 className={styles.cardTitle} id="services-stats">
            Популярные услуги
          </h2>
          {services.length === 0 ? (
            <p className={styles.muted}>Нет данных.</p>
          ) : (
            <ul className={a.ranking}>
              {services.map((service) => (
                <li key={service.serviceId}>
                  <span className={a.rankingHead}>
                    <span>{service.name}</span>
                    <span className={styles.muted}>
                      {service.count} · {formatSum(service.revenue)}
                    </span>
                  </span>
                  <Bar value={service.count} max={maxService} />
                </li>
              ))}
            </ul>
          )}
          <p className={a.note}>Без отменённых записей; выручка — по завершённым.</p>
        </section>

        <section className={styles.card} aria-labelledby="clients-stats">
          <h2 className={styles.cardTitle} id="clients-stats">
            Клиенты и источники
          </h2>
          <dl className={a.facts}>
            {[
              ["Клиентов с визитом", retention.clients],
              ["Новые", retention.newClients],
              ["Вернувшиеся", retention.returningClients],
              ["Пришли 2+ раза за период", retention.repeatInPeriod],
              ["Визитов на клиента", retention.visitsPerClient],
              ...(Object.keys(statuses.bySource) as BookingSource[]).map((source) => [`Записи: ${SOURCE_LABEL[source]}`, statuses.bySource[source]]),
            ].map(([label, value]) => (
              <div key={label} className={a.factRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className={a.note}>Вернувшийся — был завершённый визит до периода или 2+ визита в периоде.</p>
        </section>
      </div>

      <section className={styles.card} aria-labelledby="load-stats">
        <h2 className={styles.cardTitle} id="load-stats">
          Загрузка барберов
        </h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Мастер</th>
              <th>Загрузка</th>
              <th>Занято / доступно</th>
              <th>Визиты</th>
              <th>Выручка</th>
              <th>Отмены</th>
              <th>Неявки</th>
            </tr>
          </thead>
          <tbody>
            {barbers.map((barber) => (
              <tr key={barber.barberId}>
                <td>
                  <strong>{barber.name}</strong>
                  {!barber.isActive && <span className={styles.muted}> (скрыт)</span>}
                </td>
                <td data-label="Загрузка">
                  <span className={a.loadCell}>
                    {formatPercent(barber.load)}
                    <Bar value={barber.load ?? 0} max={1} />
                  </span>
                </td>
                <td data-label="Занято / доступно">
                  {formatHours(barber.bookedMin)} / {formatHours(barber.availableMin)}
                </td>
                <td data-label="Визиты">
                  {barber.completed} из {barber.bookings}
                </td>
                <td data-label="Выручка">{formatSum(barber.revenue)}</td>
                <td data-label="Отмены">{barber.cancelled}</td>
                <td data-label="Неявки">{barber.noShow}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={a.note}>Доступно — рабочие часы минус обеды и исключения; занято — все записи, кроме отменённых.</p>
      </section>

      <section className={styles.card} aria-labelledby="heatmap">
        <h2 className={styles.cardTitle} id="heatmap">
          Загрузка по дням и часам
        </h2>
        <div className={a.heatmapScroll}>
          <table className={a.heatmap}>
            <thead>
              <tr>
                <th scope="col">
                  <span className={a.srOnly}>День</span>
                </th>
                {hourRange.map((hour) => (
                  <th key={hour} scope="col">
                    {hour}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHORT_DAYS.map((label, index) => (
                <tr key={label}>
                  <th scope="row" title={WEEKDAYS[index]}>
                    {label}
                  </th>
                  {hourRange.map((hour) => {
                    const count = cell(index + 1, hour);
                    const level = heatmap.max && count ? 0.15 + 0.85 * (count / heatmap.max) : 0;
                    return (
                      <td
                        key={hour}
                        style={{ "--level": `${Math.round(level * 100)}%` } as React.CSSProperties}
                        data-empty={count === 0 || undefined}
                        data-strong={level >= 0.55 || undefined}
                        title={`${WEEKDAYS[index]}, ${hour}:00 — записей: ${count}`}
                      >
                        {count || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={a.note}>Число записей (кроме отменённых) по времени начала визита.</p>
      </section>
    </>
  );
}
