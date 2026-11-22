import { lessonsFor, shiftTimetableDate, timetableDateKey, type TimetableLesson, type WorkTag } from "./academic-data";
import { currentSubjects, workHref } from "./study-current-data";

export type ScheduleWorkTag = "ДЗ" | "РК1";
export type WorkRoute =
  | { kind: "record"; subjectId: string; workId: string }
  | { kind: "lesson"; day: string; lessonId: string; tag: ScheduleWorkTag };

export function parseWorkRoute(hash: string): WorkRoute | null {
  const scheduled = /^work\/lesson\/(\d{4}-\d{2}-\d{2})\/([\w-]+)\/(homework|control)$/.exec(hash);
  if (scheduled) {
    return { kind: "lesson", day: scheduled[1], lessonId: scheduled[2], tag: scheduled[3] === "homework" ? "ДЗ" : "РК1" };
  }
  const record = /^work\/([\w-]+)\/([\w-]+)$/.exec(hash);
  return record ? { kind: "record", subjectId: record[1], workId: record[2] } : null;
}

export function scheduleWorkHref(lesson: TimetableLesson, day: Date, tag: ScheduleWorkTag) {
  const homework = tag === "ДЗ" ? lesson.homework : undefined;
  const dueOn = timetableDateKey(shiftTimetableDate(day, homework?.dueInDays ?? 0));
  const subject = currentSubjects.find(item => item.title === lesson.title);
  const record = subject?.works.find(work => work.dueOn === dueOn && (homework
    ? work.kind === "homework" && work.title === homework.title
    : work.kind === "control" && work.title.startsWith("РК1 ·")));
  if (subject && record) return workHref(subject.id, record.id);
  const kind = tag === "ДЗ" ? "homework" : "control";
  return `#work/lesson/${timetableDateKey(day)}/${lesson.id}/${kind}`;
}

export function hasScheduleWorkDetails(lesson: TimetableLesson, tag: WorkTag): tag is ScheduleWorkTag {
  return (tag === "ДЗ" && Boolean(lesson.homework)) || (tag === "РК1" && Boolean(lesson.review));
}

export function scheduleWorkCounts(lessons: readonly TimetableLesson[], day: Date) {
  const links = { "ДЗ": new Set<string>(), "РК1": new Set<string>() };
  for (const lesson of lessons) {
    for (const tag of lesson.workTags) {
      if (hasScheduleWorkDetails(lesson, tag)) links[tag].add(scheduleWorkHref(lesson, day, tag));
    }
  }
  return { homework: links["ДЗ"].size, review: links["РК1"].size };
}

export function lessonOnDate(day: string, predicate: (lesson: TimetableLesson) => boolean) {
  const date = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || timetableDateKey(date) !== day) return undefined;
  return lessonsFor(date).find(predicate);
}

export function scheduledHomeworkDeadline(day: string, days: number) {
  return timetableDateKey(shiftTimetableDate(new Date(`${day}T12:00:00`), days));
}
