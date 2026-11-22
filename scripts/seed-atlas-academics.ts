import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { atlasSharedScheduleGroup, type Lesson } from "../src/contracts/academics";
import { addDays } from "../src/contracts/calendar";
import { homeworkForSubject, lessonsFor, subjects, teacherNames, type TimetableLesson } from "../src/components/prototype/academic-data";
import { lessonsForDemoGroup } from "../src/components/prototype/schedule-directory-data";
import { currentSubjects, subjectEarnedPoints, type CurrentWork } from "../src/components/prototype/study-current-data";
import * as schema from "../src/server/db/schema";

type AcademicSeed = Pick<NodePgDatabase, "insert" | "select">;
const atlasStudentAccountId = "10000000-0000-4000-8000-000000000003";
const termStart = "2026-09-01";
const termEnd = "2026-12-31";
const roomChangeDate = "2026-11-17";
const at = (date: string, time: string) => new Date(date + "T" + time + ":00+03:00");
const publishedAt = at("2026-08-31", "08:00");
const kindNames: Record<string, Lesson["kind"]> = { "Лекция": "lecture", "Практика": "practice", "Семинар": "seminar", "Лабораторная работа": "laboratory" };
const assignmentKinds = { homework: "dz", control: "rk", lab: "lr", seminar: "seminar", coursework: "coursework", module: "rk" } as const;
const assessments: (typeof schema.assessment.enumValues)[number][] = ["graded_credit", "exam", "exam", "credit", "credit", "graded_credit"];
const academicId = (table: number, key: number) => "20000000-0000-4000-8000-" + String(table).padStart(2, "0") + String(key).padStart(10, "0");
const teacherId = (index: number) => academicId(9, 300 + index);
const disciplineId = (privateGroup: boolean, index: number) => academicId(2, (privateGroup ? 300 : 400) + index);
const workId = (subject: number, index: number) => academicId(8, 30_000 + subject * 100 + index);

export function atlasTimetableRows(privateGroup: boolean) {
  const result: { lesson: TimetableLesson; day: string; id: string; subject: number; roomChange: boolean }[] = [];
  for (let offset = 0; ; offset++) {
    const day = addDays(termStart, offset);
    if (day > termEnd) break;
    const civilDay = new Date(day + "T12:00:00");
    const lessons = privateGroup ? lessonsFor(civilDay) : lessonsForDemoGroup(atlasSharedScheduleGroup.slug, civilDay);
    for (const [index, lesson] of lessons.entries()) {
      result.push({
        lesson, day, id: academicId(7, (privateGroup ? 300_000 : 320_000) + offset * 10 + index),
        subject: subjects.indexOf(lesson.title), roomChange: privateGroup && day === roomChangeDate && !!lesson.previousRoom,
      });
    }
  }
  return result;
}

async function seedTimetable(tx: AcademicSeed, groupId: string, semesterId: string, privateGroup: boolean) {
  await tx.insert(schema.disciplines).values(subjects.map((title, index) => ({
    id: disciplineId(privateGroup, index), groupId, semesterId, code: String(index + 1), title, assessment: assessments[index],
  }))).onConflictDoNothing();
  await tx.insert(schema.disciplineTeachers).values(subjects.map((_, index) => ({
    disciplineId: disciplineId(privateGroup, index), teacherId: teacherId(index),
  }))).onConflictDoNothing();

  const timetable = atlasTimetableRows(privateGroup);
  await tx.insert(schema.lessons).values(timetable.map(({ id, subject, day, lesson }) => ({
    id, disciplineId: disciplineId(privateGroup, subject), originalStartsAt: at(day, lesson.time),
  }))).onConflictDoNothing();
  const revisions = timetable.flatMap(({ id, day, lesson, roomChange }) => {
    const [room, building] = lesson.room.split(" · ");
    const original = {
      lessonId: id, version: 1, startsAt: at(day, lesson.time), endsAt: at(day, lesson.end),
      room: roomChange && lesson.previousRoom ? lesson.previousRoom : room,
      building, teacherName: lesson.teacher, kind: kindNames[lesson.kind], status: "planned" as const, publishedAt,
    };
    return roomChange ? [original, {
      ...original, version: 2, room, status: "moved" as const, reason: "Изменилась аудитория",
      publishedAt: at(day, "09:15"),
    }] : [original];
  });
  await tx.insert(schema.lessonRevisions).values(revisions).onConflictDoNothing();
  await tx.insert(schema.lessonTeachers).values(revisions.map(revision => ({
    lessonId: revision.lessonId, version: revision.version, teacherId: teacherId(teacherNames.indexOf(revision.teacherName)),
  }))).onConflictDoNothing();
  return timetable;
}

