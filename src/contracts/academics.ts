import { z } from "zod";
import { assignmentItem } from "./assignments";

export const lessonKinds = ["lecture", "seminar", "practice", "laboratory"] as const;
export const lessonStatuses = ["planned", "moved", "replaced", "cancelled"] as const;
export const assessments = ["exam", "credit", "graded_credit"] as const;
export const gradeKinds = ["current", "final", "credit"] as const;
export const gradeScales = ["five", "hundred"] as const;
export const gradeOutcomes = ["pass", "fail"] as const;
export const examKinds = ["exam", "credit", "retake", "consultation"] as const;

const date = z.iso.date().refine((value) => Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2199);
const timestamp = z.preprocess((value) => value instanceof Date ? value.toISOString() : value, z.iso.datetime());
const teacher = z.object({ id: z.uuid(), fullName: z.string() });
export const scheduleQuery = z.strictObject({
  date: date.optional(),
  view: z.enum(["day", "week"]).default("day"),
});
export const studyQuery = z.strictObject({
  semester: z.uuid().optional(),
  view: z.enum(["disciplines", "session", "cards"]).default("disciplines"),
  subject: z.uuid().optional(),
}).refine(fields => fields.view === "cards" || fields.subject === undefined);
export const todayQuery = z.strictObject({ block: z.enum(["lesson", "deadline", "study", "request"]) });

const revision = z.object({
  version: z.number().int().positive(),
  startsAt: timestamp,
  endsAt: timestamp,
  room: z.string(),
  teacher: z.string(),
  kind: z.enum(lessonKinds),
  status: z.enum(lessonStatuses),
  reason: z.string().nullable(),
  publishedAt: timestamp,
  building: z.string().nullable().optional(), format: z.enum(["in_person", "remote"]).optional(),
  teachers: teacher.array().optional(),
  assignments: z.array(z.object({ id: z.uuid(), title: z.string(), kind: z.string(), number: z.number().nullable() })).optional(),
});
export const atlasSharedScheduleGroup = {
  slug: "is-32",
  code: "ИС-32",
  id: "20000000-0000-4000-8000-990000000032",
} as const;

const lesson = revision.extend({
  id: z.uuid(), title: z.string(), originalStartsAt: timestamp,
  group: z.string().optional(),
  previousRoom: z.object({ room: z.string(), building: z.string().nullable() }).nullable().optional(),
});
export const scheduleResponse = z.object({
  today: date, date, start: date, end: date,
  academicWeek: z.object({ number: z.number().int().positive(), parity: z.enum(["numerator", "denominator"]) }).nullable().optional(),
  rules: z.array(z.object({
    id: z.uuid(), title: z.string(), weekday: z.number().int().min(1).max(7),
    startMinutes: z.number().int().min(0).max(1439), endMinutes: z.number().int().min(1).max(1440),
    recurrence: z.enum(["weekly", "numerator", "denominator"]),
  })).optional(),
  items: lesson.array(), nearest: lesson.nullable(), teacher: teacher.optional(), teacherDirectory: teacher.array().optional(),
});
export const lessonResponse = lesson.extend({ history: revision.array() });
export type Lesson = z.infer<typeof lesson>;

const semester = z.object({ id: z.uuid(), label: z.string(), isCurrent: z.boolean() });
const status = z.enum(["closed", "attention", "awaiting"]);
const discipline = z.object({
  id: z.uuid(), title: z.string(), assessment: z.enum(assessments), status,
  hasGrades: z.boolean(),
});
const exam = z.object({
  id: z.uuid(), planId: z.uuid(), title: z.string(), kind: z.enum(examKinds),
  startsAt: timestamp, room: z.string().nullable(), building: z.string().nullable().optional(),
  format: z.enum(["in_person", "remote"]).optional(),
  admission: z.object({ status: z.enum(["admitted", "pending", "action_required"]), reason: z.string().nullable() }).nullable().optional(),
  teachers: teacher.array().optional(),
});
const grade = z.object({
  id: z.uuid(), kind: z.enum(gradeKinds), label: z.string(), value: z.number().nullable(),
  scale: z.enum(gradeScales).nullable(), outcome: z.enum(gradeOutcomes).nullable(),
  publishedAt: timestamp,
});
const deadline = z.object({
  id: z.uuid(), planId: z.uuid(), assignmentId: z.uuid().nullable().optional(), title: z.string(), dueAt: timestamp,
  required: z.boolean(), state: z.enum(["upcoming", "overdue", "completed"]),
});
export const progress = z.object({ closed: z.number().int().nonnegative(), total: z.number().int().nonnegative() });
export const studyResponse = z.object({
  semesterId: z.uuid().nullable(), semesters: semester.array(), progress,
  items: discipline.array(), exams: exam.array(), action: deadline.nullable(),
});
export const disciplineResponse = discipline.extend({
  teachers: teacher.array().optional(),
  modules: z.array(z.object({ id: z.uuid(), title: z.string(), position: z.number().int().positive() })),
  attendance: z.array(z.object({ lessonId: z.uuid(), startsAt: timestamp, kind: z.enum(lessonKinds).optional(),
    status: z.enum(["present", "distinction", "absent"]).nullable() })),
  scores: z.object({ semesterScore: z.number().nullable(), semesterMax: z.number(), examScore: z.number().nullable(), examMax: z.number().nullable() }).nullable(),
  grades: grade.array(), exams: exam.array(), deadlines: deadline.array(), semesterId: z.uuid(),
});
export const studyCardsResponse = z.object({
  date,
  semesterLabel: z.string().nullable(),
  week: z.number().int().positive().nullable(),
  cards: disciplineResponse.array(),
  assignments: assignmentItem.array(),
  sports: z.object({
    attendance: z.number().int().nonnegative(), targetAttendance: z.number().int().nonnegative().nullable(),
    score: z.number().nullable(), minimumPoints: z.number().int().nonnegative().nullable(), result: z.string().nullable(),
  }).nullable(),
});
export const todayLesson = z.object({
  date, nearest: lesson.nullable(), change: lesson.nullable(),
  upcomingToday: lesson.nullable().optional(), hasLessonsToday: z.boolean().optional(),
});
export const todayDeadline = z.union([deadline, deadline.omit({ planId: true }).extend({ requestId: z.uuid() })]).nullable();
export const deadlinesResponse = z.object({
  today: date,
  items: deadline.omit({ planId: true, assignmentId: true, state: true }).extend({
    subjectTitle: z.string().nullable().optional(),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("assignment"), id: z.uuid(), workKind: z.string(), number: z.number().int().positive().nullable() }),
      z.object({ kind: z.literal("discipline"), id: z.uuid() }),
      z.object({ kind: z.literal("request"), id: z.uuid() }),
    ]),
  }).array(),
});
export type TodayDeadline = NonNullable<z.infer<typeof todayDeadline>>;
export const todayStudy = progress.extend({ semesterId: z.uuid().nullable(), statuses: status.array() });
export type Deadline = z.infer<typeof deadline>;
