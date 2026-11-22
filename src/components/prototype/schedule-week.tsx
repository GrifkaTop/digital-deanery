import type { CSSProperties } from "react";
import { timetableLessonKinds, timetableLessonState, timetableSlots, type TimetableLesson } from "./academic-data";
import "./schedule-week.css";

const dayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const subjectCode = (title: string) => title.trim().split(/\s+/u).map(word => Array.from(word)[0] ?? "").join("").toLocaleUpperCase("ru-RU");
export function ScheduleWeek({ dates, parity, showGroup, lessonsForDay, onOpenDay, slots = timetableSlots,
  statusForLesson = timetableLessonState, loading }: {
  dates: Date[];
  parity: "numerator" | "denominator";
  showGroup?: boolean;
  lessonsForDay: (day: Date) => TimetableLesson[];
  onOpenDay: (day: Date, lesson?: TimetableLesson) => void;
  slots?: readonly { start: string; end: string }[];
  statusForLesson?: (day: Date, lesson: TimetableLesson) => ReturnType<typeof timetableLessonState>;
  loading?: boolean;
}) {
  const days = dates.map(date => ({ date, lessons: lessonsForDay(date) }));
  return <section className="sw-week" data-parity={parity} aria-label="Занятия на неделю" style={{ "--sw-slot-count": Math.max(1, slots.length) } as CSSProperties}>
    <div className="sw-surface">
      <div className="sw-head"><span>Время</span>{days.map(({ date }) => (
        <button type="button" key={date.getTime()} className="sg-date-control" aria-label={dayLabel.format(date)} onClick={() => onOpenDay(date)}>
          <strong className="sg-weekday-caption">{weekday.format(date)}</strong>
        </button>
      ))}</div>
      <div className="sw-timeline">
        <div className="sw-hours" aria-hidden="true">{slots.map(({ start, end }) => <div className="sw-time" key={`${start}-${end}`}>
          <time dateTime={start}>{start}</time><time dateTime={end}>{end}</time>
        </div>)}</div>
        {days.map(({ date, lessons }) => <div className="sw-day" role="group" aria-label={dayLabel.format(date)} key={date.getTime()}>
          {slots.map(({ start, end }) => {
            const scheduled = lessons.filter(item => item.time === start && item.end === end);
            return <div className="sw-slot" key={`${start}-${end}`} data-start={start}>
              {scheduled.map(lesson => {
                const current = statusForLesson(date, lesson) === "current";
                return <button key={lesson.id} type="button" className="sw-lesson" data-kind={timetableLessonKinds[lesson.kind]} data-current={current || undefined}
                aria-label={`${current ? "Сейчас: " : ""}${lesson.title}, ${lesson.kind}, ${lesson.time}–${lesson.end}, ${lesson.room}, ${lesson.teacher}${showGroup ? `, ${lesson.group}` : ""}`}
                title={`${lesson.title} · ${lesson.kind} · ${lesson.time}–${lesson.end} · ${lesson.room}`}
                onClick={() => onOpenDay(date, lesson)}>
                <strong><span className="sw-code">{subjectCode(lesson.title)}</span><span className="sw-title">{lesson.title}</span></strong>
                <span className="sw-room">{showGroup ? lesson.group : lesson.room.split(" · ")[0]}</span>
                <span className="sw-desktop-meta" aria-hidden="true"><span>{lesson.time}–{lesson.end} · {lesson.kind}</span><span>{lesson.teacher}</span><span>{lesson.room}{showGroup && lesson.group ? ` · ${lesson.group}` : ""}</span></span>
              </button>;
              })}
            </div>;
          })}
        </div>)}
      </div>
      {!days.some(day => day.lessons.length) && <p className="sw-empty">{loading ? "Загружаем занятия…" : "На этой неделе занятий нет"}</p>}
    </div>
    <ul className="sw-legend" aria-label="Типы занятий">{Object.entries(timetableLessonKinds).map(([label, kind]) => <li key={kind} className="sg-lesson-kind" data-kind={kind}><span aria-hidden="true"/>{label}</li>)}</ul>
  </section>;
}
