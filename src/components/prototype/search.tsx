"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { subjects, teacherNames, teacherIds } from "./academic-data";
import { demoScheduleGroups } from "./schedule-directory-data";

export type ScheduleTeacherTarget = { title: string; description: string; href: string };
const teachers = teacherNames.map((title, index) => ({
  title, description: subjects[index], href: `#teacher/${teacherIds[index]}`,
}));
const groups = demoScheduleGroups.map(({ id, code, description }) => ({
  id, title: code, description, href: `#group/${id}`,
}));

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
const normalizedCode = (value: string) => normalized(value).replace(/[-\s\u2010-\u2015\u2212]/gu, "");

export function findScheduleTargets(query: string, teacherTargets: ScheduleTeacherTarget[] = teachers) {
  const name = normalized(query.trim());
  if (!name) return { teachers: teacherTargets, groups };

  const words = name.split(/\s+/u);
  const code = normalizedCode(query);
  return {
    teachers: teacherTargets.filter(item => words.every(word => normalized(item.title).includes(word))),
    groups: code ? groups.filter(group => normalizedCode(group.title).includes(code) || normalizedCode(group.id).includes(code)) : [],
  };
}

export function ScheduleDirectory({ children, calendarAction, enabled = true, teacherTargets, toolbar, datePicker, persistent = false }: {
  children: ReactNode; calendarAction?: ReactNode; enabled?: boolean; teacherTargets?: ScheduleTeacherTarget[];
  toolbar?: ReactNode; datePicker?: ReactNode; persistent?: boolean;
}) {
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) field.current?.focus(); }, [open]);

  const results = findScheduleTargets(query, teacherTargets);
  const count = results.teachers.length + results.groups.length;
  const lists = [
    { title: "Преподаватели", items: results.teachers },
    { title: "Группы", items: results.groups },
  ];

  return <div className="sg-directory" onKeyDown={event => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    toggle.current?.focus();
  }}>
    <header className="sg-mobile-heading">
      {children}
      {toolbar}
      <div className="sg-heading-actions">
        {datePicker}
        {calendarAction}
        {enabled && !persistent && <button type="button" className="sg-directory-toggle" ref={toggle} aria-label="Поиск расписания"
          aria-expanded={open} aria-controls={open ? panelId : undefined} title="Поиск расписания" onClick={() => setOpen(value => !value)}>
          <Search size={20} aria-hidden="true"/>
        </button>}
      </div>
    </header>
    {enabled && (open || persistent) && <section className="sg-directory-panel" id={panelId} aria-label="Поиск расписания">
      <div className="p-global-search">
        <Search size={19} aria-hidden="true"/>
        <input ref={field} type="search" aria-label="Фамилия преподавателя или код группы"
          placeholder="Фамилия или код группы" value={query} maxLength={100} autoComplete="off"
          onChange={event => setQuery(event.target.value)}/>
        {query && <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(""); field.current?.focus(); }}>
          <X size={18} aria-hidden="true"/>
        </button>}
      </div>
      <p className="p-search-count" role="status">
        {count === 0 ? "Ничего не найдено. Попробуйте другую фамилию или код группы." : query.trim() ? `Найдено: ${count}` : ""}
      </p>
      {lists.map(({ title, items }) => items.length > 0 && <div className="sg-directory-section" key={title}>
        <h2>{title}</h2>
        <div className="p-search-results">{items.map(item => <a href={item.href} key={item.href}>
          <span><strong>{item.title}</strong><small>{item.description}</small></span>
          <ArrowRight size={18} aria-hidden="true"/>
        </a>)}</div>
      </div>)}
    </section>}
  </div>;
}
