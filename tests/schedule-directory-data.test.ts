import { describe, expect, it } from "vitest";
import { lessonsFor, shiftTimetableDate, timetableDemoNow, timetableSlots } from "@/components/prototype/academic-data";
import { demoScheduleGroups, lessonsForDemoGroup } from "@/components/prototype/schedule-directory-data";
import { lessonOnDate, scheduleWorkCounts } from "@/components/prototype/work-route";

const demoGroup = demoScheduleGroups[0];

describe("synthetic public group timetable", () => {
  it("lists only the separate public group and rejects unknown or own group ids", () => {
    expect(demoScheduleGroups.map(({ id, code }) => ({ id, code }))).toEqual([{ id: "is-32", code: "ИС-32" }]);
    expect(lessonsForDemoGroup("unknown", timetableDemoNow)).toEqual([]);
    expect(lessonsForDemoGroup("is-31", timetableDemoNow)).toEqual([]);
    expect(lessonsFor(timetableDemoNow).every(lesson => lesson.group === "ИС-31")).toBe(true);
  });

  it("shows a common lesson and the correct parity variant in slot order", () => {
    const denominator = lessonsForDemoGroup(demoGroup.id, timetableDemoNow);
    const numerator = lessonsForDemoGroup(demoGroup.id, shiftTimetableDate(timetableDemoNow, 7));
    expect(denominator.map(({ title, time }) => ({ title, time }))).toEqual([
      { title: "История России", time: "10:15" }, { title: "Правоведение", time: "13:50" },
    ]);
    expect(numerator.map(({ title, time }) => ({ title, time }))).toEqual([
      { title: "История России", time: "10:15" }, { title: "Экономика", time: "13:50" },
    ]);
  });

  it("reports a free day and a date outside the demo semester", () => {
    expect(lessonsForDemoGroup(demoGroup.id, shiftTimetableDate(timetableDemoNow, 1))).toEqual([]);
    expect(lessonsForDemoGroup(demoGroup.id, new Date(2027, 0, 5, 12))).toEqual([]);
  });

  it("uses independent ids and common time slots without overlapping teacher assignments", () => {
    for (let offset = -1; offset < 13; offset++) {
      const day = shiftTimetableDate(timetableDemoNow, offset);
      const own = lessonsFor(day);
      const publicDay = lessonsForDemoGroup(demoGroup.id, day);
      expect(new Set(publicDay.map(lesson => lesson.id)).size).toBe(publicDay.length);
      for (const lesson of publicDay) {
        expect(lesson.group).toBe(demoGroup.code);
        expect(timetableSlots).toContainEqual({ start: lesson.time, end: lesson.end });
        expect(own.some(item => item.id === lesson.id || (item.teacher === lesson.teacher && item.time === lesson.time))).toBe(false);
      }
    }
  });

  it("has no personal work metadata or links to personal records", () => {
    const publicDay = lessonsForDemoGroup(demoGroup.id, timetableDemoNow);
    expect(publicDay).toHaveLength(2);
    expect(publicDay.every(lesson => lesson.workTags.length === 0 && !lesson.homework && !lesson.review)).toBe(true);
    expect(scheduleWorkCounts(publicDay, timetableDemoNow)).toEqual({ homework: 0, review: 0 });
    expect(lessonOnDate("2026-11-17", lesson => publicDay.some(publicLesson => publicLesson.id === lesson.id))).toBeUndefined();
  });
});
