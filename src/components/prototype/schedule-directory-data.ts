import { isTimetableDateInSemester, lessonsFor, shiftTimetableDate, subjects, teacherIds, teacherNames, timetableSlots, timetableWeek, type TimetableLesson } from "./academic-data";

export const demoScheduleGroups = [{ id: "is-32", code: "ИС-32", description: "Синтетическая учебная группа" }] as const;

type DemoGroupId = typeof demoScheduleGroups[number]["id"];
export type ScheduleScope = { scope: "own" } | { scope: "group" | "teacher"; id: string };
type DemoLesson = Pick<TimetableLesson, "kind" | "parity" | "room"> & { weekday: number; slot: number; subject: number };

const publicLessons: Record<DemoGroupId, readonly DemoLesson[]> = {
  "is-32": [
    { weekday: 1, slot: 2, subject: 0, kind: "Практика", parity: "both", room: "214 · корпус Б" },
    { weekday: 2, slot: 1, subject: 3, kind: "Лекция", parity: "both", room: "216 · корпус Б" },
    { weekday: 2, slot: 3, subject: 2, kind: "Семинар", parity: "numerator", room: "218 · корпус Б" },
    { weekday: 2, slot: 3, subject: 4, kind: "Семинар", parity: "denominator", room: "218 · корпус Б" },
    { weekday: 4, slot: 2, subject: 5, kind: "Лабораторная работа", parity: "both", room: "220 · корпус Б" },
  ],
};

export function lessonsForDemoGroup(groupId: string, date: Date): TimetableLesson[] {
  const group = demoScheduleGroups.find(item => item.id === groupId);
  if (!group || !isTimetableDateInSemester(date)) return [];

  const weekday = date.getDay();
  const { parity } = timetableWeek(date);
  return publicLessons[group.id]
    .filter(lesson => lesson.weekday === weekday && (lesson.parity === "both" || lesson.parity === parity))
    .map(lesson => {
      const { start, end } = timetableSlots[lesson.slot];
      return {
        id: `${group.id}-${weekday}-${lesson.slot}-${lesson.parity}`,
        title: subjects[lesson.subject], teacher: teacherNames[lesson.subject], kind: lesson.kind,
        time: start, end, room: lesson.room, group: group.code, parity: lesson.parity, workTags: [],
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function lessonsForScheduleScope(scope: ScheduleScope, date: Date): TimetableLesson[] {
  if (scope.scope === "group") return lessonsForDemoGroup(scope.id, date);
  if (scope.scope === "own") return lessonsFor(date);

  const teacher = teacherNames[teacherIds.indexOf(scope.id)];
  if (!teacher) return [];
  return [...lessonsFor(date), ...demoScheduleGroups.flatMap(group => lessonsForDemoGroup(group.id, date))]
    .filter(lesson => lesson.teacher === teacher)
    .sort((first, second) => first.time.localeCompare(second.time));
}

export function scheduleWeekDays(monday: Date) {
  return Array.from({ length: 6 }, (_, index) => shiftTimetableDate(monday, index));
}
