"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Bell, BookOpen, GraduationCap, CalendarCheck, Check, ChevronRight, FileText, HeartPulse, LibraryBig, LogOut, Moon, Palette, Settings, Shield, Sun, Trophy, type LucideIcon } from "lucide-react";
import type { Profile } from "@/contracts/auth";
import { inboxList } from "@/contracts/inbox";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { atlasProfileInitials } from "./atlas-shell";
import { PrototypePass } from "./home";
import "./profile.css";

const tabs = ["Основное", "Настройки", "Ещё"];
const overviewGroups = [
  { id: "study", title: "Учёба", links: [
    { title: "Учебный план", href: "#plan", icon: GraduationCap },
    { title: "Успеваемость", href: "#study", icon: BookOpen },
    { title: "Сессия", href: "#session", icon: CalendarCheck },
    { title: "Физкультура", href: "#sports", icon: Trophy },
    { title: "ВУЦ", href: "#vuc", icon: Shield },
  ] },
  { id: "services", title: "Сервисы", links: [
    { title: "Библиотека", href: "#library", icon: LibraryBig },
    { title: "Поликлиника", href: "#clinic", icon: HeartPulse },
  ] },
  { id: "documents", title: "Документы", links: [
    { title: "Услуги и заявки", href: "#services", icon: FileText, tag: "Справки" },
  ] },
];
const themes = [
  { value: "light", title: "Светлая", icon: Sun },
  { value: "dark", title: "Тёмная", icon: Moon },
  { value: "system", title: "Как на устройстве", icon: Settings },
];

function ProfileLink({ title, href, icon: Icon, count, tag }: { title: string; href: string; icon: LucideIcon; count?: number; tag?: string }) {
  return <a className="pr-link" href={href} id={href === "#clinic" || href === "#vuc" ? "profile-" + href.slice(1) : undefined}
    aria-label={tag ? title : undefined} aria-description={tag}>
    <Icon size={21} aria-hidden="true"/><span>{title}</span>
    {tag && <small className="pr-doc-tag" aria-hidden="true">{tag}</small>}
    {!!count && <span className="pr-unread" aria-label={`${count} непрочитанных`}>{count}</span>}
    <ChevronRight className="pr-chevron" size={17} aria-hidden="true"/>
  </a>;
}

function ProfileOverview({ unread }: { unread: number }) {
  return <nav className="pr-overview" aria-label="Основные разделы профиля">
    <div className="pr-link-list">
      <ProfileLink title="Уведомления" href="#inbox" icon={Bell} count={unread}/>
    </div>
    {overviewGroups.map(({ id, title, links }) => {
      const headingId = `pr-overview-${id}`;
      return <section key={id} aria-labelledby={headingId}>
        <h2 className="pr-group-title" id={headingId}>{title}</h2>
        <div className="pr-link-list">
          {links.map(link => <ProfileLink key={link.href} {...link}/>)}
        </div>
      </section>;
    })}
  </nav>;
}

type ProfileOptions = {
  unread: number;
  theme: string;
  onThemeChange: (value: string) => void;
  showInboxCount: boolean;
  onToggleInboxCount: () => void;
};

function ThemeOptions({ theme, onThemeChange, compact = false }: Pick<ProfileOptions, "theme" | "onThemeChange"> & { compact?: boolean }) {
  return <div className={compact ? "pr-theme-options pr-theme-compact" : "pr-theme-options"} role="group" aria-label="Тема интерфейса">
    {(compact ? [themes[2], themes[0], themes[1]] : themes).map(({ value, title, icon: Icon }) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => onThemeChange(value)}>
      <Icon size={compact ? 17 : 21} aria-hidden="true"/><span>{compact && value === "system" ? "Системная" : title}</span>
      {!compact && theme === value && <Check size={18} aria-hidden="true"/>}
    </button>)}
  </div>;
}

const noticeDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

