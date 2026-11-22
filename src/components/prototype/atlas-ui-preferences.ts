import { timetableDateKey } from "./academic-data";

export type ScheduleMode = "day" | "week";
type SchedulePreference = { mode: ScheduleMode; date: Date };

const preferencePrefix = "deanery-atlas-ui:v1:";
const scheduleKey = `${preferencePrefix}schedule`;
const foldIds = new Set([
  "hm-events-title", "hm-news-title", "hm-home-calendar-title", "hm-calendar-title",
  "deadline-overdue-title", "deadline-today-title", "deadline-later-title",
  "ss-norms-title", "ss-passport-title", "ss-progress-title", "ss-reservations-title", "ss-booking-title",
]);

function readPreference(key: string): unknown {
  try { return JSON.parse(window.localStorage.getItem(key) ?? "null"); } catch { return null; }
}

function writePreference(key: string, value: boolean | { mode: ScheduleMode; date: string }) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Preferences are optional. */ }
}

export function readSchedulePreference(): SchedulePreference | null {
  const value = readPreference(scheduleKey);
  if (!value || typeof value !== "object" || !("date" in value) || !("mode" in value) || Object.keys(value).length !== 2) return null;
  const { date, mode } = value;
  if ((mode !== "day" && mode !== "week") || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const day = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(day.getTime()) || timetableDateKey(day) !== date || day.getDay() === 0) return null;
  return { date: day, mode };
}

export function writeSchedulePreference({ mode, date }: SchedulePreference) {
  writePreference(scheduleKey, { mode, date: timetableDateKey(date) });
}

export function readFoldPreference(id?: string): boolean | null {
  if (!id || !foldIds.has(id)) return null;
  const value = readPreference(`${preferencePrefix}fold:${id}`);
  return typeof value === "boolean" ? value : null;
}

export function writeFoldPreference(id: string | undefined, expanded: boolean) {
  if (id && foldIds.has(id)) writePreference(`${preferencePrefix}fold:${id}`, expanded);
}
