import { describe, expect, it } from "vitest";
import { atlasTimetableRows } from "../scripts/seed-atlas-academics";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lessonsFor, timetableDemoNow, timetableLessonState, timetableSlots, todayTimetablePreview } from "../src/components/prototype/academic-data";
import { NextLessonCard } from "../src/components/prototype/home-schedule";
import { ScheduleGrid, type LiveTimetable, type ScheduleEntry } from "../src/components/prototype/schedule-grid";
import { ScheduleWeek } from "../src/components/prototype/schedule-week";
import { lessonsForScheduleScope } from "../src/components/prototype/schedule-directory-data";
import { scheduleWorkCounts } from "../src/components/prototype/work-route";

describe("fixed timetable intervals", () => {
  it("uses seven shared time slots for daytime and evening lessons", () => {
    expect(timetableSlots).toEqual([
      { start: "08:30", end: "10:05" },
      { start: "10:15", end: "11:50" },
      { start: "12:00", end: "13:35" },
      { start: "13:50", end: "15:25" },
      { start: "15:40", end: "17:15" },
      { start: "17:25", end: "19:00" },
      { start: "19:10", end: "20:45" },
    ]);
    const slotsFor = (day: number) => lessonsFor(new Date(2026, 10, day, 12)).map(lesson => ({ start: lesson.time, end: lesson.end }));
    expect(slotsFor(23)).toEqual([...timetableSlots.slice(0, 3), ...timetableSlots.slice(5)]);
    expect(slotsFor(21)).toEqual(timetableSlots.slice(0, 2));
    expect(slotsFor(20)).toEqual(timetableSlots.slice(1, 5));
    expect(slotsFor(27)).toEqual(timetableSlots.slice(1, 5));
  });

  it("preserves the Friday parity variants and the Tuesday homework and review", () => {
    expect(lessonsFor(new Date(2026, 10, 20, 12))[2]).toMatchObject({ id: "5-2-denominator", title: "Анализ данных" });
    expect(lessonsFor(new Date(2026, 10, 27, 12))[2]).toMatchObject({ id: "5-2-numerator", title: "Прикладная информатика" });
    expect(lessonsFor(timetableDemoNow)[1]).toMatchObject({
      id: "2-1-both", title: "Анализ данных", time: "10:15", end: "11:50", room: "305 · корпус А", workTags: ["РК1", "ДЗ"],
    });
  });
});

describe("the current demo lesson", () => {
  const day = new Date(2026, 10, 17, 12);
  const current = lessonsFor(day)[1];

  it("includes start, excludes end and requires the same local date", () => {
    expect(timetableLessonState(day, current, new Date(2026, 10, 17, 10, 14, 59))).toBe("upcoming");
    expect(timetableLessonState(day, current, new Date(2026, 10, 17, 10, 15))).toBe("current");
    expect(timetableLessonState(day, current, new Date(2026, 10, 17, 11, 49, 59))).toBe("current");
    expect(timetableLessonState(day, current, new Date(2026, 10, 17, 11, 50))).toBe("past");
    expect(timetableLessonState(day, current, new Date(2026, 10, 16, 10, 45))).toBe("upcoming");
    expect(timetableLessonState(day, current, new Date(2026, 10, 18, 10, 45))).toBe("past");
  });

  it("marks only the current lesson and gives it an accessible label in both own views", () => {
    const agenda = renderToStaticMarkup(createElement(ScheduleGrid, {}));
    const grid = renderToStaticMarkup(createElement(ScheduleWeek, {
      dates: [day, new Date(2026, 10, 18, 12)], parity: "denominator", lessonsForDay: lessonsFor, onOpenDay: () => {},
    }));
    expect(agenda.match(/data-current="true"/g)).toHaveLength(1);
    expect(agenda).toContain('aria-label="Сейчас: Анализ данных"');
    expect(agenda).not.toContain(">Сейчас<");
    expect(grid.match(/data-current="true"/g)).toHaveLength(1);
    expect(grid).toContain('data-kind="practice" data-current="true" aria-label="Сейчас: Анализ данных, Практика, 10:15–11:50');
    expect(grid).not.toContain(">Сейчас<");
  });

  it("uses each scope's lesson and omits the marker from an unrelated teacher's schedule", () => {
    const group = { scope: "group", id: "is-32" } as const;
    const teacher = { scope: "teacher", id: "ozersky" } as const;
    const groupAgenda = renderToStaticMarkup(createElement(ScheduleGrid, { scope: group }));
    const groupWeek = renderToStaticMarkup(createElement(ScheduleWeek, {
      dates: [day], parity: "denominator", lessonsForDay: item => lessonsForScheduleScope(group, item), onOpenDay: () => {},
    }));
    expect(groupAgenda).toContain('aria-label="Сейчас: История России"');
    expect(groupWeek).toContain('data-kind="lecture" data-current="true" aria-label="Сейчас: История России, Лекция, 10:15–11:50');
    expect(renderToStaticMarkup(createElement(ScheduleGrid, { scope: teacher }))).not.toContain('data-current="true"');
  });
});