function DesktopProfile({ profile, logout, unread, theme, onThemeChange, showInboxCount, onToggleInboxCount, onUnauthorized }: ProfileOptions & {
  profile: Profile; logout: () => void; onUnauthorized: () => void;
}) {
  const course = `${profile.course} курс`;
  const studyDetails = [
    ["Факультет", profile.faculty],
    ["Направление", profile.program],
    ["Курс и группа", `${course} · ${profile.group}`],
    ["Статус обучения", "Студент"],
  ];
  return <div className="pr-desktop">
    <header className="pr-desktop-identity">
      <span className="pr-avatar" aria-hidden="true">{atlasProfileInitials(profile.fullName)}</span>
      <div className="pr-desktop-name">
        <h1>{profile.fullName}</h1>
        <ul className="pr-desktop-meta" aria-label="Сведения о студенте">
          {[profile.educationLevel, course, profile.group].filter(Boolean).map(value => <li key={value}>{value}</li>)}
        </ul>
      </div>
      <div className="pr-desktop-controls">
        <PrototypePass className="p-secondary pr-pass">Показать пропуск</PrototypePass>
        <button className="p-secondary" type="button" onClick={logout}><LogOut size={17} aria-hidden="true"/>Выйти</button>
      </div>
    </header>
    <div className="pr-desktop-layout">
      <div className="pr-desktop-primary">
        <section className="pr-desktop-panel" aria-labelledby="pr-academic">
          <div className="pr-desktop-heading"><h2 id="pr-academic">Академические данные</h2><a href="#session">Сессия <ChevronRight size={15} aria-hidden="true"/></a></div>
          <dl className="pr-facts">{studyDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </section>
        <section className="pr-desktop-panel pr-recent" aria-labelledby="pr-recent">
          <div className="pr-desktop-heading">
            <h2 id="pr-recent">Последние уведомления {unread > 0 && <span className="pr-unread" aria-label={`${unread} непрочитанных`}>{unread}</span>}</h2>
            <a href="#inbox">Все уведомления <ChevronRight size={15} aria-hidden="true"/></a>
          </div>
          <Resource url="/api/v1/inbox" schema={inboxList} onUnauthorized={onUnauthorized}>
            {({ items }) => items.length ? <ul>{items.slice(0, 3).map(letter => <li key={letter.id}>
              <span>{!letter.readAt && <span className="pr-recent-dot"><span className="sr-only">Непрочитанное. </span></span>}{letter.context?.type === "room_change" ? "Смена аудитории" : letter.title}</span>
              <small>{noticeDate.format(new Date(letter.publishedAt))}</small>
            </li>)}</ul> : <p>Уведомлений пока нет.</p>}
          </Resource>
        </section>
      </div>
      <section className="pr-desktop-panel pr-quick-settings" aria-labelledby="pr-quick-settings">
        <h2 id="pr-quick-settings">Быстрые настройки</h2>
        <h3>Тема интерфейса</h3>
        <ThemeOptions theme={theme} onThemeChange={onThemeChange} compact/>
        <h3>Уведомления</h3>
        <label className="pr-inbox-preference"><input type="checkbox" checked={showInboxCount} onChange={onToggleInboxCount}/>Показывать счётчик в шапке</label>
        <ProfileLink title="Цветовая палитра" href="#settings" icon={Palette}/>
      </section>
    </div>
  </div>;
}

export function PrototypeProfile(options: ProfileOptions) {
  const { unread, theme, onThemeChange } = options;
  const atlas = useAtlasSession();
  const [tab, setTab] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function changeTab(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(next); tabRefs.current[next]?.focus();
  }
  if (atlas?.session.state !== "ready") return null;
  const { profile } = atlas.session;
  const course = `${profile.course} курс`;
  const details = [
    ["Группа", profile.group],
    ["Курс", course],
    ["Текущий семестр", profile.currentSemester],
    ["Форма обучения", profile.studyMode],
    ["Направление", profile.program],
    ["Факультет", profile.faculty],
    ["Студенческий билет", profile.studentNumber],
    ["Электронная почта", profile.email],
  ];
  return <section className="pr-root" aria-label="Профиль студента">
    <DesktopProfile {...options} profile={profile} logout={atlas.logout} onUnauthorized={atlas.onUnauthorized}/>
    <div className="pr-mobile">
    <header className="pr-identity">
      <div><h1>{profile.fullName}</h1><p>{[profile.educationLevel, course, profile.group].filter(Boolean).join(" · ")}</p></div>
      <span className="pr-avatar" aria-hidden="true">{atlasProfileInitials(profile.fullName)}</span>
    </header>
    <div className="pr-tabs" role="tablist" aria-label="Разделы профиля">{tabs.map((title, index) => <button key={title} ref={node => { tabRefs.current[index] = node; }} id={`pr-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls={`pr-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => changeTab(event, index)}>{title}</button>)}</div>
    <div role="tabpanel" id={`pr-panel-${tab}`} aria-labelledby={`pr-tab-${tab}`} className="pr-content">
      {tab === 0 && <ProfileOverview unread={unread}/>}
      {tab === 1 && <><h2 className="pr-group-title">Тема интерфейса</h2><ThemeOptions theme={theme} onThemeChange={onThemeChange}/><nav aria-label="Настройки оформления"><ProfileLink title="Цветовая палитра" href="#settings" icon={Palette}/></nav><button className="p-secondary pr-logout" type="button" onClick={atlas.logout}>Выйти</button></>}
      {tab === 2 && <><h2 className="pr-group-title">Личные данные</h2><dl className="pr-data">{details.map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value || "Не указано"}</dd></div>)}</dl></>}
    </div>
    </div>
  </section>;
}
