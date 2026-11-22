"use client";

import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { studyQuery, studyResponse } from "@/contracts/academics";
import { dateInMoscow } from "@/contracts/calendar";
import { Resource } from "../resource";
import { SessionCalendar, type SessionEvent } from "./session-calendar";
import "./academic.css";

const moscowTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const names = { exam: "Экзамен", credit: "Зачёт", consultation: "Консультация", retake: "Экзамен" } as const;

export function AtlasSessionCalendar({ semesterId, onUnauthorized, back }: {
  semesterId?: string; onUnauthorized: () => void; back: ReactNode;
}) {
  const semester = studyQuery.shape.semester.safeParse(semesterId).data;
  const query = new URLSearchParams({ view: "session" });
  if (semester) query.set("semester", semester);
  return <Resource url={"/api/v1/study?" + query} schema={studyResponse} onUnauthorized={onUnauthorized}>
    {data => {
      const first = data.exams.find(exam => exam.kind !== "consultation") ?? data.exams[0];
      const start = first ? dateInMoscow(first.startsAt) : "2027-01-11";
      const items: SessionEvent[] = data.exams.map(exam => {
        const date = dateInMoscow(exam.startsAt);
        const teacher = exam.teachers?.[0];
        const status = exam.admission?.status;
        return {
          id: exam.id, date: date.slice(0, 7), day: Number(date.slice(8)), subject: exam.title, kind: names[exam.kind],
          teacher: teacher?.fullName ?? "", teacherHref: teacher && "#teacher/" + teacher.id,
          time: moscowTime.format(new Date(exam.startsAt)), room: [exam.room, exam.building].filter(Boolean).join(" · ") || "Аудитория не указана",
          status: exam.kind === "consultation" ? undefined : status === "admitted" ? "Допуск получен" : status === "action_required"
            ? exam.admission?.reason ?? "Требуется действие" : status === "pending" ? "Ожидается допуск" : "Допуск не опубликован",
        };
      });
      const title = data.semesters.find(term => term.id === data.semesterId)?.label;
      return <div className="ac-root">
        {back}
        <header className="ac-heading">
          <h1>Сессия</h1>
          {title && <span className="ac-semester"><CalendarDays size={16} aria-hidden="true"/>{title}</span>}
        </header>
        <SessionCalendar key={data.semesterId} items={items} initialDate={start}/>
      </div>;
    }}
  </Resource>;
}
