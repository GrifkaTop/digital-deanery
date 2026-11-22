"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, MapPin } from "lucide-react";
import { subjects, teacherNames } from "./academic-data";
import "./session-calendar.css";

export type SessionEvent = { id: string; date: string; teacherHref?: string; day: number; subject: string; teacher: string; kind: "Экзамен" | "Зачёт" | "Консультация"; time: string; room: string; status?: string };
const events: SessionEvent[] = subjects.flatMap((subject, i) => {
  const exam: SessionEvent = { id: `exam-${i}`, date: "2027-01", day: 11 + i * 3, subject, teacher: teacherNames[i], kind: i % 2 ? "Зачёт" : "Экзамен", time: "09:00", room: `${210 + i} · корпус А`, status: i < 2 ? "Допуск получен" : i === 3 ? "Сдать контрольную" : "Ожидается допуск" };
  return i % 2 ? [exam] : [{ ...exam, id: `consultation-${i}`, day: exam.day - 1, kind: "Консультация" as const, time: "14:00", status: undefined }, exam];
});
const kindCode = { "Экзамен": "Э", "Зачёт": "З", "Консультация": "К" };
const typeClass = (kind: SessionEvent["kind"]) => kind === "Экзамен" ? "exam" : kind === "Зачёт" ? "credit" : "consultation";
const dateLabel = (date: Date) => date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export function SessionCalendar({ items = events, initialDate = "2027-01-11" }: { items?: readonly SessionEvent[]; initialDate?: string }) {
  const start = new Date(initialDate + "T12:00:00");
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1, 12));
  const [selectedDay, setSelectedDay] = useState(start.getDate());
  const monthKey = month.getFullYear() + "-" + String(month.getMonth() + 1).padStart(2, "0");
  const monthEvents = items.filter(event => event.date === monthKey);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const selectedDate = new Date(month.getFullYear(), month.getMonth(), selectedDay, 12);
  const selectedEvents = monthEvents.filter(event => event.day === selectedDay);
  function moveMonth(delta: number) { setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1, 12)); setSelectedDay(1); }
  function reset() { setMonth(new Date(start.getFullYear(), start.getMonth(), 1, 12)); setSelectedDay(start.getDate()); }

  return <div className="sc-root">
    <div className="sc-toolbar"><div className="sc-month"><button aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}><ArrowLeft size={18}/></button><h2 aria-live="polite">{month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</h2><button aria-label="Следующий месяц" onClick={() => moveMonth(1)}><ArrowRight size={18}/></button></div><button className="sc-reset" onClick={reset}>Месяц сессии</button></div>
    <div className="sc-legend"><span className="sc-exam">Э · Экзамен</span><span className="sc-credit">З · Зачёт</span><span className="sc-consultation">К · Консультация</span></div>
    <div className="sc-calendar" aria-label="Календарь сессии">
      <div className="sc-weekdays" aria-hidden="true">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="sc-dates">{Array.from({ length: offset }, (_, i) => <div key={`empty-${i}`} className="sc-blank" aria-hidden="true"/>)}{Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const dayEvents = monthEvents.filter(event => event.day === day);
        return <button key={day} className="sc-day" aria-pressed={day === selectedDay} aria-label={`${dateLabel(new Date(month.getFullYear(), month.getMonth(), day, 12))}: ${dayEvents.length ? dayEvents.map(event => `${event.time}, ${event.kind}, ${event.subject}`).join("; ") : "событий нет"}`} onClick={() => setSelectedDay(day)}><span className="sc-number">{day}</span><span className="sc-day-events">{dayEvents.map(event => <span key={event.id} className={`sc-event sc-${typeClass(event.kind)}`}><span className="sc-event-code">{kindCode[event.kind]}</span><span className="sc-event-caption"><strong>{event.time} · {event.kind}</strong><span>{event.subject}</span></span></span>)}</span></button>;
      })}</div>
    </div>
    <section className="sc-details" aria-live="polite" aria-label="События выбранной даты"><h2>{dateLabel(selectedDate)}</h2>{selectedEvents.length ? selectedEvents.map(event => <article className="sc-detail" key={event.id}><div className="sc-detail-heading"><span className={`sc-kind sc-${typeClass(event.kind)}`}>{event.kind}</span>{event.status && <span className={`sc-admission ${event.status === "Допуск получен" ? "sc-admitted" : event.status === "Сдать контрольную" ? "sc-warning" : ""}`}>{event.status}</span>}</div><h3>{event.subject}</h3><div className="sc-facts"><span><Clock3 size={16}/>{event.time}</span><span><MapPin size={16}/>{event.room}</span></div>{event.teacherHref ? <a className="p-teacher-link" href={event.teacherHref} aria-label={"Расписание преподавателя: " + event.teacher}>{event.teacher}</a>
      : event.teacher && <span className="p-teacher-link">{event.teacher}</span>}{event.status === "Сдать контрольную" && <a className="sc-study-link" href="#study">К успеваемости <ArrowRight size={16}/></a>}</article>) : <p className="sc-empty">Событий сессии нет</p>}</section>
  </div>;
}
