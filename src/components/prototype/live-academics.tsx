"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, Clock3, MapPin } from "lucide-react";
import { assignmentItem, assignmentLabel, assignmentList } from "@/contracts/assignments";
import { atlasSharedScheduleGroup, disciplineResponse, scheduleQuery, scheduleResponse, studyResponse, lessonResponse } from "@/contracts/academics";
import type { Lesson } from "@/contracts/academics";
import { dateInMoscow, mondayOf } from "@/contracts/calendar";
import type { z } from "zod";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { LiveDeadlines } from "./live-deadlines";
import { LiveStudy } from "./live-study";
import { AssignmentWorkPage } from "./work-page";
import { ScheduleGrid, type ScheduleEntry } from "./schedule-grid";
import { timetableDateKey, timetableSlots } from "./academic-data";
import { timetableRoom, timetableTeacher } from "./live-lesson-display";
import "./work-page.css";
import "./live-academics.css";

type Section = "schedule" | "lesson" | "study" | "session" | "plan" | "work" | "deadlines" | "teacher" | "group";
type Props = { section: Section; id?: string; search: Record<string, string>; visible?: boolean; studyBack?: ReactNode };
type Study = z.infer<typeof studyResponse>;
type Assignment = z.infer<typeof assignmentList>["items"][number];
const MSK = "Europe/Moscow";
const dateTimeLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: MSK });
const timeLabel = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: MSK });
const link = (hash: string, children: ReactNode, className?: string) => <a className={className} href={hash}>{children}</a>;
const typeLabel: Record<string, string> = { lecture: "Лекция", seminar: "Семинар", practice: "Практика", laboratory: "Лабораторная" };
const statusLabel: Record<string, string> = { planned: "По расписанию", moved: "Перенесено", replaced: "Заменено", cancelled: "Отменено" };

export function LiveAcademics({ section, id, search, visible = true, studyBack }: Props) {
  const auth = useAtlasSession();
  if (!auth || auth.session.state !== "ready") return <div className="loading-card" role="status">Загружаем кабинет…</div>;
  if (section === "lesson" && id) return <Resource url={`/api/v1/lessons/${encodeURIComponent(id)}`} schema={lessonResponse} onUnauthorized={auth.onUnauthorized}>{lesson => <LessonDetail lesson={lesson} back={safeBack(search.back, "#schedule")}/>}</Resource>;
  if (section === "study") return <LiveStudy id={id} semester={search.semester} visible={visible}
    back={studyBack} onUnauthorized={auth.onUnauthorized}/>;
  if (section === "work" && id) return <Resource url={`/api/v1/assignments/${encodeURIComponent(id)}`} schema={assignmentItem} onUnauthorized={auth.onUnauthorized}>{work => <WorkWithSubject work={work} back={safeBack(search.back, "#deadlines")} onUnauthorized={auth.onUnauthorized}/>}</Resource>;
  if (section === "deadlines") return <LiveDeadlines/>;
  if (section === "schedule" || section === "teacher" || section === "group") {
    const teacherId = section === "teacher" ? id : undefined;
    const groupId = section === "group" ? id : undefined;
    if (section === "group" && groupId !== atlasSharedScheduleGroup.slug) {
      return <PageHeading title="Группа не найдена" back="#schedule"/>;
    }
    const date = scheduleQuery.shape.date.safeParse(search.date).data;
    const mode = search.view === "week" ? "week" : "day";
    return <LiveSchedule key={[teacherId, groupId, date, search.view].join("/")} teacherId={teacherId} groupId={groupId}
      date={date} mode={mode} explicitSelection={Boolean(date || search.view)}
      back={teacherId || groupId ? safeBack(search.back, "#schedule") : undefined}/>;
  }
  const view = section === "session" ? "session" : "disciplines";
  const semester = search.semester && /^[0-9a-f-]{36}$/i.test(search.semester) ? `&semester=${encodeURIComponent(search.semester)}` : "";
  return <Resource url={`/api/v1/study?view=${view}${semester}`} schema={studyResponse} onUnauthorized={auth.onUnauthorized}>{data => section === "session"
    ? <SessionPage study={data} back={safeBack(search.back, "#profile")} selectedSemester={search.semester}/>
    : <PlanPage study={data} back={safeBack(search.back, "#profile")} selectedSemester={search.semester}/>}</Resource>;
}

