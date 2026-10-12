import { describe, expect, it } from "vitest";
import { resolveStart, slotsForDay, type AvailabilityContext, type Candidate } from "./availability";
import type { BookingSettings } from "./settings";
import { computeStarts } from "./slots";
import { localClock, zonedToUtc } from "./time";

const TZ = "Asia/Tashkent";
const DATE = "2030-01-08"; // Tuesday
const at = (time: string, date = DATE) => {
  const [h, m] = time.split(":").map(Number);
  return zonedToUtc(date, h * 60 + m, TZ);
};
const clocks = (starts: Iterable<number>) => [...starts].map((start) => localClock(start, TZ));

const settings: BookingSettings = {
  cancelCutoffMin: 30,
  slotStepMin: 15,
  horizonDays: 30,
  minNoticeMin: 30,
  timezone: TZ,
};

function candidate(barberId: string, durationMin: number): Candidate {
  return {
    barberId,
    durationMin,
    price: 100000,
    items: [{ serviceId: "haircut", name: "Стрижка", durationMin, price: 100000 }],
  };
}

function context(overrides: Partial<AvailabilityContext> = {}): AvailabilityContext {
  const weekdays = (start: number, end: number) =>
    new Map([1, 2, 3, 4, 5, 6, 7].map((day) => [day, { start, end }]));
  return {
    settings,
    now: at("08:00", "2030-01-07"),
    today: "2030-01-07",
    lastDay: "2030-02-05",
    candidates: [candidate("timur", 60)],
    hours: new Map([
      ["timur", weekdays(10 * 60, 13 * 60)],
      ["aziz", weekdays(12 * 60, 14 * 60)],
    ]),
    breaks: new Map(),
    timeOff: [],
    bookings: [],
    ...overrides,
  };
}

describe("computeStarts", () => {
  const work = { start: at("10:00"), end: at("12:00") };

  it("puts starts on the step grid and keeps the whole service inside work hours", () => {
    const starts = computeStarts({ work, blocked: [], durationMin: 45, stepMin: 15, notBefore: 0 });
    expect(clocks(starts)).toEqual(["10:00", "10:15", "10:30", "10:45", "11:00", "11:15"]);
  });

  it("returns nothing on a day off or when the service is longer than the shift", () => {
    expect(computeStarts({ work: null, blocked: [], durationMin: 30, stepMin: 15, notBefore: 0 })).toEqual([]);
    expect(computeStarts({ work, blocked: [], durationMin: 150, stepMin: 15, notBefore: 0 })).toEqual([]);
  });

  it("allows back-to-back bookings (half-open intervals)", () => {
    const blocked = [{ start: at("10:00"), end: at("11:00") }];
    const starts = computeStarts({ work, blocked, durationMin: 60, stepMin: 15, notBefore: 0 });
    expect(clocks(starts)).toEqual(["11:00"]);
  });

  it("skips starts before notBefore", () => {
    const starts = computeStarts({ work, blocked: [], durationMin: 60, stepMin: 30, notBefore: at("10:20") });
    expect(clocks(starts)).toEqual(["10:30", "11:00"]);
  });
});

describe("slotsForDay", () => {
  it("excludes the lunch break and never lets a service run into it", () => {
    const ctx = context({
      breaks: new Map([["timur", new Map([[2, [{ start: 11 * 60, end: 11 * 60 + 30 }]]])]]),
    });
    expect(clocks(slotsForDay(ctx, DATE).keys())).toEqual(["10:00", "11:30", "11:45", "12:00"]);
  });

  it("respects the end of the working day for different durations", () => {
    expect(clocks(slotsForDay(context(), DATE).keys()).at(-1)).toBe("12:00");
    const short = context({ candidates: [candidate("timur", 30)] });
    expect(clocks(slotsForDay(short, DATE).keys()).at(-1)).toBe("12:30");
  });

  it("excludes confirmed bookings of that barber", () => {
    const ctx = context({ bookings: [{ barberId: "timur", start: at("10:30"), end: at("11:30") }] });
    expect(clocks(slotsForDay(ctx, DATE).keys())).toEqual(["11:30", "11:45", "12:00"]);
  });

  it("applies personal and shop-wide time off", () => {
    const personal = context({ timeOff: [{ barberId: "timur", start: at("00:00"), end: at("23:59") }] });
    expect(slotsForDay(personal, DATE).size).toBe(0);

    const shopWide = context({ timeOff: [{ barberId: null, start: at("10:00"), end: at("12:00") }] });
    expect(clocks(slotsForDay(shopWide, DATE).keys())).toEqual(["12:00"]);
  });

  it("applies min notice on the current day", () => {
    const ctx = context({ now: at("10:40"), today: DATE });
    expect(clocks(slotsForDay(ctx, DATE).keys())).toEqual(["11:15", "11:30", "11:45", "12:00"]);
  });

  it("returns nothing outside the booking horizon or in the past", () => {
    expect(slotsForDay(context(), "2030-02-06").size).toBe(0);
    expect(slotsForDay(context(), "2030-01-06").size).toBe(0);
  });

  it("merges barbers in 'any' mode, keeping each barber's own duration", () => {
    const ctx = context({ candidates: [candidate("timur", 60), candidate("aziz", 30)] });
    const slots = slotsForDay(ctx, DATE);
    expect(slots.get(at("12:00"))).toEqual(["timur", "aziz"]);
    expect(slots.get(at("13:30"))).toEqual(["aziz"]);
    expect(slots.get(at("10:00"))).toEqual(["timur"]);
  });
});

describe("resolveStart", () => {
  it("explains why a start is not bookable", () => {
    const ctx = context({ bookings: [{ barberId: "timur", start: at("10:00"), end: at("11:00") }] });
    expect(() => resolveStart(ctx, at("10:00"))).toThrow(expect.objectContaining({ code: "SLOT_TAKEN" }));
    expect(() => resolveStart(ctx, at("18:00"))).toThrow(expect.objectContaining({ code: "OUTSIDE_WORKING_HOURS" }));
    expect(() => resolveStart(ctx, at("08:10", "2030-01-07"))).toThrow(expect.objectContaining({ code: "TOO_SOON" }));
    expect(() => resolveStart(ctx, at("10:00", "2030-03-01"))).toThrow(expect.objectContaining({ code: "TOO_FAR" }));
    expect(resolveStart(ctx, at("11:00"))).toEqual(["timur"]);
  });
});
