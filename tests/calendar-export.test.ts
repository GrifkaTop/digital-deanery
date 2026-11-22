import { describe, expect, it } from "vitest";
import { calendarFile } from "../src/server/academics/ical";
import type { Lesson } from "../src/contracts/academics";

const lesson: Lesson = {
  id: "11111111-1111-4111-8111-111111111111", title: "Длинное название, предмет; тест\\пример",
  originalStartsAt: "2026-11-16T05:30:00.000Z", startsAt: "2026-11-16T05:30:00.000Z", endsAt: "2026-11-16T07:05:00.000Z",
  room: "101", building: "Корпус", teacher: "Иванов И. И.", kind: "lecture", status: "planned", reason: null,
  version: 1, publishedAt: "2026-11-01T00:00:00.000Z",
};

describe("calendar export", () => {
  it("exports actual week in UTC, escapes text and folds UTF-8 lines", () => {
    const result = calendarFile([lesson, { ...lesson, id: "cancelled", status: "cancelled" }, { ...lesson, id: "moved-out", status: "moved", startsAt: "2026-11-23T05:30:00Z" }, { ...lesson, id: "moved-in", status: "moved", startsAt: "2026-11-22T20:30:00Z" }], "2026-11-16", "2026-11-23", new Date("2026-11-16T00:00:00Z"));
    const unfolded = result.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART:20261116T053000Z");
    expect(unfolded).toContain("SUMMARY:Длинное название\\, предмет\\; тест\\\\пример");
    expect(unfolded).not.toContain("UID:cancelled");
    expect(unfolded).not.toContain("UID:moved-out");
    expect(unfolded).toContain("UID:moved-in");
    expect(result.split("\r\n").every(line => Buffer.byteLength(line) <= 75)).toBe(true);
  });
  it("produces a valid empty calendar", () => {
    expect(calendarFile([], "2026-11-16", "2026-11-23", new Date())).toContain("END:VCALENDAR\r\n");
  });
  it("preserves the name published with the lesson revision", () => {
    const renamed = { ...lesson, teachers: [{ id: "22222222-2222-4222-8222-222222222222", fullName: "Новое имя" }] };
    const result = calendarFile([renamed], "2026-11-16", "2026-11-23", new Date()).replace(/\r\n /g, "");
    expect(result).toContain("Преподаватель: Иванов И. И.");
    expect(result).not.toContain("Новое имя");
  });
});