function instructions(work: CurrentWork, subjectTitle: string) {
  const homework = work.kind === "homework" ? homeworkForSubject(subjectTitle) : undefined;
  return homework?.title === work.title
    ? { actions: homework.instructions.join("\n"), requirements: homework.deliverable }
    : { actions: "Подготовьте решение учебного задания и обоснуйте выводы.", requirements: "Представьте результат преподавателю." };
}

async function seedStudentWork(tx: AcademicSeed, studentId: string, timetable: ReturnType<typeof atlasTimetableRows>) {
  for (const [subjectIndex, subject] of currentSubjects.entries()) {
    const discipline = disciplineId(true, subjectIndex);
    const planItem = academicId(3, 300 + subjectIndex);
    await tx.insert(schema.studyPlanItems).values({ id: planItem, studentId, disciplineId: discipline }).onConflictDoNothing();
    const modules = new Map(subject.modules.map((module, index) => [module.id, academicId(10, 30_000 + subjectIndex * 100 + index)]));
    await tx.insert(schema.disciplineModules).values(subject.modules.map((module, index) => ({
      id: modules.get(module.id), disciplineId: discipline, title: module.title, position: index + 1,
    }))).onConflictDoNothing();
    const earned = subjectEarnedPoints(subject);
    await tx.insert(schema.studyScoreBreakdowns).values({
      planItemId: planItem, semesterScore: earned === null ? null : String(earned),
      semesterMax: String(subject.semesterMaxPoints), examScore: subject.examPoints === null ? null : String(subject.examPoints),
      examMax: subject.examMaxPoints > 0 ? String(subject.examMaxPoints) : null, publishedAt,
    }).onConflictDoNothing();

    if (earned !== null) await tx.insert(schema.grades).values({
      id: academicId(4, 33_000 + subjectIndex), planItemId: planItem, kind: "current",
      label: "Баллы за семестр", value: String(earned), scale: "hundred", publishedAt,
    }).onConflictDoNothing();

    for (const attendance of subject.attendance) {
      if (attendance.status === "planned") continue;
      const matching = timetable.find(slot => slot.subject === subjectIndex && slot.day === attendance.date);
      if (matching) await tx.insert(schema.lessonAttendance).values({
        studentId, lessonId: matching.id, status: attendance.status === "attended" ? "present" : attendance.status,
        publishedAt: at(attendance.date, "20:00"),
      }).onConflictDoNothing();
    }

    for (const [index, work] of subject.works.entries()) {
      const assignmentId = workId(subjectIndex, index);
      const number = Number(/^(?:РК|ЛР)\s*(\d+)/u.exec(work.title)?.[1]);
      await tx.insert(schema.assignments).values({
        id: assignmentId, disciplineId: discipline, teacherId: teacherId(subjectIndex), studentId,
        kind: assignmentKinds[work.kind], number: Number.isInteger(number) ? number : null,
        title: work.title, description: work.title, ...instructions(work, subject.title),
        issuedAt: publishedAt, publishedAt, maxScore: String(work.maxPoints),
        moduleId: work.moduleId ? modules.get(work.moduleId) ?? null : null,
      }).onConflictDoNothing();
      if (work.dueOn && work.kind !== "seminar") {
        await tx.insert(schema.deadlines).values({
          id: academicId(6, 30_000 + subjectIndex * 100 + index), assignmentId, studentId,
          title: work.title, dueAt: at(work.dueOn, "18:00"), required: true, publishedAt,
        }).onConflictDoNothing();
      }
      if (work.submittedAt && (work.stage === "completed" || work.stage === "defended")) {
        const completedAt = new Date(work.submittedAt);
        const defendedAt = work.stage === "defended" ? new Date(work.gradedAt ?? work.submittedAt) : null;
        await tx.insert(schema.studentAssignmentResults).values({
          studentId, assignmentId, stage: work.stage, score: work.points === null ? null : String(work.points),
          completedAt, defendedAt, publishedAt: defendedAt ?? completedAt,
        }).onConflictDoNothing();
      }
      if (!work.dueOn || !["homework", "control", "lab"].includes(work.kind)) continue;
      const relatedDay = work.kind === "homework" ? addDays(work.dueOn, -3) : work.dueOn;
      const matching = timetable.find(slot => slot.subject === subjectIndex && slot.day === relatedDay &&
        slot.lesson.workTags.includes(work.kind === "control" ? "РК1" : work.kind === "lab" ? "ЛР" : "ДЗ"));
      if (matching) await tx.insert(schema.lessonAssignments).values({ lessonId: matching.id, assignmentId }).onConflictDoNothing();
    }
  }
}

