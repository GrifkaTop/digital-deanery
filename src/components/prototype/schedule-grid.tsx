"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CalendarArrowDown, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { isTimetableDateInSemester, shiftTimetableDate as shift, timetableDateKey, timetableDemoNow, timetableLessonKinds, timetableLessonState, timetableOwnGroup, timetableWeek, type TimetableLesson, type WorkTag } from "./academic-data";
import { scheduleTagCategory } from "./academic-categories";
import { readSchedulePreference, writeSchedulePreference, type ScheduleMode } from "./atlas-ui-preferences";
import { lessonsForScheduleScope, scheduleWeekDays, type ScheduleScope } from "./schedule-directory-data";
import { ScheduleWeek } from "./schedule-week";
import { ScheduleWorkCounters } from "./schedule-work-counters";
import { ScheduleDirectory, type ScheduleTeacherTarget } from "./search";
import { hasScheduleWorkDetails, scheduleWorkCounts, scheduleWorkHref } from "./work-route";
import { TeacherLink } from "./teacher-link";
import "./schedule-grid.css";

const initialDate = shift(timetableDemoNow, 0);
const ownScope: ScheduleScope = { scope: "own" };
const exportLabel = "Экспорт недели в календарь";
const label = (date: Date) => date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const serverSnapshot = () => false;

function ScheduleDatePicker({ date, onSelect }: { date: Date; onSelect: (date: Date) => void }) {
  const details = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);
  function close() {
    if (details.current) details.current.open = false;
    toggle.current?.focus();
  }
  return <details ref={details} className="sg-date-picker" onKeyDown={event => {
    if (event.key === "Escape" && details.current?.open) {
      event.stopPropagation();
      close();
    }
  }}>
    <summary ref={toggle} aria-label="Выбрать дату" title="Выбрать дату"><CalendarDays size={20} aria-hidden="true"/></summary>
    <form className="sg-date-panel" onSubmit={event => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("date");
      if (typeof value !== "string" || !value) return;
      const next = new Date(value + "T12:00:00");
      if (!Number.isFinite(next.getTime())) return;
      onSelect(next);
      close();
    }}>
      <label>Дата занятий<input key={timetableDateKey(date)} type="date" name="date" required defaultValue={timetableDateKey(date)}/></label>
      <button type="submit">Перейти</button>
    </form>
  </details>;
}
const workLabels: Record<WorkTag, string> = { "ДЗ": "Домашнее задание", "РК1": "Рубежный контроль № 1", "ЛР": "Лабораторная работа" };
function WorkTags({ lesson, day }: { lesson: TimetableLesson; day: Date }) {
  if (!lesson.workTags.length) return null;
  return <span className="sg-work-tags">{lesson.workTags.map(tag => {
    if (hasScheduleWorkDetails(lesson, tag)) {
      return <a key={tag} href={scheduleWorkHref(lesson, day, tag)} className="sg-work-trigger" data-work={tag}
        data-academic-category={scheduleTagCategory[tag]} title={workLabels[tag]} aria-label={`Открыть ${tag}: ${lesson.title}`}><span>{tag}</span></a>;
    }
    return <span key={tag} className="sg-work-tag" data-academic-category={scheduleTagCategory[tag]}
      title={workLabels[tag]} aria-label={workLabels[tag]}>{tag}</span>;
  })}</span>;
}

export type ScheduleEntry = TimetableLesson & {
  teacherHref?: string;
  lessonHref?: string;
  statusLabel?: string;
  serverAssignments?: readonly { id: string; kind: string; label: string; title: string }[];
};
export type LiveTimetable = {
  initialDate: Date;
  initialMode: ScheduleMode;
  today: Date;
  explicitDate: boolean;
  changedDate: (day: Date) => void;
  lessons: (day: Date) => ScheduleEntry[];
  hasDay: (day: Date) => boolean;
  state: (day: Date, lesson: TimetableLesson) => ReturnType<typeof timetableLessonState>;
  week: { number: number; parity: "numerator" | "denominator" } | null;
  weekStart: string;
  slots: readonly { start: string; end: string }[];
  calendarHref?: string;
  teachers: ScheduleTeacherTarget[];
};
const serverCategories: Partial<Record<string, "homework" | "control" | "lab">> = { dz: "homework", rk: "control", lr: "lab" };

