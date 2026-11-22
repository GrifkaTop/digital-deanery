import { bulletinDate, homeDateKey, type CampusEvent } from "./home-content";

const daysPerWeek = 7;
export const calendarVisibleLanes = 4;

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function calendarMonthWeeks(selected: string): (string | null)[][] {
  const first = bulletinDate(`${selected.slice(0, 7)}-01`);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const count = daysInMonth(year, month);
  const firstColumn = (first.getUTCDay() + daysPerWeek - 1) % daysPerWeek;
  const weeks: (string | null)[][] = [];
  for (let start = 1 - firstColumn; start <= count; start += daysPerWeek) {
    weeks.push(Array.from({ length: daysPerWeek }, (_, column) => {
      const day = start + column;
      return day >= 1 && day <= count ? homeDateKey(year, month, day) : null;
    }));
  }
  return weeks;
}

export function shiftCalendarMonth(selected: string, step: number) {
  const date = bulletinDate(selected);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + step);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return homeDateKey(year, month, Math.min(day, daysInMonth(year, month)));
}

export const eventEndDate = (event: CampusEvent) => event.endDate ?? event.date;

export function eventOccursOn(event: CampusEvent, date: string) {
  return event.date <= date && date <= eventEndDate(event);
}

export function calendarWeekEntries(days: readonly (string | null)[], events: readonly CampusEvent[]) {
  const occupied: number[] = [];
  return events.flatMap(event => {
    const includes = (day: string | null) => day !== null && eventOccursOn(event, day);
    const first = days.findIndex(includes);
    if (first === -1) return [];
    const last = days.findLastIndex(includes);
    const span = last - first + 1;
    const columns = ((1 << span) - 1) << first;
    let lane = occupied.findIndex(mask => (mask & columns) === 0);
    if (lane === -1) lane = occupied.length;
    occupied[lane] = (occupied[lane] ?? 0) | columns;
    return [{ event, first, last, span, lane }];
  });
}

export function calendarWeekPreview(entries: ReturnType<typeof calendarWeekEntries>, laneLimit = calendarVisibleLanes) {
  const visible: typeof entries = [];
  const hidden = Array.from({ length: daysPerWeek }, () => new Set<string>());
  for (const entry of entries) {
    if (entry.lane < laneLimit) {
      visible.push(entry);
    } else {
      for (let column = entry.first; column <= entry.last; column++) hidden[column].add(entry.event.id);
    }
  }
  return { visible, overflow: hidden.map(ids => ids.size) };
}
