"use client";

import type { ComponentPropsWithoutRef, MouseEventHandler, ReactNode } from "react";
import {
  Bell, BookOpen, BotMessageSquare, CalendarDays, Clock3, FileText, GraduationCap,
  HeartPulse, Home, LibraryBig, Settings, Shield, Trophy, UserRound,
} from "lucide-react";
import type { Profile } from "@/contracts/auth";

const atlasNavigation = [{
  title: "Учёба",
  links: [
    { id: "today", label: "Главная", icon: Home },
    { id: "schedule", label: "Расписание", icon: CalendarDays },
    { id: "study", label: "Успеваемость", icon: BookOpen },
    { id: "plan", label: "Учебный план", icon: GraduationCap },
    { id: "deadlines", label: "Дедлайны", icon: Clock3 },
    { id: "sports", label: "Физкультура", icon: Trophy },
    { id: "vuc", label: "ВУЦ", icon: Shield },
  ],
}, {
  title: "Сервисы",
  links: [
    { id: "services", label: "Услуги и заявки", icon: FileText },
    { id: "library", label: "Библиотека", icon: LibraryBig },
    { id: "clinic", label: "Поликлиника", icon: HeartPulse },
  ],
}] as const;

export const atlasMobileTabs = [
  { id: "today", label: "Главная", icon: Home },
  { id: "schedule", label: "Расписание", icon: CalendarDays },
  { id: "assistant", label: "ИИ-помощник", icon: BotMessageSquare },
  { id: "deadlines", label: "Дедлайны", icon: Clock3 },
  { id: "profile", label: "Профиль", icon: UserRound },
] as const;

export function atlasProfileInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

export function AtlasSidebar({ active, baseHref = "", servicesHref, profile, onLinkClick }: {
  active: string;
  baseHref?: string;
  servicesHref?: string;
  profile?: Pick<Profile, "fullName" | "group">;
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return <aside className="p-sidebar">
    <a href={`${baseHref}#today`} className="p-wordmark" onClick={onLinkClick}>
      <span className="p-mark"><GraduationCap size={23} aria-hidden="true"/></span>Деканат<span className="p-brand-dot">.</span>
    </a>
    <div className="p-sidebar-ai-slot">
      <a className="p-sidebar-ai" href={`${baseHref}#assistant`} onClick={onLinkClick} aria-current={active === "assistant" ? "page" : undefined}>
        <span className="p-sidebar-ai-label"><BotMessageSquare size={19} aria-hidden="true"/><span>ИИ-помощник</span></span>
        <span className="p-sidebar-ai-badge" aria-hidden="true">AI</span>
      </a>
    </div>
    <nav className="p-desktop-nav" aria-label="Основная навигация">
      {atlasNavigation.map(({ title, links }) => <div className="p-nav-group" key={title}>
        <p>{title}</p>
        {links.map(({ id, label, icon: Icon }) => <a key={id} id={id === "vuc" || id === "clinic" ? `atlas-nav-${id}` : undefined}
          href={id === "services" && servicesHref ? servicesHref : `${baseHref}#${id}`}
          onClick={onLinkClick} aria-current={active === id ? "page" : undefined}><Icon size={18} aria-hidden="true"/>{label}</a>)}
      </div>)}
    </nav>
    <div className="p-sidebar-bottom">
      <a href={`${baseHref}#settings`} onClick={onLinkClick} aria-current={active === "settings" ? "page" : undefined}><Settings size={18} aria-hidden="true"/>Оформление</a>
      {profile && <a className="p-sidebar-profile" href={`${baseHref}#profile`} onClick={onLinkClick} aria-current={active === "profile" ? "page" : undefined}>
        <span className="p-profile-monogram" aria-hidden="true">{atlasProfileInitials(profile.fullName)}</span>
        <span><strong>{profile.fullName}</strong><small>{profile.group}</small></span>
      </a>}
    </div>
  </aside>;
}

export function AtlasDesktopBar({ term, pass, inboxHref = "#inbox", inboxActive, unread = 0, showInboxCount = true, onLinkClick }: {
  term?: string | number | null;
  pass?: ReactNode;
  inboxHref?: string;
  inboxActive?: boolean;
  unread?: number;
  showInboxCount?: boolean;
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return <header className="p-desktop-bar" aria-label="Действия кабинета"><div className="p-desktop-bar-inner">
    <span className="p-desktop-term">{term}</span>
    <div className="p-desktop-actions">
      {pass}
      <a className="p-desktop-inbox" href={inboxHref} onClick={onLinkClick} aria-current={inboxActive ? "page" : undefined}
        aria-label={unread > 0 ? `Уведомления: ${unread} непрочитанных` : "Уведомления"} title="Уведомления">
        <Bell size={20} aria-hidden="true"/>
        {showInboxCount && unread > 0 && <span className="p-floating-count" aria-hidden="true">{unread}</span>}
      </a>
    </div>
  </div></header>;
}

export function AtlasBottomNavigation({ active, baseHref = "", keyboardOpen, onLinkClick, ...handlers }: {
  active: string;
  baseHref?: string;
  keyboardOpen?: boolean;
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
} & Pick<ComponentPropsWithoutRef<"nav">, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onClickCapture">) {
  return <nav {...handlers} className={`p-bottom-nav${keyboardOpen ? " p-keyboard-open" : ""}`} aria-label="Быстрая навигация">
    {atlasMobileTabs.map(({ id, label, icon: Icon }) => <a key={id} href={`${baseHref}#${id}`}
      aria-label={label} aria-current={active === id ? "page" : undefined} onClick={onLinkClick}>
      <span className="p-bottom-icon"><Icon size={26} strokeWidth={1.9} aria-hidden="true"/></span>
      <span className="p-bottom-label">{label}</span>
    </a>)}
  </nav>;
}
