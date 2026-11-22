"use client";

import { CalendarDays, ChevronRight, CircleAlert, Clock3 } from "lucide-react";
import { addDays, mondayOf } from "@/contracts/calendar";
import type { AcademicCategory } from "./academic-categories";
import { FoldSection } from "./fold-section";
import "./deadline-list.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

export type DeadlineBoardItem = {
  id: string;
  dueOn: string;
  title: string;
  subject?: string | null;
  tag: string;
  category?: AcademicCategory;
  href: string;
};

function WorkList({ items, empty }: { items: DeadlineBoardItem[]; empty?: string }) {
  if (!items.length) return <p className="dld-empty">{empty}</p>;
  return <ul className="dld-task-list">
    {items.map(({ id, dueOn, title, subject, tag, category, href }) => {
      const date = new Date(dueOn);
      const parts = dateFormat.formatToParts(date);
      const label = [dateFormat.format(date), tag, subject, title].filter(Boolean).join(". ");

      return <li key={id}>
        <a className="dld-task-link" id={"deadline-link-" + id} href={href} aria-label={label}>
          <time className="dld-task-date" dateTime={dueOn}>
            <strong>{parts.find(part => part.type === "day")?.value}</strong>{" "}
            <span>{parts.find(part => part.type === "month")?.value}</span>
          </time>
          <span className="dld-task">
            <span className="dld-task-primary">
              <span className="dld-task-type" data-academic-category={category}>{tag}</span>
              <strong className="dld-task-subject">{subject || title}</strong>
            </span>
            {subject && <span className="dld-task-title">{title}</span>}
          </span>
          <ChevronRight className="dld-task-chevron" size={16} aria-hidden="true"/>
        </a>
      </li>;
    })}
  </ul>;
}

function LaterWeeks({ items, today }: { items: DeadlineBoardItem[]; today: string }) {
  if (!items.length) return <p className="dld-empty">В этом семестре больше нет сроков.</p>;

  const thisMonday = mondayOf(today);
  const nextMonday = addDays(thisMonday, 7);
  const weeks = new Map<string, DeadlineBoardItem[]>();
  for (const item of items) {
    const monday = mondayOf(item.dueOn);
    const group = weeks.get(monday);
    if (group) group.push(item);
    else weeks.set(monday, [item]);
  }

  return <>{Array.from(weeks, ([monday, works]) => {
    const sunday = addDays(monday, 6);
    const label = monday === thisMonday ? "На этой неделе"
      : monday === nextMonday ? "На следующей неделе"
        : dateFormat.formatRange(new Date(monday), new Date(sunday));
    return <section className="dld-later-week" key={monday} data-week-start={monday} data-week-end={sunday}>
      <h3>{label}</h3>
      <WorkList items={works}/>
    </section>;
  })}</>;
}

export function DeadlineBoard({ today, items }: { today: string; items: DeadlineBoardItem[] }) {
  const overdue: DeadlineBoardItem[] = [];
  const dueToday: DeadlineBoardItem[] = [];
  const later: DeadlineBoardItem[] = [];
  for (const item of [...items].sort((a, b) => a.dueOn.localeCompare(b.dueOn))) {
    if (item.dueOn < today) overdue.push(item);
    else if (item.dueOn === today) dueToday.push(item);
    else later.push(item);
  }

  return <section className="deadline-list" aria-labelledby="deadline-list-title">
    <div className="p-page-heading"><div>
      <h1 id="deadline-list-title" tabIndex={-1}>Дедлайны</h1><p>Текущий семестр · на {dateFormat.format(new Date(today))}</p>
    </div></div>
    <div className="dld-layout">
      <div className="dld-priority-groups">
        <FoldSection title="Просрочено" headingId="deadline-overdue-title" className="dld-panel dld-overdue"
          headingClassName="dl-section-heading" bodyClassName="dld-status-works" leading={<CircleAlert className="dld-heading-icon" size={20} aria-hidden="true"/>}
          meta={<span className="dld-count">{overdue.length}</span>}>
          <WorkList items={overdue} empty="Просроченных работ нет."/>
        </FoldSection>
        <FoldSection title="Сегодня" headingId="deadline-today-title" className="dld-panel dld-today"
          headingClassName="dl-section-heading" bodyClassName="dld-status-works" leading={<Clock3 className="dld-heading-icon" size={20} aria-hidden="true"/>}
          meta={<span className="dld-count">{dueToday.length}</span>}>
          <WorkList items={dueToday} empty="На сегодня сроков нет."/>
        </FoldSection>
      </div>
      <FoldSection title="Предстоящие" headingId="deadline-later-title" className="dld-panel dld-later"
        headingClassName="dl-section-heading" bodyClassName="dld-status-works" leading={<CalendarDays className="dld-heading-icon" size={20} aria-hidden="true"/>}
        meta={<span className="dld-count">{later.length}</span>}>
        <LaterWeeks items={later} today={today}/>
      </FoldSection>
    </div>
  </section>;
}
