"use client";

import { CabinetLink } from "./cabinet-link";
import { assignmentLabel, assignmentList } from "@/contracts/assignments";
import { compactDate } from "./compact-date";

import { useRef, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
import { Resource } from "./resource";
import { TodayRequestSlot } from "./request-views";
import { AssistantEntry, AssistantView } from "./assistant-view";
import type { AssistantMemory } from "./use-assistant-conversation";
import { relativeTime } from "./relative-time";
import { requestSummary } from "@/contracts/requests";
import {
  disciplineResponse, lessonResponse, scheduleQuery, scheduleResponse, studyQuery, studyResponse,
  todayDeadline, todayLesson, todayStudy, type TodayDeadline, type Lesson,
} from "@/contracts/academics";
import { addDays, dateInMoscow, mondayOf } from "@/contracts/calendar";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const instantLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" });
const timeLabel = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const names = { planned: "По расписанию", moved: "Перенос", replaced: "Замена", cancelled: "Отмена" };
const kinds = { lecture: "Лекция", seminar: "Семинар", practice: "Практика", laboratory: "Лабораторная работа" };
const statuses = { closed: "Закрыто", attention: "Требует внимания", awaiting: "Ожидается результат" };
const admissionLabels = { admitted: "Допущен", pending: "Допуск ожидается", action_required: "Требуется действие" };
const assessments = { exam: "Экзамен", credit: "Зачёт", graded_credit: "Дифференцированный зачёт", retake: "Пересдача", consultation: "Консультация" };
const gradeKinds = { current: "Текущая оценка", final: "Итог", credit: "Зачёт" };

const dayLabel = (date: string) => dateLabel.format(new Date(date + "T12:00:00Z"));
const instant = (value: string) => instantLabel.format(new Date(value));
const time = (value: string) => timeLabel.format(new Date(value));
const relative = (path: string, query: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const search = params.toString();
  return search ? path + "?" + search : path;
};

export type AcademicScreen = "today" | "schedule" | "lesson" | "study" | "discipline";
export type Screen = AcademicScreen | "entry" | "profile";
export type Search = Record<string, string | string[] | undefined>;

function Tag({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return <span className={`status-tag tone-${tone}`}>{children}</span>;
}

const weekDay = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const calendarDay = (date: string) => new Date(date + "T12:00:00Z");

function weekLabel(start: string) {
  const end = addDays(start, 6);
  const first = start.slice(0, 7) === end.slice(0, 7) ? Number(start.slice(-2)) : monthDay.format(calendarDay(start));
  return `${first}–${monthDay.format(calendarDay(end))}`;
}

function LessonLine({ lesson }: { lesson: Lesson }) {
  return <>
    <span className="lesson-time">{time(lesson.startsAt)}–{time(lesson.endsAt)}</span>
    <span className="lesson-room-group"><span className="lesson-room"><span className="sr-only">Аудитория </span><span aria-hidden="true">Ауд. </span>{lesson.room}</span><ChevronRight className="row-chevron" size={18} aria-hidden="true" /></span>
  </>;
}

function ScheduleRow({ lesson, movedAway = false, back, hero = false, onUnauthorized, now }: {
  lesson: Lesson; movedAway?: boolean; back?: string; hero?: boolean; onUnauthorized?: () => void; now?: number;
}) {
  const tone = lesson.status === "cancelled" ? "danger" : lesson.status === "planned" ? "neutral" : "warning";
  const status = lesson.status === "planned" ? <span className="sr-only">{names[lesson.status]}</span> : <Tag tone={tone}>{names[lesson.status]}</Tag>;
  const pulse = now === undefined || movedAway || lesson.status === "cancelled" || Date.parse(lesson.endsAt) <= now
    ? null : relativeTime(lesson.startsAt, now, "lesson") ?? "Идёт сейчас";
  return <CabinetLink className={`data-row lesson-row${hero ? " lesson-hero" : " schedule-lesson"}`} href={relative(`/schedule/${lesson.id}`, { back })}>
    <span className="lesson-line"><LessonLine lesson={lesson} /></span>
    <strong className="lesson-title">{lesson.title}</strong>
    {movedAway && <span className="row-meta lesson-moved-away">Перенесено на {instant(lesson.startsAt)}</span>}
    <span className="row-meta lesson-teacher">{lesson.teacher}</span>
    <span className="lesson-footer">
    <span>{dayLabel(dateInMoscow(lesson.startsAt))}</span>
    <span className="lesson-tags">
    {pulse && <span className="lesson-pulse">{pulse}</span>}
    {lesson.status === "moved" && onUnauthorized
      ? <Resource url={`/api/v1/lessons/${lesson.id}`} schema={lessonResponse} onUnauthorized={onUnauthorized} fallback={status}>
          {({ history }) => {
            const previous = history.find((revision) => revision.version < lesson.version);
            return previous && previous.room !== lesson.room
              ? <Tag tone={tone}>Перенос · ауд. {previous.room} → {lesson.room}</Tag>
              : status;
          }}
        </Resource>
      : status}
    </span></span>
  </CabinetLink>;
}

function WeekStrip({ start, selected, items, dayHref }: {
  start: string; selected?: string; items: Lesson[]; dayHref: (day: string) => string;
}) {
  return <nav className="week-strip" aria-label="Дни недели">
    {Array.from({ length: 7 }, (_, index) => {
      const day = addDays(start, index);
      const entries = items.filter((item) => [dateInMoscow(item.startsAt), dateInMoscow(item.originalStartsAt)].includes(day));
      const changed = entries.some((item) => item.status === "moved");
      const description = changed ? ", есть изменения" : entries.length ? ", есть занятия" : "";
      return <CabinetLink key={day} href={dayHref(day)} aria-current={day === selected ? "date" : undefined}
        aria-label={dayLabel(day) + description}>
        <span>{weekDay.format(calendarDay(day))}</span><strong>{Number(day.slice(-2))}</strong>
        {entries.length > 0 && <span aria-hidden="true" className={`week-dot has-lessons${changed ? " has-changes" : ""}`} />}
      </CabinetLink>;
    })}
  </nav>;
}

function Schedule({ search, onUnauthorized }: { search: Search; onUnauthorized: () => void }) {
  const parsed = scheduleQuery.safeParse({ date: search.date, view: search.view });
  const date = parsed.success ? parsed.data.date : undefined;
  const view = parsed.success ? parsed.data.view : "day";
  const touch = useRef<{ x: number; y: number } | null>(null);
  const link = (value?: string, mode = view) => relative("/schedule", { date: value, view: mode });

  return <>
    <h1>Расписание</h1>
    <Resource url={relative("/api/v1/lessons", { date, view })} schema={scheduleResponse} onUnauthorized={onUnauthorized} retainPrevious refreshMs={60_000}>
      {({ start, end, date: selected, today, items, nearest, academicWeek }, now) => {
        const week = end !== addDays(start, 1);
        const weekStart = mondayOf(selected);
        const dayHref = (day: string) => link(day, "day");
        const moveDay = (delta: number) => window.history.pushState(null, "", dayHref(addDays(date ?? selected, delta)));
        const days = Array.from({ length: week ? 7 : 1 }, (_, index) => addDays(start, index));
        const movedAway = (lesson: Lesson, day: string) => dateInMoscow(lesson.startsAt) !== day;
        const changes = items.filter((item) => item.status !== "planned").length;
        const step = view === "week" ? 7 : 1;
        return <div className="desktop-columns schedule-layout"><div className="desktop-main-column">
          <div className="period-bar">
            <CabinetLink className="icon-link" href={link(addDays(date ?? selected, -step))} aria-label="Предыдущий период"><ChevronLeft size={18} /></CabinetLink>
            <strong>{weekLabel(weekStart)}</strong>
            <CabinetLink className="icon-link" href={link(addDays(date ?? selected, step))} aria-label="Следующий период"><ChevronRight size={18} /></CabinetLink>
            <CabinetLink className="schedule-today" href={link(today)} aria-label="К сегодня">Сегодня</CabinetLink>
            <CabinetLink className="week-list-link" aria-current={view === "week" ? "true" : undefined} href={link(date ?? selected, "week")}>
              Вся неделя
            </CabinetLink>
          </div>
          {week ? <WeekStrip start={weekStart} selected={view === "day" ? selected : undefined} items={items} dayHref={dayHref} />
            : <Resource url={relative("/api/v1/lessons", { date: weekStart, view: "week" })} schema={scheduleResponse}
                onUnauthorized={onUnauthorized} fallback={<WeekStrip start={weekStart} selected={selected} items={items} dayHref={dayHref} />}>
                {(data) => <WeekStrip start={weekStart} selected={view === "day" ? selected : undefined} items={data.items} dayHref={dayHref} />}
              </Resource>}
          {academicWeek && <p className="period-meta">Учебная неделя {academicWeek.number} · {academicWeek.parity === "numerator" ? "Числитель" : "Знаменатель"}</p>}
          {week && <p className="period-meta">Изменений за неделю: {changes}</p>}
          {days.map((day) => {
            const entries = items.filter((item) => [dateInMoscow(item.startsAt), dateInMoscow(item.originalStartsAt)].includes(day))
              .sort((a, b) => (movedAway(a, day) ? a.originalStartsAt : a.startsAt)
                .localeCompare(movedAway(b, day) ? b.originalStartsAt : b.startsAt) || a.id.localeCompare(b.id));
            return <section className="schedule-day" key={week ? day : "day"} aria-label={dayLabel(day)}
              tabIndex={week ? undefined : 0}
              onKeyDown={week ? undefined : (event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
                    (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
                event.preventDefault();
                moveDay(event.key === "ArrowLeft" ? -1 : 1);
              }}
              onTouchStart={week ? undefined : (event) => {
                const point = event.touches[0];
                touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
              }}
              onTouchCancel={() => { touch.current = null; }}
              onTouchEnd={week ? undefined : (event) => {
                const start = touch.current;
                touch.current = null;
                const point = event.changedTouches[0];
                if (!start || !point || event.touches.length) return;
                const dx = point.clientX - start.x;
                if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(point.clientY - start.y)) moveDay(dx < 0 ? 1 : -1);
              }}>
              <h2>{dayLabel(day)}</h2>
              {entries.length === 0
                ? <div className="schedule-empty"><p className="muted">На этот день занятий нет</p>{nearest && <CabinetLink className="action-link" href={link(dateInMoscow(nearest.startsAt))}>К ближайшим занятиям: {dayLabel(dateInMoscow(nearest.startsAt))} <span aria-hidden="true">→</span></CabinetLink>}</div>
                : entries.map((item) => <ScheduleRow key={item.id} lesson={item} now={now} movedAway={movedAway(item, day)} back={link(selected)} onUnauthorized={onUnauthorized} />)}
            </section>;
          })}
        </div><aside className="desktop-context data-panel">
          <h2>Сводка недели</h2>
          <Resource url={relative("/api/v1/lessons", { date: weekStart, view: "week" })} schema={scheduleResponse} onUnauthorized={onUnauthorized}>
            {(data) => {
              const changed = data.items.filter((item) => item.status !== "planned");
              const freeDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((day) => !data.items.some((item) => item.status !== "cancelled" && dateInMoscow(item.startsAt) === day)).length;
              return <><div className="summary-tiles">{[[data.items.length, "Занятий"], [data.items.filter((item) => item.status === "moved").length, "Переносов"], [freeDays, "Свободных дней"]].map(([count, label]) => <span key={label}><strong>{count}</strong>{label}</span>)}</div>
                {changed.length ? changed.map((item) => <CabinetLink key={item.id} className="context-link" href={`/schedule/${item.id}`}>{names[item.status]} · {item.title} <ChevronRight size={16} /></CabinetLink>) : <p className="muted">Изменений на этой неделе нет</p>}</>;
            }}
          </Resource>
        </aside></div>;
      }}
    </Resource>
  </>;
}

function backLink(search: Search, parent: "/schedule" | "/study") {
  const back = search.back;
  return typeof back === "string" && (back === parent || back.startsWith(parent + "?")) ? back : parent;
}

function LessonDetail({ id, search, onUnauthorized }: { id: string; search: Search; onUnauthorized: () => void }) {
  return <>
    <CabinetLink className="back-link" href={backLink(search, "/schedule")}><ChevronLeft size={18} /> К расписанию</CabinetLink>
    <Resource url={`/api/v1/lessons/${encodeURIComponent(id)}`} schema={lessonResponse} onUnauthorized={onUnauthorized}>
      {(lesson) => <>
        <h1>{lesson.title}</h1>
        <section className="data-panel">
          <Tag tone={lesson.status === "cancelled" ? "danger" : lesson.status === "planned" ? "neutral" : "warning"}>{names[lesson.status]}</Tag>
          <p>{kinds[lesson.kind]} · {instant(lesson.startsAt)}–{time(lesson.endsAt)}</p>
          <p><MapPin className="inline-icon" size={17} /> Аудитория {lesson.room} · {lesson.teacher}</p>
          {!!lesson.teachers?.length && <p>{lesson.teachers.map(teacher => <CabinetLink key={teacher.id} href={`/teachers/${teacher.id}`}>{teacher.fullName} </CabinetLink>)}</p>}
          {lesson.reason && <p>{lesson.reason}</p>}
        </section>
        {!!lesson.assignments?.length && <section className="data-panel"><h2>Учебные работы</h2>{lesson.assignments.map(item => <CabinetLink key={item.id} className="context-link" href={`/assignments/${item.id}`}>{assignmentLabel(item.kind, item.number)} · {item.title}</CabinetLink>)}</section>}
        {lesson.history.length > 1 && <section className="data-panel">
          <h2>Было / Стало</h2>
          <div className="comparison">
            {[lesson.history[1], lesson.history[0]].map((revision, i) => <div key={revision.version}>
              <strong>{i === 0 ? "Было" : "Стало"}</strong>
              <p>{instant(revision.startsAt)} · ауд. {revision.room}<br />{revision.teacher} · {names[revision.status]}</p>
            </div>)}
          </div>
        </section>}
        <section className="data-panel">
          <h2>История изменений</h2>
          <ol className="timeline">{lesson.history.map((revision) => <li key={revision.version}>
            <strong>{names[revision.status]}</strong>
            <span className="row-meta">{instant(revision.publishedAt)} МСК</span>
            <p>{instant(revision.startsAt)} · ауд. {revision.room} · {revision.teacher}</p>
            {revision.reason && <p>{revision.reason}</p>}
          </li>)}</ol>
        </section>
      </>}
    </Resource>
  </>;
}

function DeadlineRow({ deadline, link = true, compact = false, now }: { deadline: TodayDeadline; link?: boolean; compact?: boolean; now?: number }) {
  const pulse = now !== undefined && deadline.state !== "completed"
    ? relativeTime(deadline.dueAt, now, "deadline") : null;
  const status = deadline.state === "overdue" ? "Просрочено" : deadline.state === "completed" ? "Выполнено" : deadline.required ? "Обязательный" : "Срок";
  const content = <>
    <span className="deadline-title"><strong>{deadline.title}</strong>{link && <ChevronRight className="row-chevron" size={16} aria-hidden="true" />}</span>
    <span className={`deadline-meta deadline-${deadline.state}`}>
      <span>{deadline.state === "completed" ? "Срок" : "До"} {compact ? compactDate(deadline.dueAt) : instant(deadline.dueAt) + " МСК"}</span>
      {pulse && pulse !== "Просрочено" && <span>{pulse}</span>}
      <span>{status}</span>
    </span>
  </>;
  return link ? <CabinetLink className="data-row deadline-row" href={deadline.assignmentId ? `/assignments/${deadline.assignmentId}` : "planId" in deadline ? `/study/${deadline.planId}` : `/requests/${deadline.requestId}`}>{content}</CabinetLink> : <div className="data-row deadline-row">{content}</div>;
}

function StudyProgress({ statuses }: { statuses: ("closed" | "attention" | "awaiting")[] }) {
  const counts = { closed: 0, attention: 0, awaiting: 0 };
  statuses.forEach((status) => { counts[status]++; });
  const ordered = (["closed", "attention", "awaiting"] as const).flatMap((status) => Array.from({ length: counts[status] }, () => status));
  return <div className="study-progress" role="img" aria-label={`Закрыто: ${counts.closed}, требуют внимания: ${counts.attention}, ожидают результата: ${counts.awaiting}`} style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}>
    {ordered.map((status, index) => <span key={index} className={`study-segment study-segment-${status}`} />)}
  </div>;
}

function Study({ search, onUnauthorized }: { search: Search; onUnauthorized: () => void }) {
  const parsed = studyQuery.safeParse({ semester: search.semester, view: search.view });
  const view = parsed.success ? parsed.data.view : "disciplines";
  const semester = parsed.success ? parsed.data.semester : undefined;
  const link = (selected?: string, tab = view) => relative("/study", { semester: selected, view: tab });
  return <>
    <h1>Учёба</h1>
    <Resource url={relative("/api/v1/study", { semester, view })} schema={studyResponse} onUnauthorized={onUnauthorized}>
      {({ semesterId, semesters, progress, items, exams, action }, now) => <>
        <div className="study-controls">
          {semesters.length > 0 && <select id="semester" name="semester" aria-label="Семестр"
            value={semesterId ?? undefined} onChange={(event) => window.history.pushState(null, "", link(event.currentTarget.value))}>
            {semesters.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>}
          <div className="segmented" aria-label="Раздел учёбы">
            <CabinetLink href={link(semesterId ?? undefined, "disciplines")} aria-current={view === "disciplines" ? "true" : undefined}>Дисциплины</CabinetLink>
            <CabinetLink href={link(semesterId ?? undefined, "session")} aria-current={view === "session" ? "true" : undefined}>Сессия</CabinetLink>
          </div>
        </div>
        {progress.total === 0 ? <section className="data-panel"><p>Учебный план пока недоступен</p></section> : <div className="desktop-columns study-layout">
          <section className="data-panel progress-panel">
            <h2>Закрыто {progress.closed} из {progress.total}</h2>
            <StudyProgress statuses={items.map((item) => item.status)} />
            {action && <DeadlineRow deadline={action} compact now={now} />}
          </section>
          <section className="data-panel study-list" aria-label={view === "session" ? "Сессия" : "Дисциплины"}>
            {view === "disciplines" ? <>
              {!items.some((item) => item.hasGrades) && <p className="muted">Оценки за семестр ещё не опубликованы</p>}
              {items.map((item) => <CabinetLink key={item.id} className="data-row chevron-row" href={relative(`/study/${item.id}`, { back: link(semesterId ?? undefined) })}>
                <span className="row-body"><strong>{item.title}</strong><span className="row-meta">{assessments[item.assessment]}</span></span>
                <Tag tone={item.status === "closed" ? "success" : item.status === "attention" ? "danger" : "neutral"}>{{ closed: "Закрыто", attention: "Внимание", awaiting: "Ожидается" }[item.status]}</Tag>
                <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
              </CabinetLink>)}
            </> : <>
              {exams.length === 0 && <p className="muted">Даты сессии пока не опубликованы</p>}
              {exams.map((exam) => <CabinetLink key={exam.id} className="data-row chevron-row" href={relative(`/study/${exam.planId}`, { back: link(semesterId ?? undefined) })}>
                <span className="row-body"><strong>{exam.title}</strong><span className="row-meta">{assessments[exam.kind]} · {instant(exam.startsAt)}{exam.room && ` · ауд. ${exam.room}`}{exam.admission && ` · ${admissionLabels[exam.admission.status]}`}</span></span>
                <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
              </CabinetLink>)}
              {exams.length > 0 && items.filter((item) => !exams.some((exam) => exam.planId === item.id)).map((item) =>
                <CabinetLink key={item.id} className="data-row chevron-row" href={relative(`/study/${item.id}`, { back: link(semesterId ?? undefined) })}>
                  <span className="row-body"><strong>{item.title}</strong><span className="row-meta">Дата пока не опубликована</span></span>
                  <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
                </CabinetLink>)}
            </>}
          </section>
        </div>}
      </>}
    </Resource>
  </>;
}

function Discipline({ id, search, onUnauthorized }: { id: string; search: Search; onUnauthorized: () => void }) {
  return <>
    <CabinetLink className="back-link" href={backLink(search, "/study")}><ChevronLeft size={18} /> К учёбе</CabinetLink>
    <Resource url={`/api/v1/study/${encodeURIComponent(id)}`} schema={disciplineResponse} onUnauthorized={onUnauthorized}>
      {(item) => <>
        <h1>{item.title}</h1>
        <Tag tone={item.status === "closed" ? "success" : item.status === "attention" ? "danger" : "neutral"}>{statuses[item.status]}</Tag>
        <section className="data-panel">
          <h2>Результаты</h2>
          {!item.grades.length && <p className="muted">Оценки пока не опубликованы</p>}
          {item.grades.map((grade) => <div className="data-row" key={grade.id}>
            <span className="row-body"><strong>{grade.label}</strong><span className="row-meta">{gradeKinds[grade.kind]} · {instant(grade.publishedAt)}</span></span>
            {grade.value !== null && <Tag tone="info">{grade.value} / {grade.scale === "five" ? 5 : 100}</Tag>}
            {grade.outcome && <Tag tone={grade.outcome === "pass" ? "success" : "danger"}>{grade.outcome === "pass" ? "Закрыто" : "Не закрыто"}</Tag>}
          </div>)}
        </section>
        <section className="data-panel"><h2>Учебные работы</h2>
          <Resource url="/api/v1/assignments" schema={assignmentList} onUnauthorized={onUnauthorized}>
            {data => data.items.filter(work => work.planId === id).length ? data.items.filter(work => work.planId === id).map(work =>
              <CabinetLink key={work.id} className="context-link" href={`/assignments/${work.id}`}>{assignmentLabel(work.kind, work.number)} · {work.title}</CabinetLink>) : <p className="muted">Работ пока нет</p>}
          </Resource>
        </section>
        <section className="data-panel"><h2>Сроки</h2>
          {item.deadlines.length ? item.deadlines.map((deadline) => <DeadlineRow key={deadline.id} deadline={deadline} link={false} />)
            : <p className="muted">Сроков пока нет</p>}
        </section>
        <section className="data-panel"><h2>Сессия</h2>
          {item.exams.length ? item.exams.map((exam) => <p key={exam.id}>{assessments[exam.kind]} · {instant(exam.startsAt)}{exam.room && ` · ауд. ${exam.room}`}{exam.admission && ` · ${admissionLabels[exam.admission.status]}${exam.admission.reason ? `: ${exam.admission.reason}` : ""}`}</p>)
            : <p className="muted">Дата пока не опубликована</p>}
        </section>
      </>}
    </Resource>
  </>;
}

function Today({ onUnauthorized, assistantMemory }: { onUnauthorized: () => void; assistantMemory: AssistantMemory }) {
  return <><h1 className="today-heading">Сегодня</h1><div className="today-with-assistant"><div className="today-grid">
    <Resource url="/api/v1/today?block=lesson" schema={todayLesson} onUnauthorized={onUnauthorized} refreshMs={60_000}>
      {({ date, nearest, change }, now) => <>
        <p className="muted today-date">{dayLabel(date)}</p>
        <section className={`data-panel today-lesson today-lesson-${nearest?.status ?? "planned"}`}>
          <h2 className="today-summary-title"><CalendarDays className="inline-icon" size={15} /> Ближайшая пара</h2>
          {nearest ? <>
            <ScheduleRow lesson={nearest} now={now} hero onUnauthorized={onUnauthorized} />
          </> : <p>Предстоящих занятий нет</p>}
          {change && <CabinetLink href={`/schedule/${change.id}`}>{names[change.status]} · {change.title}</CabinetLink>}
        </section>
      </>}
    </Resource>
    <section className="data-panel today-deadline">
      <h2 className="today-summary-title"><Clock3 className="inline-icon" size={15} /> Ближайший срок</h2>
      <Resource url="/api/v1/today?block=deadline" schema={todayDeadline} onUnauthorized={onUnauthorized} refreshMs={60_000}>
        {(deadline, now) => deadline ? <DeadlineRow deadline={deadline} compact now={now} /> : <p>Ближайших дедлайнов нет</p>}
      </Resource>
    </section>
    <AssistantEntry memory={assistantMemory} />
    <section className="data-panel today-study-panel">
      <h2 className="today-summary-title">Учёба</h2>
      <Resource url="/api/v1/today?block=study" schema={todayStudy} onUnauthorized={onUnauthorized}>
        {({ closed, total, semesterId, statuses }) => <CabinetLink className="data-row chevron-row today-study"
          href={relative("/study", { semester: semesterId ?? undefined })}>
          <span className="row-body">{total > 0
            ? <><strong className="study-count"><span className="sr-only">Закрыто </span>{closed} из {total}</strong><StudyProgress statuses={statuses} /><span className="today-study-summary">{(["closed", "awaiting", "attention"] as const).map((status) => <span key={status}><strong>{statuses.filter((item) => item === status).length}</strong>{status === "closed" ? "Закрыто" : status === "awaiting" ? "Ожидается" : "Внимание"}</span>)}</span></>
            : <span className="row-meta">Учебный план пока недоступен</span>}
            <span className="today-summary-action">К дисциплинам <ChevronRight size={16} aria-hidden="true" /></span>
          </span>
        </CabinetLink>}
      </Resource>
    </section>
    <Resource url="/api/v1/today?block=request" schema={latestRequest} onUnauthorized={onUnauthorized} refreshMs={15_000}>
      {(item) => <TodayRequestSlot item={item} onUnauthorized={onUnauthorized} />}
    </Resource>
  </div><AssistantView memory={assistantMemory} onUnauthorized={onUnauthorized} /></div></>;
}

const latestRequest = requestSummary.nullable();

export function AcademicView({ screen, id, search, onUnauthorized, assistantMemory }: {
  screen: AcademicScreen; id?: string; search: Search; onUnauthorized: () => void; assistantMemory: AssistantMemory;
}) {
  if (screen === "schedule") return <Schedule search={search} onUnauthorized={onUnauthorized} />;
  if (screen === "lesson") return <LessonDetail id={id ?? ""} search={search} onUnauthorized={onUnauthorized} />;
  if (screen === "study") return <Study search={search} onUnauthorized={onUnauthorized} />;
  if (screen === "discipline") return <Discipline id={id ?? ""} search={search} onUnauthorized={onUnauthorized} />;
  return <Today onUnauthorized={onUnauthorized} assistantMemory={assistantMemory} />;
}
