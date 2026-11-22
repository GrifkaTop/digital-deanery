import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFoldPreference, readSchedulePreference, writeFoldPreference, writeSchedulePreference } from "@/components/prototype/atlas-ui-preferences";
import { FoldSection } from "@/components/prototype/fold-section";
import { ScheduleGrid } from "@/components/prototype/schedule-grid";

const prefix = "deanery-atlas-ui:v1:";
const scheduleKey = `${prefix}schedule`;

describe("Atlas public UI preferences", () => {
  const values = new Map<string, string>();
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });

  beforeEach(() => {
    values.clear();
    vi.clearAllMocks();
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("round-trips the selected day and mode under the versioned key", () => {
    const date = new Date(2026, 10, 23, 12);
    const preference = { date, mode: "week" as const, other: "unrelated" };
    writeSchedulePreference(preference);
    expect(values.get(scheduleKey)).toBe('{"mode":"week","date":"2026-11-23"}');
    expect(readSchedulePreference()).toEqual({ date, mode: "week" });
  });

  it.each([
    "{",
    '{"mode":"month","date":"2026-11-23"}',
    '{"mode":"day","date":"2026-02-30"}',
    '{"mode":"day","date":"2026-11-22"}',
    '{"mode":"day","date":"2026-11-23","other":"unrelated"}',
  ])("rejects unsupported saved schedule data %s", value => {
    values.set(scheduleKey, value);
    expect(readSchedulePreference()).toBeNull();
  });

  it("keeps allowlisted fold preferences separate and omits unrelated keys", () => {
    const inlineCalendar = "hm-home-calendar-title";
    const fullCalendar = "hm-calendar-title";
    writeFoldPreference(inlineCalendar, false);
    writeFoldPreference(fullCalendar, true);
    writeFoldPreference("private-form", false);
    expect(readFoldPreference(inlineCalendar)).toBe(false);
    expect(readFoldPreference(fullCalendar)).toBe(true);
    expect(readFoldPreference("private-form")).toBeNull();
    expect(values.size).toBe(2);
    values.set(`${prefix}fold:${inlineCalendar}`, '"false"');
    expect(readFoldPreference(inlineCalendar)).toBeNull();
  });

  it("falls back safely when browser storage is blocked", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Storage blocked"); } });
    expect(readSchedulePreference()).toBeNull();
    expect(readFoldPreference("hm-news-title")).toBeNull();
    expect(() => writeSchedulePreference({ date: new Date(2026, 10, 23, 12), mode: "day" })).not.toThrow();
    expect(() => writeFoldPreference("hm-news-title", false)).not.toThrow();
  });

  it("renders deterministic initial markup before browser preference restoration", () => {
    values.set(scheduleKey, '{"mode":"week","date":"2026-11-23"}');
    values.set(`${prefix}fold:hm-news-title`, "false");
    const schedule = renderToStaticMarkup(createElement(ScheduleGrid, {}));
    const fold = renderToStaticMarkup(createElement(FoldSection, { title: "Новости", headingId: "hm-news-title", children: "Пример" }));
    expect(schedule).toContain('data-schedule-mode="day"');
    expect(schedule).toContain("12-я неделя");
    expect(fold).toContain('aria-expanded="true"');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