async function seedAtlasSession(tx: AcademicSeed, studentId: string) {
  const publishedAt = at("2026-11-16", "09:00");
  const january = (day: number, time: string) => at("2027-01-" + String(day).padStart(2, "0"), time);
  const exams = subjects.map((_, index) => ({
    id: academicId(5, 300 + index), disciplineId: disciplineId(true, index),
    kind: assessments[index] === "exam" ? "exam" as const : "credit" as const,
    startsAt: january(11 + index * 3, "09:00"), room: String(210 + index), building: "корпус А",
    publishedAt, teacherId: teacherId(index),
  }));
  const consultations = exams.flatMap((exam, index) => index % 2 === 0 ? [{
    ...exam, id: academicId(5, 310 + index), kind: "consultation" as const,
    startsAt: january(10 + index * 3, "14:00"),
  }] : []);
  const events = [...exams, ...consultations];
  await tx.insert(schema.examEvents).values(events.map(({ teacherId: _teacherId, ...event }) => event)).onConflictDoNothing();
  await tx.insert(schema.examTeachers).values(events.map(event => ({ examId: event.id, teacherId: event.teacherId }))).onConflictDoNothing();
  await tx.insert(schema.examAdmissions).values(exams.map((exam, index) => ({
    examId: exam.id, studentId, status: index < 2 ? "admitted" : index === 3 ? "action_required" : "pending",
    reason: index === 3 ? "Сдать контрольную" : null,
  }))).onConflictDoNothing();
}

export async function seedAtlasAcademicFixtures(tx: AcademicSeed, semesterId: string) {
  await tx.insert(schema.groups).values({
    id: atlasSharedScheduleGroup.id, code: atlasSharedScheduleGroup.code, faculty: "Факультет учебного моделирования",
    program: "Прикладные информационные системы", course: 3,
  }).onConflictDoNothing();
  await tx.insert(schema.teachers).values(teacherNames.map((fullName, index) => ({ id: teacherId(index), fullName }))).onConflictDoNothing();
  await seedTimetable(tx, atlasSharedScheduleGroup.id, semesterId, false);

  const [student] = await tx.select({ id: schema.students.id, groupId: schema.students.groupId })
    .from(schema.students).innerJoin(schema.groups, eq(schema.groups.id, schema.students.groupId))
    .where(and(eq(schema.students.accountId, atlasStudentAccountId), eq(schema.students.studentNumber, "DEMO-3"), eq(schema.groups.code, "ИС-31")));
  if (!student) return;
  const timetable = await seedTimetable(tx, student.groupId, semesterId, true);
  await seedStudentWork(tx, student.id, timetable);
  await seedAtlasSession(tx, student.id);
}
