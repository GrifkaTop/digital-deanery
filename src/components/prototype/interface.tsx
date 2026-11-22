"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Bell, Check, Moon, Settings, Sun } from "lucide-react";
import { studyPlanResponse } from "@/contracts/study-plan";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { useInboxBadge } from "../inbox-views";
import { LivePrototypeInbox } from "./live-prototype-inbox";
import type { RequestMemory } from "../request-views";
import { LiveAtlasRequests } from "./live-requests";
import { Clinic } from "./clinic";
import { Library, LibraryLoans } from "./library";
import { LiveAcademics } from "./live-academics";
import { LiveContent } from "./live-content";
import { LiveSports } from "./live-sports";
import { Vuc, type VucChecklistItem } from "./vuc";
import { PrototypeProfile } from "./profile";
import { AcademicPlan } from "./study-plan";
import { AtlasSessionCalendar } from "./atlas-session-calendar";
import { PrototypeHome, PrototypePass } from "./home";
import { HomeCalendar } from "./home-calendar";
import { EventsArchive } from "./home-events";
import { AtlasSidebar, AtlasDesktopBar, AtlasBottomNavigation, atlasMobileTabs } from "./atlas-shell";
import { AtlasBreadcrumbs } from "./atlas-breadcrumbs";
import { HomeDetail } from "./home-detail";
import { NewsArchive } from "./home-news";
import type { HomeDetailRoute } from "./home-content";
import { AssistantChat } from "./assistant-chat";
import { WorkPage } from "./work-page";
import "./interface.css";
import "./desktop-shell.css";
import "./academic-categories.css";

type HomeOrigin = "today" | "events" | "all-events" | "news";
type Section = HomeOrigin | "deadlines" | "teacher" | "group" | "schedule" | "study" | "session" | "plan" | "services" | "sports" | "inbox" | "profile" | "settings" | "assistant" | "home-detail" | "work" | "lesson" | "requests" | "library" | "library-loans" | "clinic" | "vuc";
type RouteReturn = { origin: Section; fromHash: string; targetHash: string; link: HTMLAnchorElement; scrollY: number };
const normalLinkClick = (event: MouseEvent) => !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
const isAcademicRoute = (hash: string) => /^#(?:plan|session|study(?:\/[^/?]+)?)(?:\?|$)/.test(hash);

function RouteBack({ entry, fallback, current, desktopHidden }: {
  entry?: RouteReturn; fallback: string; current: string; desktopHidden?: boolean;
}) {
  const href = entry?.fromHash ?? fallback;
  const parent = href.slice(1).split(/[/?]/, 1)[0] as Section;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (entry && normalLinkClick(event)) {
      event.preventDefault();
      history.back();
    }
  };
  const ancestors = parent === "group" ? [{ label: labels.schedule, href: "#schedule" }] : [];
  return <AtlasBreadcrumbs current={current} className={desktopHidden ? "p-top-level-back" : undefined}
    onHome={parent === "today" ? onClick : undefined}
    parents={parent === "today" ? [] : [...ancestors, { label: labels[parent] ?? "Профиль", href, onClick }]}/>;
}

function BottomNavigation({ section, keyboardOpen, onNavigate }: { section: Section; keyboardOpen: boolean; onNavigate: (section: Section) => void }) {
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  function start(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary) return;
    suppressClick.current = false;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  function finish(event: PointerEvent<HTMLElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    swipe.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClick.current = true;
    event.preventDefault();
    const current = atlasMobileTabs.findIndex(tab => tab.id === section);
    const origin = current >= 0 ? current : atlasMobileTabs.findIndex(tab => tab.id === (section === "teacher" ? "schedule" : "profile"));
    const next = atlasMobileTabs[origin + (dx < 0 ? 1 : -1)];
    if (next) onNavigate(next.id);
  }

  return <AtlasBottomNavigation active={section} keyboardOpen={keyboardOpen}
    onPointerDown={start} onPointerUp={finish} onPointerCancel={event => { if (swipe.current?.id === event.pointerId) swipe.current = null; }}
    onClickCapture={event => {
      if (suppressClick.current && event.detail !== 0) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    }} onLinkClick={() => window.scrollTo({ top: 0, behavior: "instant" })}/>;
}