function PageHeading({ title, back, eyebrow }: { title: string; back: string; eyebrow?: string }) {
  return <div className="ac-live-heading">
    <a className="p-route-back" href={back}><ArrowLeft size={18} aria-hidden="true"/>Назад</a>
    {eyebrow && <p>{eyebrow}</p>}<h1>{title}</h1>
  </div>;
}
function safeBack(value: string | undefined, fallback: string) { return value && /^#[\w/?=&.-]+$/u.test(value) ? value : fallback; }
function SemesterSelect({ study, section, selected }: { study: Study; section: "study" | "session" | "plan"; selected?: string }) {
  const active = selected && study.semesters.some(item => item.id === selected) ? selected : study.semesterId ?? "";
  return study.semesters.length > 0 ? <label className="ac-live-semester">Семестр<select value={active} onChange={event => { location.hash = `#${section}?semester=${encodeURIComponent(event.target.value)}`; }}>
    {study.semesters.map(item => <option key={item.id} value={item.id}>{item.label}{item.isCurrent ? " · Текущий" : ""}</option>)}
  </select></label> : null;
}
function MoscowTime({ value, date = false }: { value: string; date?: boolean }) {
  const instant = new Date(value);
  return <time dateTime={instant.toISOString()}>{date ? dateTimeLabel.format(instant) : timeLabel.format(instant)}</time>;
}
function LessonTeacher({ lesson, className }: { lesson: Lesson; className?: string }) {
  const { name, id } = timetableTeacher(lesson);
  if (!name) return null;
  return id ? link(`#teacher/${id}`, name, className) : <span className={className}>{name}</span>;
}

const civilDate = (day: string) => new Date(day + "T12:00:00");
const timetableKind: Record<Lesson["kind"], string> = {
  lecture: "Лекция", seminar: "Семинар", practice: "Практика", laboratory: "Лабораторная работа",
};
type Schedule = z.infer<typeof scheduleResponse>;

function LiveSchedule({ teacherId, groupId, date, mode, explicitSelection, back }: {
  teacherId?: string; groupId?: string; date?: string; mode: "day" | "week"; explicitSelection: boolean; back?: string;
}) {
  const auth = useAtlasSession();
  const [requestedDate, setRequestedDate] = useState(date);
  const changedDate = useCallback((day: Date) => {
    const key = timetableDateKey(day);
    setRequestedDate(previous => previous && mondayOf(previous) === mondayOf(key) ? previous : key);
  }, []);
  const params = new URLSearchParams({ view: "week" });
  if (!auth) return null;
  if (requestedDate) params.set("date", requestedDate);
  if (groupId) params.set("group", groupId);
  const endpoint = teacherId ? `/api/v1/teachers/${encodeURIComponent(teacherId)}/schedule` : "/api/v1/lessons";
  return <Resource url={`${endpoint}?${params}`} schema={scheduleResponse} onUnauthorized={auth.onUnauthorized} retainPrevious refreshMs={60_000}>
    {(data, now) => <TimetableForWeek data={data} now={now ?? Date.parse(data.today + "T00:00:00+03:00")} teacherId={teacherId} groupId={groupId}
      mode={mode} explicitSelection={explicitSelection} changedDate={changedDate} back={back}/>}
  </Resource>;
}

function TimetableForWeek({ data, now, teacherId, groupId, mode, explicitSelection, changedDate, back }: {
  data: Schedule; now: number; teacherId?: string; groupId?: string; mode: "day" | "week";
  explicitSelection: boolean; changedDate: (day: Date) => void; back?: string;
}) {
  const items = new Map<string, ScheduleEntry[]>();
  const byId = new Map<string, Lesson>();
  const slots = new Map<string, { start: string; end: string }>(timetableSlots.map(slot => [slot.start + "-" + slot.end, slot]));
  const teachers = new Map<string, { title: string; description: string; href: string }>();
  for (const lesson of data.items) {
    const day = dateInMoscow(lesson.startsAt);
    const time = timeLabel.format(new Date(lesson.startsAt));
    const end = timeLabel.format(new Date(lesson.endsAt));
    const teacher = timetableTeacher(lesson);
    const entry: ScheduleEntry = {
      id: lesson.id, title: lesson.title, kind: timetableKind[lesson.kind], time, end,
      room: timetableRoom(lesson) || "Аудитория не указана",
      previousRoom: lesson.previousRoom ? (lesson.previousRoom.building === lesson.building
        ? lesson.previousRoom.room : timetableRoom(lesson.previousRoom)) : undefined,
      teacher: teacher.name, teacherHref: teacher.id ? `#teacher/${teacher.id}` : undefined,
      lessonHref: lesson.group === atlasSharedScheduleGroup.code ? undefined : `#lesson/${lesson.id}`,
      group: lesson.group ?? "", parity: "both", workTags: [],
      statusLabel: lesson.status !== "planned" ? statusLabel[lesson.status] : undefined,
      serverAssignments: lesson.assignments?.map(work => ({ ...work, label: assignmentLabel(work.kind, work.number) })),
    };
    items.set(day, [...(items.get(day) ?? []), entry]);
    byId.set(lesson.id, lesson);
    slots.set(`${time}-${end}`, { start: time, end });
    for (const person of lesson.teachers ?? []) {
      teachers.set(person.id, { title: person.fullName, description: lesson.title, href: `#teacher/${person.id}` });
    }
  }
  for (const teacher of data.teacherDirectory ?? []) {
    if (!teachers.has(teacher.id)) teachers.set(teacher.id, {
      title: teacher.fullName.trim().replace(/\s+/gu, " "), description: "Расписание преподавателя", href: "#teacher/" + teacher.id,
    });
  }
  const calendar = new URLSearchParams({ date: data.date });
  if (teacherId) calendar.set("teacher", teacherId);
  if (groupId) calendar.set("group", groupId);
  const heading = teacherId ? {
    id: "teacher-schedule-title", title: data.teacher?.fullName ?? teachers.get(teacherId)?.title ?? "Расписание преподавателя",
    description: "Расписание преподавателя",
  } : groupId ? {
    id: "group-schedule-title", title: "Группа " + atlasSharedScheduleGroup.code, description: "Синтетическая учебная группа",
  } : undefined;
  return <>
    {back && <a className="p-route-back" href={back}><ArrowLeft size={18} aria-hidden="true"/>К расписанию</a>}
    <ScheduleGrid
    scope={teacherId ? { scope: "teacher", id: teacherId } : groupId ? { scope: "group", id: groupId } : undefined}
    heading={heading}
    live={{
      initialDate: civilDate(data.date), initialMode: mode, today: civilDate(data.today), explicitDate: explicitSelection, changedDate,
      lessons: day => items.get(timetableDateKey(day)) ?? [],
      hasDay: day => { const key = timetableDateKey(day); return key >= data.start && key < data.end; },
      state: (_, entry) => {
        const lesson = byId.get(entry.id);
        if (!lesson) return "upcoming";
        if (Date.parse(lesson.endsAt) <= now) return "past";
        return lesson.status !== "cancelled" && Date.parse(lesson.startsAt) <= now ? "current" : "upcoming";
      },
      week: data.academicWeek ?? null, weekStart: data.start,
      slots: Array.from(slots.values()).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
      calendarHref: "/api/v1/lessons/calendar?" + calendar,
      teachers: Array.from(teachers.values()).sort((a, b) => a.title.localeCompare(b.title, "ru")),
    }}/>
  </>;
}

function LessonDetail({ lesson, back }: { lesson: z.infer<typeof lessonResponse>; back: string }) {
  return <section className="ac-root ac-live"><PageHeading title={lesson.title} back={back} eyebrow={typeLabel[lesson.kind] ?? lesson.kind}/>
    <dl className="ac-live-facts"><div><dt><CalendarDays/>Когда</dt><dd><MoscowTime value={lesson.startsAt} date/></dd></div><div><dt><Clock3/>Время</dt><dd><MoscowTime value={lesson.startsAt}/>–<MoscowTime value={lesson.endsAt}/></dd></div><div><dt><MapPin/>Место</dt><dd>{lesson.room}{lesson.building ? ` · ${lesson.building}` : ""}</dd></div><div><dt>Статус</dt><dd>{statusLabel[lesson.status]}{lesson.reason ? ` · ${lesson.reason}` : ""}</dd></div></dl>
    <section className="ac-live-card"><h2>Преподаватель</h2>
      <p>{timetableTeacher(lesson).name ? <LessonTeacher lesson={lesson} className="ac-live-link"/> : "Преподаватель не указан."}</p>
    </section>
    {lesson.assignments?.length ? <section className="ac-live-card"><h2>Работы к занятию</h2>{lesson.assignments.map(work => <p key={work.id}>{link(`#work/${work.id}`, work.title, "ac-live-link")}</p>)}</section> : null}
  </section>;
}

function PlanPage({ study, back, selectedSemester }: { study: Study; back: string; selectedSemester?: string }) {
  return <section className="ac-root ac-live"><PageHeading title="Учебный план" back={back}/><SemesterSelect study={study} section="plan" selected={selectedSemester}/>
    <section className="ac-live-card"><h2>{study.semesters.find(item => item.id === study.semesterId)?.label ?? "Выбранный семестр"}</h2>
      {study.items.length ? study.items.map(item => <p key={item.id}>{link(`#study/${item.id}`, item.title, "ac-live-title")} · {assessmentName(item.assessment)} · {statusName(item.status)}</p>) : <p className="ac-live-muted">В выбранном семестре дисциплин нет.</p>}
    </section>
  </section>;
}
function SessionPage({ study, back, selectedSemester }: { study: Study; back: string; selectedSemester?: string }) {
  const exams = [...study.exams].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return <section className="ac-root ac-live"><PageHeading title="Сессия" back={back}/><SemesterSelect study={study} section="session" selected={selectedSemester}/>
    {exams.length ? <div className="ac-live-list">{exams.map(exam => <article className="ac-live-lesson" key={exam.id}><div className="ac-live-time"><MoscowTime value={exam.startsAt}/></div><div className="ac-live-lesson-body"><h2>{exam.title}</h2><p>{exam.kind === "exam" ? "Экзамен" : exam.kind === "consultation" ? "Консультация" : "Зачёт"} · {exam.room ?? "Аудитория не указана"}{exam.building ? ` · ${exam.building}` : ""}</p><p className="ac-live-status">{exam.admission ? admissionLabel(exam.admission.status) : "Допуск не опубликован"}{exam.admission?.reason ? ` · ${exam.admission.reason}` : ""}</p>{exam.teachers?.map(t => <a key={t.id} href={`#teacher/${t.id}`}>{t.fullName}</a>)}</div></article>)}</div> : <p className="ac-live-empty">Даты сессии пока не опубликованы.</p>}
  </section>;
}

function WorkWithSubject({ work, back, onUnauthorized }: { work: Assignment; back: string; onUnauthorized: () => void }) {
  const backLink = <a className="p-route-back" href={back}><ArrowLeft size={18} aria-hidden="true"/>Назад</a>;
  return <Resource key={work.planId} url={"/api/v1/study/" + work.planId} schema={disciplineResponse} onUnauthorized={onUnauthorized}
    fallback={<AssignmentWorkPage assignment={work} back={backLink}/>}>
    {subject => <AssignmentWorkPage assignment={work} back={backLink} subject={subject.title}
      overdue={subject.deadlines.some(deadline => deadline.assignmentId === work.id && deadline.state === "overdue")}/>}
  </Resource>;
}

function assessmentName(value: string) { return ({ exam: "Экзамен", credit: "Зачёт", graded_credit: "Дифференцированный зачёт" } as Record<string,string>)[value] ?? value; }
function statusName(value: string) { return ({ closed: "Закрыта", attention: "Требует внимания", awaiting: "Ожидает результатов" } as Record<string,string>)[value] ?? value; }
function admissionLabel(value: string) { return ({ admitted: "Допущен", pending: "Ожидает допуска", action_required: "Нужно действие" } as Record<string,string>)[value] ?? value; }