describe("weekday assignment counters", () => {
  const lessons = lessonsFor(timetableDemoNow);
  const dataAnalysis = lessons[1];

  it("counts each openable work once even when several lessons link to it", () => {
    const duplicate = { ...dataAnalysis, id: "repeated-lesson" };
    expect(scheduleWorkCounts([dataAnalysis, duplicate], timetableDemoNow)).toEqual({ homework: 1, review: 1 });
  });

  it("ignores tags without work details and works belonging to another teacher", () => {
    expect(scheduleWorkCounts([{ ...dataAnalysis, homework: undefined, review: undefined }], timetableDemoNow))
      .toEqual({ homework: 0, review: 0 });
    const otherTeacherLessons = lessons.filter(lesson => lesson.teacher === lessons[0].teacher);
    expect(scheduleWorkCounts(otherTeacherLessons, timetableDemoNow)).toEqual({ homework: 0, review: 0 });
  });

  it("shows both counts and their description in Day, and only weekday names in Week", () => {
    const day = renderToStaticMarkup(createElement(ScheduleGrid, {}));
    const week = renderToStaticMarkup(createElement(ScheduleWeek, {
      dates: [timetableDemoNow], parity: "denominator", lessonsForDay: lessonsFor, onOpenDay: () => {},
    }));
    expect(day).toContain('data-work="ДЗ" data-academic-category="homework">1 ДЗ</span>');
    expect(day).toContain('data-work="РК" data-academic-category="control">1 РК</span>');
    expect(day).toContain('class="sg-work-trigger" data-work="ДЗ" data-academic-category="homework"');
    expect(day).toContain('class="sg-work-trigger" data-work="РК1" data-academic-category="control"');
    expect(day).toContain("Домашние задания: 1. Рубежные контроли: 1");
    expect(day).toContain("aria-describedby=");
    expect(day).not.toMatch(/>0 (?:ДЗ|РК)</);
    expect(day).toContain('class="sg-date-control" aria-label="вторник, 17 ноября"');
    expect(day).toContain('<span class="sg-weekday-caption">вт</span>');
    expect(week).toContain('class="sg-date-control" aria-label="вторник"><strong class="sg-weekday-caption">вт</strong></button>');
    expect(week).not.toContain("sg-date-work");
    expect(week).not.toContain("aria-describedby=");
  });

  it("uses the same label categories in Day and Week without applying work badge categories to the lesson type", () => {
    const day = renderToStaticMarkup(createElement(ScheduleGrid, {}));
    const week = renderToStaticMarkup(createElement(ScheduleWeek, {
      dates: [timetableDemoNow], parity: "denominator", lessonsForDay: lessonsFor, onOpenDay: () => {},
    }));
    for (const [kind, name] of [["lecture", "Лекция"], ["practice", "Практика"], ["seminar", "Семинар"]]) {
      expect(day).toContain(`class="sg-lesson-kind" data-kind="${kind}">${name}</span>`);
      expect(week).toContain(`<li class="sg-lesson-kind" data-kind="${kind}"><span aria-hidden="true"></span>${name}</li>`);
      expect(week).toContain(`class="sw-lesson" data-kind="${kind}"`);
    }
    expect(week).toContain('<li class="sg-lesson-kind" data-kind="lab">');
  });
});

describe("live Atlas schedule presentation", () => {
  const teacherId = "20000000-0000-4000-8000-090000000302";
  const lessonId = "20000000-0000-4000-8000-070000300772";
  const lesson: ScheduleEntry = {
    ...lessonsFor(timetableDemoNow)[2],
    statusLabel: "Перенесено", lessonHref: "#lesson/" + lessonId, teacherHref: "#teacher/" + teacherId,
    serverAssignments: [
      { id: "20000000-0000-4000-8000-080000000300", kind: "dz", label: "ДЗ", title: "Упражнение" },
      { id: "20000000-0000-4000-8000-080000000301", kind: "rk", label: "РК1", title: "Тестирование" },
    ],
  };
  const sameDate = (date: Date) => date.toDateString() === timetableDemoNow.toDateString();
  const live: LiveTimetable = {
    initialDate: timetableDemoNow, today: timetableDemoNow, initialMode: "day", explicitDate: true,
    changedDate: () => {}, lessons: date => sameDate(date) ? [lesson] : [],
    hasDay: () => true, state: () => "upcoming", week: { number: 12, parity: "denominator" },
    weekStart: "2026-11-16", slots: timetableSlots, calendarHref: "/api/v1/lessons/calendar?date=2026-11-17",
    teachers: [],
  };

  it("keeps the Day strip, compact lesson title, works and transfer together", () => {
    const html = renderToStaticMarkup(createElement(ScheduleGrid, { live }));
    expect(html).toContain("<h1>Расписание</h1>");
    expect(html).toContain('class="sg-week-indicator" aria-live="polite">12-я неделя · <strong class="sg-week-type">знаменатель');
    expect(html).toContain('aria-pressed="true" aria-current="date"');
    expect(html).toContain('<h3><a class="sg-lesson-title-link" href="#lesson/' + lessonId + '">Экономика</a></h3>');
    expect(html).toContain('href="#teacher/' + teacherId + '">Озёрский Лев Михайлович');
    expect(html.match(/class="sg-work-trigger"/gu)).toHaveLength(2);
    expect(html).toContain('href="#work/20000000-0000-4000-8000-080000000301"');
    expect(html).toContain("112 → 412 · корпус А");
    expect(html).not.toContain('class="sg-published-status"');
    expect(html).toContain(">Семинар</span>");
  });

  it("preserves the teacher group's cell and exports the active authoritative week", () => {
    const calendarHref = "/api/v1/lessons/calendar?date=2026-11-17&teacher=" + teacherId;
    const html = renderToStaticMarkup(createElement(ScheduleGrid, {
      scope: { scope: "teacher", id: teacherId }, live: { ...live, initialMode: "week", calendarHref },
    }));
    expect(html).toContain('href="' + calendarHref.replace("&", "&amp;") + '" download=""');
    expect(html).toContain('<span class="sw-room">ИС-31</span>');
    expect(html).not.toContain('class="sg-week-indicator"');
    expect(html).not.toContain('class="sg-date-work"');
  });
});