function PublishedWorkTags({ lesson }: { lesson: ScheduleEntry }) {
  if (!lesson.serverAssignments?.length) return null;
  return <span className="sg-work-tags">{lesson.serverAssignments.map(work =>
    <a key={work.id} className="sg-work-trigger" data-academic-category={serverCategories[work.kind]} href={`#work/${work.id}`}
      title={work.title} aria-label={`Открыть ${work.label}: ${work.title}`}><span>{work.label}</span></a>
  )}</span>;
}

function publishedCounts(lessons: ScheduleEntry[]) {
  const works = new Map(lessons.flatMap(lesson => (lesson.serverAssignments ?? []).map(work => [work.id, work.kind])));
  const kinds = [...works.values()];
  return { homework: kinds.filter(kind => kind === "dz").length, review: kinds.filter(kind => kind === "rk").length };
}

export function ScheduleGrid({ scope = ownScope, heading, footer, live }: {
  scope?: ScheduleScope; heading?: { id: string; title: string; description?: string }; footer?: ReactNode; live?: LiveTimetable;
}) {
  const dayDescriptionPrefix = useId();
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const ownSchedule = scope.scope === "own";
  const [date, setLocalDate] = useState(live?.initialDate ?? initialDate);
  const [mode, setMode] = useState<ScheduleMode>(live?.initialMode ?? "day");
  const onDateChange = live?.changedDate;
  const fixedInitialDate = live?.explicitDate;
  function setDate(next: Date) {
    setLocalDate(next);
    onDateChange?.(next);
  }
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<Date | null>(null);
  const swipeStart = useRef<{ x: number; y: number; id: number; horizontal: boolean; onDateRow: boolean } | null>(null);
  const swiped = useRef(false);
  const daysRef = useRef<HTMLDivElement>(null);
  const dayButtonsRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const animating = useRef(false);
  const animation = useRef<Animation | null>(null);
  const mounted = useRef(true);
  const focusLesson = useRef<string | null | undefined>(undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current=false; animation.current?.cancel(); }; }, []);
  useEffect(() => {
    if (!ownSchedule) return;
    const saved = fixedInitialDate ? null : readSchedulePreference();
    if (saved) {
      setLocalDate(saved.date);
      onDateChange?.(saved.date);
      setMode(saved.mode);
    }
    setPreferencesLoaded(true);
  }, [ownSchedule, onDateChange, fixedInitialDate]);
  useEffect(() => {
    if (ownSchedule && preferencesLoaded) writeSchedulePreference({ date, mode });
  }, [ownSchedule, preferencesLoaded, date, mode]);
  useEffect(() => {
    if (mode !== "day" || focusLesson.current === undefined) return;
    const cards = daysRef.current?.querySelectorAll<HTMLElement>(".sg-mobile-selected [data-lesson-id]");
    const card = cards && Array.from(cards).find(item => item.dataset.lessonId === focusLesson.current);
    focusLesson.current = undefined;
    (card ?? dayButtonsRef.current?.querySelector<HTMLElement>("[aria-pressed=true]"))?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "nearest" });
  }, [mode]);
  const demoWeek = timetableWeek(date);
  const monday = demoWeek.monday;
  const serverWeek = live?.weekStart === timetableDateKey(monday) ? live?.week : undefined;
  const week = live ? serverWeek?.number : demoWeek.number;
  const actualParity = serverWeek?.parity ?? demoWeek.parity;
  const weekDates = scheduleWeekDays(monday);
  const groupSchedule = scope.scope === "group";
  const teacherSchedule = scope.scope === "teacher";
  const lessonsForScope = (day: Date): ScheduleEntry[] => live ? live.lessons(day) : lessonsForScheduleScope(scope, day);
  const canExport = weekDates.some(day => lessonsForScope(day).length);
  const exportQuery = new URLSearchParams({ ...scope, week: timetableDateKey(monday) });
  const download = live ? live.hasDay(date) ? live.calendarHref : undefined : `/prototype/schedule/export?${exportQuery}`;
  function adjacentDay(direction: number) { const next=shift(date,direction); return next.getDay()===0?shift(next,direction):next; }
  const previousDay=transitionTarget && transitionTarget<date?transitionTarget:adjacentDay(-1);
  const nextDay=transitionTarget && transitionTarget>date?transitionTarget:adjacentDay(1);
  const renderDates = [date, previousDay, nextDay];
  function changeParity(parity: typeof actualParity) {
    if (parity !== actualParity) setDate(shift(date, parity === "numerator" ? -7 : 7));
  }
  async function playSlide(element: HTMLElement, from: string, to: string, duration: number) {
    const motion = element.animate([{transform:from},{transform:to}],{duration,easing:"cubic-bezier(.16,1,.3,1)",fill:"forwards"});
    animation.current = motion;
    await motion.finished.catch(()=>{});
    return motion;
  }
  function setBusy(value: boolean) { animating.current=value; viewportRef.current?.setAttribute("aria-busy",String(value)); }
  async function changeDate(next: Date) {
    if(animating.current || next.toDateString() === date.toDateString()) return;
    const element = daysRef.current;
    if(!element || !matchMedia("(max-width:700px)").matches || matchMedia("(prefers-reduced-motion:reduce)").matches){
      if(element)element.style.transform="";
      setDate(next); return;
    }
    const direction = next > date ? -1 : 1;
    const width = viewportRef.current?.clientWidth || element.clientWidth;
    setBusy(true);
    flushSync(()=>setTransitionTarget(next));
    const outgoing = await playSlide(element,element.style.transform || "translate3d(0,0,0)",`translate3d(${direction*width}px,0,0)`,220);
    if(!mounted.current){outgoing.cancel();return;}
    outgoing.cancel();
    element.style.transform="";
    flushSync(()=>{setDate(next);setTransitionTarget(null);});
    setBusy(false);
  }
  async function resetDrag() {
    const element = daysRef.current;
    if(!element || !element.style.transform) return;
    if(matchMedia("(prefers-reduced-motion:reduce)").matches){element.style.transform="";return;}
    setBusy(true);
    const motion=await playSlide(element,element.style.transform,"translate3d(0,0,0)",140);
    element.style.transform="";motion.cancel();setBusy(false);
  }
  function startSwipe(event: PointerEvent<HTMLDivElement>, onDateRow = false) {
    swiped.current = false;
    if (animating.current || !event.isPrimary || !["touch", "pen"].includes(event.pointerType) ||
      mode === "day" && !onDateRow && !matchMedia("(max-width:700px)").matches) return;
    swipeStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId, horizontal: false, onDateRow };
  }
  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const start=swipeStart.current;
    if(!start || start.id !== event.pointerId || animating.current) return;
    const dx=event.clientX-start.x, dy=event.clientY-start.y;
    if(!start.horizontal && Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)*1.5) start.horizontal=true;
    if(start.horizontal && daysRef.current && !matchMedia("(prefers-reduced-motion:reduce)").matches){ const width=daysRef.current.clientWidth; daysRef.current.style.transform=`translate3d(${Math.max(-width,Math.min(width,dx))}px,0,0)`; }
  }
  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) { void resetDrag(); return; }
    event.preventDefault();
    swiped.current = true;
    if (mode === "week") {
      changeParity(dx > 0 ? "numerator" : "denominator");
    } else {
      const direction = dx > 0 ? -1 : 1;
      void changeDate(start.onDateRow ? shift(date, direction * 7) : adjacentDay(direction));
    }
    requestAnimationFrame(() => { swiped.current = false; });
  }
  function openWeekDay(day: Date, lesson?: TimetableLesson) {
    focusLesson.current = lesson?.id ?? null;
    setDate(day);
    setMode("day");
    window.scrollTo(0, 0);
  }
  const swipeHandlers = {
    onPointerDown: startSwipe,
    onPointerUp: endSwipe,
    onPointerCancel: () => { swipeStart.current = null; void resetDrag(); },
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      if (!swiped.current && !animating.current) return;
      event.preventDefault();
      event.stopPropagation();
      swiped.current = false;
    },
  };
  const modeButtons = <div className="sg-switch" role="group" aria-label="Режим расписания">
    <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}><span>День</span></button>
    <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")} disabled={!!transitionTarget}><span>Неделя</span></button>
  </div>;
  const calendarIcon = <CalendarArrowDown size={20} aria-hidden="true"/>;
  const calendarAction = canExport && download
    ? <a className="sg-calendar-export" href={download} download aria-label={exportLabel} title={exportLabel}>{calendarIcon}</a>
    : <button type="button" className="sg-calendar-export" disabled aria-label={`${exportLabel} недоступен. На этой неделе занятий нет`} title="На этой неделе занятий нет">{calendarIcon}</button>;

  const weekIndicator = <p className={`sg-week-indicator${desktop ? " sg-toolbar-week" : ""}`} aria-live="polite">
    {week && (live || weekDates.some(isTimetableDateInSemester)) ? <>{`${week}-я неделя`}{" · "}
      <strong className="sg-week-type">{actualParity === "numerator" ? "числитель" : "знаменатель"}</strong></>
      : live && !live.hasDay(date) ? "Загружаем неделю…" : "Вне семестра"}
  </p>;
  const parityButtons = <div className="sg-switch sg-parity" role="group" aria-label="Тип недели">
    <button type="button" aria-label="ЧС · числитель" aria-pressed={actualParity === "numerator"} onClick={() => changeParity("numerator")}><span>Числитель</span></button>
    <button type="button" aria-label="ЗН · знаменатель" aria-pressed={actualParity === "denominator"} onClick={() => changeParity("denominator")}><span>Знаменатель</span></button>
  </div>;
  return <div className="sg-root" data-schedule-mode={mode} data-desktop-schedule={desktop || undefined}>
    <ScheduleDirectory calendarAction={calendarAction} enabled={ownSchedule} persistent={desktop} teacherTargets={live?.teachers}
      toolbar={desktop && <div className="sg-toolbar-controls">{modeButtons}<div className="sg-week-navigation" role="group" aria-label="Переключение недели"><button type="button" aria-label="Предыдущая неделя" onClick={() => setDate(shift(date, -7))}><ChevronLeft size={20} aria-hidden="true"/></button><button type="button" aria-label="Следующая неделя" onClick={() => setDate(shift(date, 7))}><ChevronRight size={20} aria-hidden="true"/></button></div>{mode === "week" && parityButtons}</div>}
      datePicker={desktop && <ScheduleDatePicker date={date} onSelect={setDate}/>}>
      <div className="sg-heading-copy">
        <h1 id={heading?.id} tabIndex={heading ? -1 : undefined}>{heading?.title ?? "Расписание"}</h1>
        {heading?.description && <p>{heading.description}</p>}
        {desktop && weekIndicator}
      </div>
    </ScheduleDirectory>
    {!desktop && modeButtons}
    {mode === "week" ? <div className="sg-week-content" {...swipeHandlers}>
      {!desktop && parityButtons}
      <ScheduleWeek key={actualParity} dates={weekDates} parity={actualParity} showGroup={teacherSchedule}
        lessonsForDay={lessonsForScope} onOpenDay={openWeekDay} slots={live?.slots} statusForLesson={live?.state}
        loading={Boolean(live && !live.hasDay(date))}/>
      {footer}
    </div> : <>
    <div className="sg-mobile-week">
      {!desktop && weekIndicator}
      <div className="sg-mobile-days" ref={dayButtonsRef} role="group" aria-label="День недели"
      {...swipeHandlers} onPointerDown={event => startSwipe(event, true)}>
      {weekDates.map(day => {
        const counts = groupSchedule ? null : live ? publishedCounts(lessonsForScope(day))
          : scheduleWorkCounts(lessonsForScope(day).filter(lesson => lesson.group === timetableOwnGroup), day);
        const descriptionId = `${dayDescriptionPrefix}-${day.getTime()}`;
        return <div className="sg-date-cell" key={day.getTime()}><button type="button" className="sg-date-control"
          aria-label={day.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
          aria-describedby={counts && (counts.homework || counts.review) ? descriptionId : undefined}
          aria-pressed={day.toDateString() === date.toDateString()}
          aria-current={day.toDateString() === (live?.today ?? initialDate).toDateString() ? "date" : undefined}
          onClick={() => changeDate(day)}>
          <strong>{day.getDate()}</strong>
          <span className="sg-weekday-caption">{day.toLocaleDateString("ru-RU", { weekday: "short" })}</span>
        </button>
          {counts && <ScheduleWorkCounters counts={counts} descriptionId={descriptionId}/>}
        </div>;
      })}
    </div></div>
    <div className="sg-swipe-area" {...swipeHandlers} onPointerMove={moveSwipe}>
    <div className="sg-days-viewport" ref={viewportRef} aria-busy="false"><div className="sg-grid-days" ref={daysRef}>{renderDates.map(day => {
      const selected = day.getTime() === date.getTime();
      const inSemester = isTimetableDateInSemester(day);
      const visibleItems = lessonsForScope(day);
      const position = selected ? "selected" : day.getTime() === previousDay.getTime() ? "before" : "after";
      return <section key={day.getTime()} className={`sg-day-panel sg-mobile-${position}`} aria-hidden={!selected || undefined} inert={!selected} aria-label={label(day)}>
      <div className="sg-mobile-agenda">
        {visibleItems.map(item => {
          const state = (live?.state ?? timetableLessonState)(day, item);
          const current = state === "current";
          const past = state === "past";
          return <article key={item.id} className={`sg-agenda-item${past ? " sg-past" : ""}`} tabIndex={-1} data-lesson-id={item.id}
            data-parity={item.parity} data-current={current || undefined}
            aria-label={`${current ? "Сейчас: " : past ? "Завершено: " : ""}${item.title}`}>
          <div className="sg-agenda-times">
            <time dateTime={item.time}>{item.time}</time>
            <time dateTime={item.end}>{item.end}</time>
          </div>
          <div className="sg-agenda-body">
            <div className="sg-agenda-card-head">
              <h3>{item.lessonHref ? <a className="sg-lesson-title-link" href={item.lessonHref}>{item.title}</a> : item.title}</h3>
              {live ? <PublishedWorkTags lesson={item}/> : !groupSchedule && item.group === timetableOwnGroup && <WorkTags lesson={item} day={day}/>}
            </div>
            <div className="sg-agenda-teacher"><span className="sg-teacher-avatar" aria-hidden="true">{item.teacher.split(" ").slice(0,2).map(word=>word[0]).join("")}</span>{item.teacherHref ? <a className="p-teacher-link" href={item.teacherHref}>{item.teacher}</a>
              : live ? <span>{item.teacher}</span> : <TeacherLink name={item.teacher}/>}</div>
            <div className="sg-agenda-footer">
              <p className={`sg-agenda-room${item.previousRoom ? " sg-agenda-moved" : ""}`}>{item.previousRoom ? `${item.previousRoom} → ${item.room}` : item.room}{teacherSchedule && item.group ? ` · ${item.group}` : ""}</p>
              {item.statusLabel && !item.previousRoom && <span className="sg-published-status">{item.statusLabel}</span>}
              <span className="sg-lesson-kind" data-kind={timetableLessonKinds[item.kind]}>{item.kind === "Лабораторная работа" ? "Лаб. работа" : item.kind}</span>
            </div>
          </div>
        </article>;
        })}
        {visibleItems.length === 0 && <p className="sg-agenda-empty">{live ? live.hasDay(day) ? "Занятий нет" : "Загружаем занятия…" : inSemester ? "Занятий нет" : "Вне осеннего семестра"}</p>}
      </div>
    </section>})}</div></div>
    {footer}
    </div>
    </>}
  </div>;
}
