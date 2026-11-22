"use client";

import type { ReactNode } from "react";
import { studyCardsResponse } from "@/contracts/academics";
import { dateInMoscow } from "@/contracts/calendar";
import type { z } from "zod";
import { Resource } from "../resource";
import { StudyProgressPage, type StudySportsDisplay, type StudySubjectDisplay, type StudyWorkDisplay } from "./deadlines";

type Cards = z.infer<typeof studyCardsResponse>;
const workKinds: Record<string, StudyWorkDisplay["kind"]> = {
  dz: "homework", rk: "control", lr: "lab", homework: "homework", control: "control",
  lab: "lab", seminar: "seminar", coursework: "coursework", module: "module",
};
const assessmentNames = { exam: "Экзамен", credit: "Зачёт", graded_credit: "Дифференцированный зачёт" } as const;
const attendanceNames = { present: "attended", distinction: "distinction", absent: "absent" } as const;

export function studyDisplaySubjects(data: Cards): StudySubjectDisplay[] {
  return data.cards.map((card) => {
    const teacher = card.teachers?.[0];
    const deadlines = new Map(card.deadlines.filter((entry) => entry.assignmentId).map((entry) => [entry.assignmentId, entry]));
    const works = data.assignments.filter((item) => item.planId === card.id).map((item): StudyWorkDisplay => {
      const deadline = deadlines.get(item.id);
      const dueAt = deadline?.dueAt ?? item.dueAt;
      const stage = item.result?.stage === "completed" || item.result?.stage === "defended" ? item.result.stage : "assigned";
      return {
        id: item.id, title: item.title, kind: workKinds[item.kind] ?? "module", stage,
        dueOn: dueAt ? dateInMoscow(dueAt) : null, overdue: stage === "assigned" && deadline?.state === "overdue",
        submittedAt: item.result?.completedAt ?? null, gradedAt: item.result?.defendedAt ?? null,
        points: item.result?.score ?? null, maxPoints: item.maxScore, moduleId: item.moduleId,
      };
    });
    const final = card.grades.findLast((entry) => entry.kind === "final" || entry.kind === "credit");
    return {
      id: card.id, title: card.title,
      teacher: teacher?.fullName.trim().replace(/\s+/gu, " ") ?? "Преподаватель не указан", teacherId: teacher?.id ?? null,
      assessment: assessmentNames[card.assessment],
      grade: final?.value != null ? String(final.value) : final?.outcome === "pass" ? "Зачтено" : final?.outcome === "fail" ? "Не зачтено" : null,
      semesterPoints: card.scores?.semesterScore,
      semesterMaxPoints: card.scores?.semesterMax ?? null,
      examMaxPoints: card.scores?.examMax ?? 0, examPoints: card.scores?.examScore ?? null,
      works, modules: card.modules.map((module) => ({
        id: module.id, title: module.title, workIds: works.filter((work) => work.moduleId === module.id).map((work) => work.id),
      })),
      attendance: card.attendance.filter(item => item.kind !== "lecture").map((item) => ({
        id: item.lessonId, date: dateInMoscow(item.startsAt), status: item.status ? attendanceNames[item.status] : "planned",
      })),
      lectureAttendance: card.attendance.filter(item => item.kind === "lecture").map((item) => ({
        id: item.lessonId, date: dateInMoscow(item.startsAt), status: item.status ? attendanceNames[item.status] : "planned",
      })),
    };
  });
}

export function studySportDisplay(result: Cards["sports"]): StudySportsDisplay | null {
  if (!result) return null;

  const { score, attendance, targetAttendance, minimumPoints } = result;
  const passed = minimumPoints == null || score === null || targetAttendance === null ? null
    : attendance >= targetAttendance && score >= minimumPoints;
  return {
    score, attendance, targetAttendance, minimumPoints: minimumPoints ?? null, passed: passed === true,
    status: passed === null ? result.result ?? "Итог не опубликован"
      : passed ? "Условия зачёта выполнены" : "Условия зачёта не выполнены",
  };
}

export function LiveStudy({ id, semester, back, visible, onUnauthorized }: {
  id?: string; semester?: string; back?: ReactNode; visible: boolean; onUnauthorized: () => void;
}) {
  const params = new URLSearchParams({ view: "cards" });
  if (semester && zUuid.test(semester)) params.set("semester", semester);
  if (id) params.set("subject", id);

  return <Resource url={"/api/v1/study?" + params} schema={studyCardsResponse} onUnauthorized={onUnauthorized}>
    {data => <StudyProgressPage initialSubjectId={id} visible={visible} link={(_, item) => `#work/${item}`}
      data={{
        subjects: studyDisplaySubjects(data), today: data.date, semesterLabel: data.semesterLabel,
        week: data.week, sports: studySportDisplay(data.sports),
      }}>
      {back}
    </StudyProgressPage>}
  </Resource>;
}
const zUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