describe("canonical synthetic timetable seed", () => {
  it("keeps attendance dates, slots and resource ownership consistent across both weeks", () => {
    const own = atlasTimetableRows(true);
    const shared = atlasTimetableRows(false);
    const rows = [...own, ...shared];
    const times = timetableSlots.map(slot => slot.start + "–" + slot.end);
    expect(rows.every(({ lesson }) => times.includes(lesson.time + "–" + lesson.end))).toBe(true);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
    expect(new Set(rows.map(({ day, lesson }) => [day, lesson.time, lesson.teacher].join("|"))).size).toBe(rows.length);
    expect(new Set(rows.map(({ day, lesson }) => [day, lesson.time, lesson.room].join("|"))).size).toBe(rows.length);
    expect(new Set(own.map(({ lesson }) => lesson.group))).toEqual(new Set(["ИС-31"]));
    expect(new Set(shared.map(({ lesson }) => lesson.group))).toEqual(new Set(["ИС-32"]));
    expect(own.find(({ day, lesson }) => day === "2026-11-20" && lesson.time === "13:50")?.lesson.title).toBe("Анализ данных");
    expect(own.find(({ day, lesson }) => day === "2026-11-27" && lesson.time === "13:50")?.lesson.title).toBe("Прикладная информатика");
  });

  it("keeps the published transfer on the original date and period", () => {
    const moved = atlasTimetableRows(true).filter(({ roomChange }) => roomChange);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({
      day: "2026-11-17", lesson: { title: "Экономика", teacher: "Озёрский Лев Михайлович", time: "12:00", end: "13:35",
        previousRoom: "112", room: "412 · корпус А" },
    });
  });
});

describe("today's schedule preview", () => {
  it("uses the start and end of the next lesson today", () => {
    expect(todayTimetablePreview(timetableDemoNow).nextLesson).toMatchObject({ title: "Экономика", time: "12:00", end: "13:35" });
  });

  it("uses the same before and after rooms in the home preview and daily timetable", () => {
    const { nextLesson } = todayTimetablePreview(timetableDemoNow);
    expect(nextLesson).toMatchObject({ previousRoom: "112", room: "412 · корпус А" });
    if (!nextLesson) throw new Error("Expected synthetic timetable lesson");
    const startsAt = "2026-11-17T09:00:00.000Z";
    const endsAt = "2026-11-17T10:35:00.000Z";
    const home = renderToStaticMarkup(createElement(NextLessonCard, {
      date: "2026-11-17", change: null,
      nearest: { id: "10000000-0000-4000-8000-000000000009", title: nextLesson.title, teacher: nextLesson.teacher,
        room: "412", building: "корпус А", previousRoom: { room: "112", building: "корпус А" }, status: "moved", kind: "lecture", version: 2,
        reason: "Перенос из аудитории " + nextLesson.previousRoom, startsAt, endsAt, originalStartsAt: startsAt,
        publishedAt: "2026-11-17T06:00:00.000Z" },
    }));
    const day = renderToStaticMarkup(createElement(ScheduleGrid, {}));
    expect(home).toContain(">112 → 412 · корпус А</li>");
    expect(home).toContain('href="#lesson/10000000-0000-4000-8000-000000000009"');
    expect(home).toContain(`Перенос из аудитории ${nextLesson?.previousRoom}`);
    expect(day).toContain(`${nextLesson?.previousRoom} → ${nextLesson?.room}`);
  });

  it("reports a day without classes even when there are classes tomorrow", () => {
    expect(lessonsFor(new Date(2026, 10, 23, 12))).not.toHaveLength(0);
    expect(todayTimetablePreview(new Date(2026, 10, 22, 12))).toEqual({ hasLessons: false, nextLesson: undefined });
  });

  it("distinguishes a day without classes from a day whose classes have ended", () => {
    expect(todayTimetablePreview(new Date(2026, 10, 17, 21))).toEqual({ hasLessons: true, nextLesson: undefined });
  });
});
