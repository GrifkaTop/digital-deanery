import { describe, expect, it } from "vitest";
import {
  calendarMonthWeeks,
  calendarWeekEntries,
  calendarWeekPreview,
  eventOccursOn,
  shiftCalendarMonth,
} from "@/components/prototype/home-calendar-model";
import { campusEvents } from "@/components/prototype/home-content";

describe("event calendar month navigation", () => {
  it.each([
    { month: "2027-02", days: 28, rows: 4, before: 0, after: 0 },
    { month: "2028-02", days: 29, rows: 5, before: 1, after: 5 },
    { month: "2027-04", days: 30, rows: 5, before: 3, after: 2 },
    { month: "2027-05", days: 31, rows: 6, before: 5, after: 6 },
  ])("places $month in $rows Monday-to-Sunday rows", ({ month, days, rows, before, after }) => {
    const weeks = calendarMonthWeeks(`${month}-17`);
    const dates = Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);

    expect(weeks).toHaveLength(rows);
    expect(weeks.every(week => week.length === 7)).toBe(true);
    expect(weeks.flat()).toEqual([
      ...Array<null>(before).fill(null),
      ...dates,
      ...Array<null>(after).fill(null),
    ]);
  });

  it.each([
    ["2026-12-17", 1, "2027-01-17"],
    ["2027-01-17", -1, "2026-12-17"],
    ["2027-01-31", 1, "2027-02-28"],
    ["2028-03-31", -1, "2028-02-29"],
    ["2027-05-31", -1, "2027-04-30"],
  ])("moves %s by %i month and keeps a valid date", (date, step, expected) => {
    expect(shiftCalendarMonth(date, step)).toBe(expected);
  });
});

describe("event calendar bands", () => {
  it("continues the hackathon across weeks and includes its last day in December", () => {
    const hackathon = campusEvents.find(event => event.id === "campus-hackathon");
    if (!hackathon) throw new Error("Missing campus hackathon fixture");

    const segmentsFor = (month: string) => calendarMonthWeeks(month).flatMap(week =>
      calendarWeekEntries(week, [hackathon]).map(({ first, last, span }) => ({
        start: week[first], end: week[last], span,
      })),
    );
    expect(segmentsFor("2026-11-17")).toEqual([
      { start: "2026-11-28", end: "2026-11-29", span: 2 },
      { start: "2026-11-30", end: "2026-11-30", span: 1 },
    ]);
    expect(segmentsFor("2026-12-17")).toEqual([
      { start: "2026-12-01", end: "2026-12-01", span: 1 },
    ]);
    expect(eventOccursOn(hackathon, "2026-11-27")).toBe(false);
    expect(eventOccursOn(hackathon, "2026-12-01")).toBe(true);
    expect(eventOccursOn(hackathon, "2026-12-02")).toBe(false);
  });

  it("puts overlapping events in separate lanes and reuses space for later events", () => {
    const ids = ["project-week", "project-week-opening", "open-lab"];
    const events = campusEvents.filter(event => ids.includes(event.id));
    const week = calendarMonthWeeks("2026-11-17").find(row => row[0] === "2026-11-23");
    if (!week) throw new Error("Missing project week in November grid");

    const bands = calendarWeekEntries(week, events).map(({ event, first, span, lane }) => ({ id: event.id, first, span, lane }));
    expect(bands).toEqual([
      { id: "project-week", first: 0, span: 5, lane: 0 },
      { id: "project-week-opening", first: 0, span: 1, lane: 1 },
      { id: "open-lab", first: 2, span: 1, lane: 1 },
    ]);
  });

  it("counts hidden bands on each date they span while keeping four visible lanes", () => {
    const template = campusEvents[0];
    const week = calendarMonthWeeks("2026-11-17").find(row => row[0] === "2026-11-23");
    if (!week) throw new Error("Missing project week in November grid");

    const firstFour = Array.from({ length: 4 }, (_, index) => ({
      ...template, id: `visible-${index}`, date: "2026-11-24", endDate: "2026-11-25",
    }));
    const hiddenSpan = { ...template, id: "hidden-span", date: "2026-11-24", endDate: "2026-11-26" };
    const hiddenWednesday = { ...template, id: "hidden-wednesday", date: "2026-11-25", endDate: undefined };
    const visibleFriday = { ...template, id: "visible-friday", date: "2026-11-27", endDate: undefined };
    const entries = calendarWeekEntries(week, [...firstFour, hiddenSpan, hiddenWednesday, visibleFriday]);
    const { visible, overflow } = calendarWeekPreview(entries);

    expect(visible.map(({ event }) => event.id)).toEqual([...firstFour, visibleFriday].map(event => event.id));
    expect(overflow).toEqual([0, 1, 2, 1, 0, 0, 0]);
  });

  it("counts each hidden event only once per date", () => {
    const event = campusEvents[0];
    const band = { event, first: 3, last: 4, span: 2, lane: 4 };
    const repeatedBand = { ...band, event: { ...event }, lane: 5 };
    const other = { ...band, event: { ...event, id: "another-event" }, first: 4, span: 1, lane: 6 };

    expect(calendarWeekPreview([band, repeatedBand, other])).toEqual({
      visible: [], overflow: [0, 0, 0, 1, 2, 0, 0],
    });
  });
});