const labels: Record<Section, string> = { deadlines: "Дедлайны", teacher: "Расписание преподавателя", group: "Расписание группы", today: "Главная", schedule: "Расписание", study: "Успеваемость", session: "Сессия", plan: "Учебный план", services: "Услуги", sports: "Спорт", inbox: "Входящие", profile: "Профиль", settings: "Оформление", assistant: "Помощник", events: "Календарь событий", "all-events": "Все события", news: "Все новости", "home-detail": "Новости и события", work: "Учебная работа", lesson: "Пара", requests: "Мои заявки", library: "Библиотека", "library-loans": "Мои книги", clinic: "Поликлиника", vuc: "ВУЦ" };
const isServerId = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value);

export default function InterfacePrototype() {
  const auth = useAtlasSession()!;
  const profile = auth.session.state === "ready" ? auth.session.profile : null;
  const badge = useInboxBadge(auth.session.state === "ready" ? auth.session.generation : null, auth.onUnauthorized);
  const requestMemory = useRef<RequestMemory>({});
  const [vucChecklist, setVucChecklist] = useState<ReadonlySet<VucChecklistItem>>(() => new Set());
  const positions = useRef(new Map<string, { y: number; id: string }>());
  const campusReturn = useRef<RouteReturn | undefined>(undefined);
  const inboxReturn = useRef<RouteReturn | undefined>(undefined);
  const lessonReturn = useRef<RouteReturn | undefined>(undefined);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [chatKeyboardOpen, setChatKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardOpen(window.innerHeight - viewport.height > 150 && document.activeElement?.matches("input, textarea") === true);
    viewport.addEventListener("resize", update);
    document.addEventListener("focusout", update);
    return () => { viewport.removeEventListener("resize", update); document.removeEventListener("focusout", update); };
  }, []);
  const [teacherId, setTeacherId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [section, setSection] = useState<Section>("today");
  const [routeHash, setRouteHash] = useState("#today");
  const [detailRoute, setDetailRoute] = useState<HomeDetailRoute | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<HomeOrigin>("today");
  const homeReturn = useRef<{ origin: HomeOrigin; hash: string; cardId: string; scrollY: number } | null>(null);
  const workReturn = useRef<RouteReturn | undefined>(undefined);
  const academicReturn = useRef<RouteReturn | undefined>(undefined);
  const scheduleReturns = useRef<RouteReturn[]>([]);
  const previousSection = useRef<Section>("today");
  const previousHash = useRef("#today");
  const [palette, setPalette] = useState("blue");
  const [theme, setTheme] = useState("system");
  const [systemDark, setSystemDark] = useState(false);
  const [showInboxCount, setShowInboxCount] = useState(true);
  const [readNewsIds, setReadNewsIds] = useState<string[]>([]);
  const markNewsRead = useCallback((id: string) => {
    setReadNewsIds(current => current.includes(id) ? current : [...current, id]);
  }, []);
  useEffect(() => {
    const sync = () => {
      setRouteHash(location.hash || "#today");
      const path = location.hash.slice(1).split("?")[0];
      const hash = path === "search" ? "schedule" : path === "military" ? "vuc" : path;
      const detail = /^(news|events)\/(.*)$/.exec(hash);
      if (detail) {
        setDetailRoute({ kind: detail[1] === "news" ? "news" : "events", id: detail[2] });
        setDetailOrigin(homeReturn.current?.hash === location.hash ? homeReturn.current.origin : "today");
        setSection("home-detail");
      } else if (hash === "news" || hash.startsWith("news?")) {
        setSection("news");
      } else if (hash.startsWith("work/")) {
        setSection("work");
      } else if (hash.startsWith("study/")) {
        setSection("study");
        window.scrollTo(0, 0);
      } else if (hash.startsWith("lesson/")) {
        setSection("lesson");
      } else if (hash.startsWith("library/")) {
        setSection("library");
      } else if (hash.startsWith("inbox/")) {
        setSection("inbox");
      } else if (hash.startsWith("requests/")) {
        setSection("requests");
      } else if (hash === "teacher" || hash.startsWith("teacher/")) {
        setTeacherId(hash.slice(8));
        setSection("teacher");
        window.scrollTo(0, 0);
      } else if (hash === "group" || hash.startsWith("group/")) {
        setGroupId(hash.slice(6));
        setSection("group");
        window.scrollTo(0, 0);
      } else {
        const value = hash as Section;
        setSection(value !== "home-detail" && value !== "work" && Object.hasOwn(labels, value) ? value : "today");
      }
    };
    sync(); window.addEventListener("hashchange", sync);
    try { setShowInboxCount(localStorage.getItem("deanery-atlas-inbox-counter-v1") !== "hidden"); } catch {}
    try { const saved = JSON.parse(localStorage.getItem("deanery-prototype-appearance") || "null"); if (saved) { if (["blue", "green", "plum", "amber"].includes(saved.palette)) setPalette(saved.palette); if (["light", "dark", "system"].includes(saved.theme)) setTheme(saved.theme); } } catch {}
    const media = matchMedia("(prefers-color-scheme: dark)"); setSystemDark(media.matches); const update = () => setSystemDark(media.matches); media.addEventListener("change", update);
    return () => { window.removeEventListener("hashchange", sync); media.removeEventListener("change", update); };
  }, []);
  useEffect(() => {
    const returningFromDetail = previousSection.current === "home-detail";
    if ((section === "today" && returningFromDetail) || section === "events" || section === "all-events" || section === "news") {
      const returnTo = returningFromDetail && homeReturn.current?.origin === section ? homeReturn.current : null;
      homeReturn.current = null;
      window.scrollTo({ top: returnTo?.scrollY ?? 0, behavior: "instant" });
      const fallback = { today: "hm-home-heading", events: "hm-calendar-title", "all-events": "hm-events-archive-heading", news: "hm-archive-heading" }[section];
      document.getElementById(returnTo?.cardId || fallback)?.focus({ preventScroll: true });
    }
    const returningFromWork = previousSection.current === "work" && workReturn.current?.fromHash === routeHash ? workReturn.current : undefined;
    const returningFromAcademic = academicReturn.current?.targetHash === previousHash.current && academicReturn.current.fromHash === routeHash ? academicReturn.current : undefined;
    const returningFromSchedule = scheduleReturns.current.find(entry => entry.targetHash === previousHash.current && entry.fromHash === routeHash);
    const returningFromCampus = campusReturn.current?.targetHash === previousHash.current && campusReturn.current.fromHash === routeHash ? campusReturn.current : undefined;
    const returningFromLesson = lessonReturn.current?.targetHash === previousHash.current && lessonReturn.current.fromHash === routeHash ? lessonReturn.current : undefined;
    const returningFromInbox = inboxReturn.current?.targetHash === previousHash.current && inboxReturn.current.fromHash === routeHash ? inboxReturn.current : undefined;
    const returnEntry = returningFromWork ?? returningFromAcademic ?? returningFromSchedule ?? returningFromCampus ?? returningFromLesson ?? returningFromInbox;
    if (returnEntry && returnEntry.origin === section) {
      window.scrollTo({ top: returnEntry.scrollY, behavior: "instant" });
      const link = returnEntry.link.isConnected ? returnEntry.link
        : [...document.querySelectorAll<HTMLAnchorElement>("#prototype-main a[href^='#']")].find(item => item.hash === returnEntry.targetHash && item.getClientRects().length);
      link?.focus({ preventScroll: true });
    } else if (section === "clinic" || section === "vuc") {
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("campus-page-title")?.focus({ preventScroll: true });
    } else if (section === "teacher" || section === "group") {
      document.getElementById(`${section}-schedule-title`)?.focus({ preventScroll: true });
    } else if (section === "work" || isAcademicRoute(routeHash) && !routeHash.startsWith("#study/")) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    const visitedHash = section === "work" ? workReturn.current?.fromHash : routeHash;
    if (!scheduleReturns.current.some(entry => visitedHash === entry.fromHash || visitedHash === entry.targetHash)) {
      scheduleReturns.current = [];
    }
    previousSection.current = section;
    previousHash.current = routeHash;
  }, [section, routeHash]);
  function rememberRoute(event: MouseEvent<HTMLDivElement>) {
    if (!normalLinkClick(event) || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href^='#']");
    if (!link || !link.hash || link.hash === routeHash) return;
    const entry = { origin: section, targetHash: link.hash, fromHash: routeHash, link, scrollY: window.scrollY };
    if (section === "library" || section === "requests" && link.id.startsWith("atlas-request-")) positions.current.set(routeHash, { y: window.scrollY, id: link.id });
    if (link.hash === "#clinic" || link.hash === "#vuc") campusReturn.current = entry;
    if (link.hash === "#inbox" && section !== "inbox") inboxReturn.current = entry;
    if (link.hash.startsWith("#lesson/")) lessonReturn.current = entry;
    if (link.hash.startsWith("#work/")) workReturn.current = entry;
    const deadlineRequest = link.hash.startsWith("#requests/") && section === "deadlines";
    if (section !== "work" && (isAcademicRoute(link.hash) || deadlineRequest)) {
      academicReturn.current = entry;
    }
    if (/^#(?:teacher|group)\//.test(link.hash)) {
      if (section === "schedule") scheduleReturns.current = [entry];
      else if (section === "group" && link.hash.startsWith("#teacher/")) {
        scheduleReturns.current = [...scheduleReturns.current.filter(item => item.targetHash === routeHash), entry];
      } else scheduleReturns.current = [];
    }
  }
  const rememberHomeCard = (event: MouseEvent<HTMLAnchorElement>) => {
    if (normalLinkClick(event) && (section === "today" || section === "events" || section === "all-events" || section === "news")) {
      homeReturn.current = { origin: section, hash: event.currentTarget.hash, cardId: event.currentTarget.id, scrollY: window.scrollY };
    }
  };
  const backFromDetail = (event: MouseEvent<HTMLAnchorElement>) => {
    if (normalLinkClick(event) && homeReturn.current?.hash === location.hash) {
      event.preventDefault();
      window.history.back();
    }
  };
  const appearance = (p: string, t: string) => { setPalette(p); setTheme(t); localStorage.setItem("deanery-prototype-appearance", JSON.stringify({ palette: p, theme: t })); };
  const go = (value: Section) => { location.hash = value; window.scrollTo({ top: 0, behavior: "instant" }); };
  const unread = badge.count ?? 0;
  const currentInboxReturn = inboxReturn.current?.targetHash === routeHash ? inboxReturn.current : undefined;
  function toggleInboxCount() {
    setShowInboxCount(!showInboxCount);
    try { localStorage.setItem("deanery-atlas-inbox-counter-v1", showInboxCount ? "hidden" : "visible"); } catch {}
  }
  const [path, query = ""] = routeHash.slice(1).split("?", 2);
  const [, detailId, subpage, ...extraSegments] = path.split("/");
  const search = Object.fromEntries(new URLSearchParams(query));
  const isSchedule = section === "schedule";
  const isAssistant = section === "assistant";
  const workEntry = section === "work" && workReturn.current?.targetHash === routeHash ? workReturn.current : undefined;
  const activeSection = section === "home-detail" || section === "events" || section === "all-events" || section === "news" ? "today"
    : section === "lesson" ? lessonReturn.current?.origin ?? "schedule" : workEntry?.origin ?? section;
  const inboxHash = section === "work" ? workEntry?.fromHash : section === "lesson" ? lessonReturn.current?.fromHash : routeHash;
  const inboxId = inboxHash?.split("?", 1)[0].split("/")[1];
  const navigationSection = activeSection === "teacher" || activeSection === "group" || activeSection === "lesson" ? "schedule"
    : activeSection === "requests" ? "services" : activeSection === "library-loans" ? "library" : activeSection;
  const teacherHash = activeSection === "teacher" ? (section === "lesson" ? lessonReturn.current?.fromHash : workEntry?.fromHash) ?? routeHash : undefined;
  const teacherEntry = scheduleReturns.current.find(entry => entry.targetHash === teacherHash);
  const groupHash = section === "group" ? routeHash : teacherEntry?.origin === "group" ? teacherEntry.fromHash : undefined;
  const groupEntry = scheduleReturns.current.find(entry => entry.targetHash === groupHash);
  const teacherBack = <RouteBack entry={teacherEntry} fallback="#schedule" current={labels.teacher}/>;
  const detailBack = {
    today: { href: "#today", label: "Главная" },
    events: { href: "#events", label: "Календарь событий" },
    "all-events": { href: "#all-events", label: "Все события" },
    news: { href: "#news", label: "Все новости" },
  }[detailOrigin];
  const academicSection = activeSection === "schedule" || activeSection === "study" ? activeSection : null;
  const previousAcademic = academicReturn.current;
  const renderHome = section === "today" || section === "home-detail" && detailOrigin === "today";
  const renderDeadlines = activeSection === "deadlines" || previousAcademic?.origin === "deadlines" &&
    (previousAcademic.targetHash === routeHash || previousAcademic.targetHash === workEntry?.fromHash);
  const academicOrigin = section === "work" ? workEntry?.fromHash : section === "lesson" ? lessonReturn.current?.fromHash : routeHash;
  const [academicPath, academicQuery = ""] = (academicOrigin ?? "").slice(1).split("?", 2);
  const academicId = academicPath.split("/")[1];
  const academicSearch = Object.fromEntries(new URLSearchParams(academicQuery));
  const footer = <footer className="p-footer"><span>Конкурсный прототип · Все данные вымышлены</span></footer>;
  return <div className="interface-prototype" data-palette={palette} data-mode={theme === "system" ? systemDark ? "dark" : "light" : theme} onClick={rememberRoute}>
    <a className="p-skip" href="#prototype-main">К содержимому</a>
    <AtlasSidebar active={navigationSection === "session" ? "study" : navigationSection} profile={profile ?? undefined}/>
    <div className="p-workspace">
      <AtlasDesktopBar term={profile?.currentSemester}
        pass={<PrototypePass className="p-secondary p-desktop-pass">Пропуск (QR)</PrototypePass>}
        inboxActive={section === "inbox"} unread={unread} showInboxCount={showInboxCount}/>

      <main id="prototype-main" className="p-main" data-schedule={isSchedule ? "" : undefined} data-assistant={isAssistant ? "" : undefined}>
        {activeSection === "teacher" && <div hidden={section !== "teacher"}>{isServerId(teacherId)
          ? <LiveAcademics section="teacher" id={teacherId} search={{ ...(section === "work" || section === "lesson" ? academicSearch : search), back: teacherEntry?.fromHash ?? search.back }}/>
          : <section className="p-page-heading">{teacherBack}<h1>Преподаватель не найден</h1></section>}</div>}
        {groupHash && <div hidden={section !== "group"}><LiveAcademics section="group" id={groupId} search={{ ...search, back: groupEntry?.fromHash ?? "#schedule" }}/></div>}
        {(renderHome || section === "events" || section === "all-events" || section === "news" || section === "home-detail") && <LiveContent>
        {renderHome && <div hidden={section !== "today"}><PrototypeHome readNewsIds={readNewsIds} onDetailClick={rememberHomeCard}/></div>}
        {(section === "events" || section === "home-detail" && detailOrigin === "events") && <div hidden={section !== "events"}><HomeCalendar onDetailClick={rememberHomeCard}/></div>}
        {(section === "all-events" || section === "home-detail" && detailOrigin === "all-events") && <div hidden={section !== "all-events"}><EventsArchive onDetailClick={rememberHomeCard}/></div>}
        {(section === "news" || section === "home-detail" && detailOrigin === "news") && <div hidden={section !== "news"}><NewsArchive readNewsIds={readNewsIds} onDetailClick={rememberHomeCard}/></div>}
        </LiveContent>}
        {section === "home-detail" && detailRoute && <HomeDetail key={`${detailRoute.kind}/${detailRoute.id}`} route={detailRoute} back={detailBack} onBack={backFromDetail} onNewsOpen={markNewsRead}/>}
        {renderDeadlines && <div className="p-academic-slot" hidden={section !== "deadlines"}>
          <LiveAcademics section="deadlines" search={search}/>
        </div>}
        {academicSection && <div className="p-academic-slot" hidden={section === "work" || section === "lesson"}>
          <LiveAcademics section={academicSection} id={academicId && isServerId(academicId) ? academicId : undefined} search={academicSearch} visible={section === "study"}
            studyBack={<RouteBack entry={previousAcademic?.targetHash === academicOrigin ? previousAcademic : undefined}
              fallback="#profile" current={labels.study} desktopHidden={routeHash === "#study"}/>}/>
          {isSchedule && footer}
        </div>}
        {section === "session" && <AtlasSessionCalendar semesterId={search.semester} onUnauthorized={auth.onUnauthorized}
          back={<RouteBack entry={academicReturn.current?.targetHash === routeHash ? academicReturn.current : undefined} fallback="#profile" current={labels.session}/>}/>}
        {section === "plan" && <Resource url="/api/v1/study/plan" schema={studyPlanResponse} onUnauthorized={auth.onUnauthorized}>
          {data => <AcademicPlan key={search.semester} data={data} initialSemesterId={search.semester}
            back={<RouteBack entry={academicReturn.current?.targetHash === routeHash ? academicReturn.current : undefined} fallback="#profile" current={labels.plan} desktopHidden={routeHash === "#plan"}/>}/>}
        </Resource>}
        {section === "lesson" && <LiveAcademics section="lesson" id={detailId} search={{ ...search, back: lessonReturn.current?.fromHash ?? search.back }}/>}
        {section === "work" && (detailId && !subpage && isServerId(detailId)
          ? <LiveAcademics section="work" id={detailId} search={{ ...search, back: workEntry?.fromHash ?? search.back }}/>
          : <WorkPage key={routeHash} route={null} back={<RouteBack entry={workEntry} fallback="#deadlines" current={labels.work}/>}/>)}
        {(section === "services" || section === "requests") && profile && <LiveAtlasRequests id={detailId} catalog={section === "services"}
          search={search} profile={profile} memory={requestMemory.current} onUnauthorized={auth.onUnauthorized}
          returnFocus={section === "requests" && /^#requests\/[0-9a-f-]{36}/i.test(previousHash.current) ? positions.current.get(routeHash) : undefined}/>}
        <div hidden={section !== "sports"}><LiveSports visible={section === "sports"}/></div>
        {activeSection === "inbox" && <div hidden={section !== "inbox"}>
          <RouteBack entry={currentInboxReturn} fallback="#today" current="Уведомления"/>
          <LivePrototypeInbox badge={badge} onUnauthorized={auth.onUnauthorized} detailId={inboxId}/>
        </div>}
        {section === "clinic" && <Clinic/>}
        {section === "vuc" && <Vuc checked={vucChecklist} toggle={item => setVucChecklist(previous => {
          const next = new Set(previous);
          if (next.has(item)) next.delete(item);
          else next.add(item);
          return next;
        })}/>}
        {section === "library" && <Library key={path} id={detailId} reading={subpage === "read"}
          invalid={(path.includes("/") && !detailId) || (subpage !== undefined && subpage !== "read") || extraSegments.length > 0}
          subjectId={search.subjectId} restore={positions.current.get(routeHash)}/>}
        {section === "library-loans" && <><RouteBack fallback="#library" current="Мои книги"/><LibraryLoans/></>}
        {section === "profile" && <PrototypeProfile unread={unread} theme={theme} onThemeChange={value => appearance(palette, value)}
          showInboxCount={showInboxCount} onToggleInboxCount={toggleInboxCount}/>}
        {section === "settings" && <><div className="p-page-heading"><div><h1>Оформление</h1></div></div><section className="p-panel p-settings"><h2>Цветовая палитра</h2><div className="p-palettes">{[["blue", "Глубокая синяя"], ["green", "Лесная зелёная"], ["plum", "Тёплая сливовая"], ["amber", "Медовая янтарная"]].map(([value, name]) => <button key={value} aria-pressed={palette === value} onClick={() => appearance(value, theme)}><span className={`p-swatch p-swatch-${value}`}>{palette === value && <Check size={20}/>}</span>{name}</button>)}</div><h2>Тема интерфейса</h2><div className="p-theme-options">{[["light", "Светлая", Sun], ["dark", "Тёмная", Moon], ["system", "Как на устройстве", Settings]].map(([value, name, Icon]) => { const ThemeIcon = Icon as typeof Sun; return <button key={value as string} aria-pressed={theme === value} onClick={() => appearance(palette, value as string)}><ThemeIcon size={21}/>{name as string}{theme === value && <Check size={17}/>}</button>; })}</div><p className="p-setting-hint"><Check size={16}/>Оформление сохраняется автоматически на этом устройстве.</p></section></>}
        {isAssistant && <AssistantChat onKeyboardChange={setChatKeyboardOpen}/>}
        {!isSchedule && !isAssistant && footer}
      </main>
    </div>
    {section === "today" && <a className="p-floating-inbox" href="#inbox" aria-label={`Уведомления: ${unread} непрочитанных`} title="Уведомления"><span className="p-floating-bell"><Bell size={25} aria-hidden="true"/></span>{unread > 0 && <span className="p-floating-count">{unread}</span>}</a>}
    <BottomNavigation section={navigationSection === "inbox" ? currentInboxReturn?.origin ?? "today"
      : ["plan", "study", "session", "clinic", "vuc", "library", "sports", "services", "settings"].includes(navigationSection) ? "profile" : navigationSection}
      keyboardOpen={keyboardOpen || isAssistant && chatKeyboardOpen} onNavigate={go}/>

  </div>;
}
