"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQwenWarmup } from "./use-qwen-warmup";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CabinetLink } from "./cabinet-link";
import { AssignmentView, SportsView, TeacherView, SearchView } from "./extended-views";
import { CalendarDays, FileText, GraduationCap, House, Inbox, Moon, Sun, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, profileSchema, type Profile } from "@/contracts/auth";
import { InboxView, useInboxBadge, type InboxScreen } from "./inbox-views";
import { RequestView, type RequestMemory, type RequestScreen } from "./request-views";
import { AcademicView, type Screen, type Search } from "./academic-views";
import { AssistantDocumentView, AssistantView } from "./assistant-view";
import type { AssistantMemory } from "./use-assistant-conversation";
import { atlasFragment, atlasLoginHref, atlasPath, documentFragment, loginDestination } from "./login-destination";

const logoutFlag = "logout-pending";
const navigation = [
  { screen: "today", href: "/today", label: "Сегодня", Icon: House },
  { screen: "schedule", href: "/schedule", label: "Пары", Icon: CalendarDays },
  { screen: "study", href: "/study", label: "Учёба", Icon: GraduationCap },
  { screen: "requests", href: "/requests", label: "Заявки", Icon: FileText },
  { screen: "inbox", href: "/inbox", label: "Входящие", Icon: Inbox },
] as const;

const isEntry = (path: string) => path === "/login";

function readBrowserPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeBrowserPreference(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* The session still uses the checked server cookie. */ }
}

async function postSession(path: string, body?: unknown) {
  const csrf = await fetch("/api/v1/csrf", { cache: "no-store" });
  if (!csrf.ok) throw new Error("Не удалось связаться с кабинетом.");
  const { token } = await csrf.json();
  return fetch(`/api/v1/session/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Session = { state: "loading"; retainedProfileId?: string } | { state: "login" | "error" | "logout" } |
  { state: "ready"; profile: Profile; generation: number };
type Theme = "system" | "light" | "dark";

function checkingSession(previous: Session): Session {
  if (previous.state === "loading" || previous.state === "login") return previous;
  return previous.state === "ready" ? { state: "loading", retainedProfileId: previous.profile.id } : { state: "loading" };
}

function setPageTheme(value: Theme) {
  document.documentElement.dataset.theme = value;
}

const CabinetSession = createContext<{
  profile: Profile; memory: RequestMemory; assistantMemory: AssistantMemory;
  onUnauthorized: () => void; badge: ReturnType<typeof useInboxBadge>;
} | null>(null);

const AtlasSession = createContext<{
  session: Session; memory: AssistantMemory; logout: () => void; onUnauthorized: () => void;
} | null>(null);

export function useAtlasSession() {
  return useContext(AtlasSession);
}

export function AccountShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const prototypePage = pathname === atlasPath;
  const profilePage = pathname === "/profile";
  const [session, setSession] = useState<Session>({ state: "loading" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const activeProfile = useRef<string | null>(null);
  const memory = useMemo<RequestMemory>(() => ({}), [pathname]);
  const [assistantMemory, setAssistantMemory] = useState<AssistantMemory>({});
  const currentMemory = useRef(memory);
  useLayoutEffect(() => { currentMemory.current = memory; }, [memory]);
  const clearDraft = useCallback(() => {
    delete currentMemory.current.draft;
    delete currentMemory.current.createKey;
    delete currentMemory.current.clarify;
  }, []);
  const privateRoot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (session.state === "ready" && privateRoot.current) privateRoot.current.hidden = false;
  }, [session]);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const logoutPending = useRef(false);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { login: "", password: "" } });
  const reset = form.reset;

  const hidePrivate = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    if (privateRoot.current) privateRoot.current.hidden = true;
  }, []);

  const showLogin = useCallback(() => {
    const expired = activeProfile.current !== null;
    activeProfile.current = null;
    setAssistantMemory({});
    clearDraft();
    const { pathname } = window.location;
    if (!isEntry(pathname)) {
      const next = pathname === atlasPath
        ? atlasPath + atlasFragment(window.location.hash)
        : pathname + window.location.search + documentFragment(window.location);
      if (pathname === atlasPath && expired) setError("Сессия завершилась. Войдите снова.");
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
    setSession({ state: "login" });
  }, [clearDraft, router]);

  const check = useCallback(async () => {
    hidePrivate();
    if (logoutPending.current || readBrowserPreference(logoutFlag)) {
      setAssistantMemory({});
      setSession({ state: "logout" });
      return;
    }
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    // Keep the unauthenticated form mounted while checking after a tab switch.
    setSession(checkingSession);
    try {
      const response = await fetch("/api/v1/me", { cache: "no-store", signal: controller.signal });
      if (current !== generation.current) return;
      if (response.status === 401) return showLogin();
      if (!response.ok) throw new Error("Session check failed");
      const profile = profileSchema.parse(await response.json());
      if (current !== generation.current) return;
      if (activeProfile.current !== profile.id) {
        clearDraft();
        setAssistantMemory({});
      }
      activeProfile.current = profile.id;
      reset();
      setSession({ state: "ready", profile, generation: current });
    } catch {
      if (current === generation.current) {
        setSession((previous) => previous.state === "login" ? previous : { state: "error" });
        setError("Не удалось проверить сессию. Повторите попытку.");
      }
    }
  }, [clearDraft, hidePrivate, reset, showLogin]);

  const onUnauthorized = useCallback(() => {
    hidePrivate();
    setSession({ state: "loading" });
    showLogin();
  }, [hidePrivate, showLogin]);

  const inboxBadge = useInboxBadge(session.state === "ready" && !prototypePage ? session.generation : null, onUnauthorized);
  useQwenWarmup(session.state === "ready" && !isEntry(pathname) ? session.generation : null);

  useEffect(() => {
    if (session.state !== "ready" || !isEntry(pathname)) return;
    const next = loginDestination(window.location);
    if (next === atlasPath || next.startsWith(`${atlasPath}#`)) window.location.replace(next);
    else router.replace(next);
  }, [pathname, router, session.state]);

  useEffect(() => {
    const saved = readBrowserPreference("cabinet-theme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      setTheme(saved);
      setPageTheme(saved);
    }
    const bus = new BroadcastChannel("session");
    channel.current = bus;
    bus.onmessage = ({ data }) => {
      if (data === "logout" || data === "login") {
        setAssistantMemory({});
        setSession({ state: "loading" });
      }
      void check();
    };
    const storage = ({ key, newValue }: StorageEvent) => {
      if (key !== logoutFlag) return;
      if (newValue) setAssistantMemory({});
      void check();
    };
    const visibility = () => {
      if (document.hidden) {
        hidePrivate();
        setSession((previous) => previous.state === "ready" ? checkingSession(previous) : previous);
      } else {
        void check();
      }
    };
    const pageHide = () => { hidePrivate(); reset(); clearDraft(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) void check(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("storage", storage);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    void check();
    return () => {
      hidePrivate();
      bus.close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("storage", storage);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
    };
  }, [check, clearDraft, hidePrivate, reset]);

  function updateTheme(value: Theme) {
    setTheme(value);
    setPageTheme(value);
    writeBrowserPreference("cabinet-theme", value);
  }

  async function logout() {
    hidePrivate();
    setAssistantMemory({});
    clearDraft();
    reset();
    setError("");
    setSession({ state: "logout" });
    logoutPending.current = true;
    writeBrowserPreference(logoutFlag, "1");
    channel.current?.postMessage("logout");
    try {
      const response = await postSession("logout");
      if (!response.ok) throw new Error("Logout failed");
      logoutPending.current = false;
      writeBrowserPreference(logoutFlag, null);
      channel.current?.postMessage("check");
      activeProfile.current = null;
      setSession({ state: "login" });
      router.replace(prototypePage ? atlasLoginHref : "/login");
    } catch {
      setError("Выход не подтверждён. Повторите выход.");
    }
  }

  const [demoProfiles, setDemoProfiles] = useState<('a' | 'b')[]>([]);
  const [demoPending, setDemoPending] = useState(false);
  const loginVisible = session.state === "login";
  useEffect(() => {
    if (!loginVisible) {
      setDemoProfiles([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/v1/session/demo", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted) setDemoProfiles(Array.isArray(data?.profiles) ? data.profiles.filter((profile: unknown): profile is 'a' | 'b' => profile === 'a' || profile === 'b') : []); })
      .catch(() => {});
    return () => controller.abort();
  }, [loginVisible]);

  async function signIn(path: "login" | "demo", values: unknown) {
    setError("");
    try {
      const response = await postSession(path, values);
      if (!response.ok) {
        if (response.status === 429) throw new Error("Слишком много попыток. Подождите 15 минут.");
        if (response.status === 401 && path === "login") throw new Error("Проверьте логин и пароль.");
        throw new Error("Не удалось войти. Повторите попытку.");
      }
      reset();
      channel.current?.postMessage("login");
      await check();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти.");
    }
  }

  if (prototypePage) {
    const profileId = session.state === "ready" ? session.profile.id : session.state === "loading" ? session.retainedProfileId : undefined;
    if (profileId) return <AtlasSession.Provider value={{ session, memory: assistantMemory, logout, onUnauthorized }}>
      <div ref={privateRoot} key={profileId} hidden={session.state !== "ready"}>{children}</div>
      {session.state === "loading" && <main className="entry-shell"><p role="status">Проверяем сессию…</p></main>}
    </AtlasSession.Provider>;
    if (session.state === "login") return <main className="entry-shell"><p role="status">Открываем страницу входа…</p></main>;
  }

  if (session.state !== "ready") return <main className="entry-shell">
    <header className="entry-heading"><span className="brand">Цифровой деканат</span><p className="prototype">Конкурсный прототип</p></header>
    {session.state === "loading" && <p role="status">Проверяем сессию…</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {session.state === "error" && <button onClick={() => void check()}>Повторить</button>}
    {session.state === "logout" && <><p>Личные данные скрыты.</p><button onClick={() => void logout()}>Повторить выход</button></>}
    {loginVisible && <><form className="login-form" onSubmit={form.handleSubmit((values) => signIn("login", values))}>
      <h1>Вход в кабинет</h1>
      <label htmlFor="login">Логин</label>
      <input id="login" autoComplete="username" {...form.register("login")} required maxLength={128} />
      <label htmlFor="password">Пароль</label>
      <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" {...form.register("password")} required maxLength={256} />
      <button className="quiet-button" type="button" onClick={() => setShowPassword(!showPassword)}>
        {showPassword ? "Скрыть пароль" : "Показать пароль"}
      </button>
      <button className="login-submit" disabled={form.formState.isSubmitting || demoPending}>
        {form.formState.isSubmitting ? "Входим…" : "Войти"}
      </button>
    </form>
    {demoProfiles.length > 0 && <section className="demo-login" aria-label="Быстрый вход">
      <p>Быстрый вход в тестовый аккаунт</p><div className="demo-login-options">{demoProfiles.map(profile => <button key={profile} className="quiet-button" type="button" disabled={demoPending || form.formState.isSubmitting}
      onClick={async () => {
        setDemoPending(true);
        try { await signIn("demo", { profile }); } finally { setDemoPending(false); }
      }}>Студент {profile.toUpperCase()}</button>)}</div></section>}</>}
    <footer>В кабинете используются вымышленные данные.</footer>
  </main>;

  if (isEntry(pathname)) return <main className="entry-shell"><p role="status">Открываем кабинет…</p></main>;
  const { profile } = session;
  const initials = profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const switchTheme = () => {
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    updateTheme(dark ? "light" : "dark");
  };
  return <div className="cabinet" ref={privateRoot} key={session.generation}>
    <aside className="cabinet-sidebar">
    <header className="cabinet-header">
      <div className="brand-block"><span className="brand-mark" aria-hidden="true">ЦД</span><CabinetLink href="/today" className="brand">Цифровой деканат</CabinetLink><p className="prototype">Конкурсный прототип</p></div>
      <div className="header-actions">
        <CabinetLink href="/profile" className="profile-link" aria-current={profilePage ? "page" : undefined} aria-label="Профиль" title="Профиль"><UserRound size={19} aria-hidden="true" /></CabinetLink>
        <button type="button" className="header-theme" aria-label="Переключить тему" title="Переключить тему" onClick={switchTheme}>
          <Moon className="theme-moon" size={19} aria-hidden="true" /><Sun className="theme-sun" size={19} aria-hidden="true" />
        </button>
      </div>
    </header>
    <nav hidden={pathname === "/requests/new"} className="cabinet-nav" aria-label="Разделы кабинета">
      {navigation.map(({ screen: tab, href, label, Icon }, index) => <span className="nav-entry" key={href}>{(index === 0 || index === 3) && <span className="nav-section">{index === 0 ? "Учебный процесс" : "Документы и связь"}</span>}<CabinetLink href={href} aria-current={pathname === href || pathname.startsWith(href + "/") ? "page" : undefined}>
        <span className="nav-icon"><Icon size={21} aria-hidden="true" /></span><span>{label}</span>
        {tab === "inbox" && inboxBadge.count !== null && inboxBadge.count > 0 &&
          <span className="nav-count" aria-label={`Непрочитанных: ${inboxBadge.count}`}>{inboxBadge.count > 99 ? "99+" : inboxBadge.count}</span>}
      </CabinetLink></span>)}
    </nav>
    <div className="sidebar-actions">
      <CabinetLink href="/profile" className="sidebar-profile"><span className="student-avatar">{initials}</span><span><strong>{profilePage ? "Мой профиль" : profile.fullName}</strong><small>Личный профиль</small></span></CabinetLink>
      <div className="theme-buttons">{(["light", "dark"] as const).map((value) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => updateTheme(value)}>{value === "light" ? "Светлая" : "Тёмная"}</button>)}</div>
    </div>
    </aside>
    <main className="cabinet-main">
      {profilePage ? <>
        <h1>Мой профиль</h1>
        <div className="profile-layout"><section className="data-panel student-ticket">
          <div className="student-ticket-head"><span className="student-avatar student-avatar-large">{initials}</span><div><h2>{profile.fullName}</h2><span className="student-active">● Активный студент</span></div><button className="quiet-button" onClick={() => void logout()}>Выйти</button></div>
          <dl className="profile-facts">{Object.entries({ Факультет: profile.faculty, Направление: profile.program, Курс: profile.course, Группа: profile.group, Семестр: profile.currentSemester, Уровень: profile.educationLevel, "Форма обучения": profile.studyMode, Студенческий: profile.studentNumber, Почта: profile.email }).filter(([, value]) => value != null).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </section><section className="data-panel profile-settings"><h2>Оформление и безопасность</h2><CabinetLink href="/sports">Физкультура</CabinetLink> · <CabinetLink href="/search">Поиск</CabinetLink><p>Тема</p><div className="profile-themes" role="group" aria-label="Тема">{(["system", "light", "dark"] as const).map((value) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => updateTheme(value)}>{value === "system" ? "Системная" : value === "light" ? "Светлая" : "Тёмная"}</button>)}</div><p className="muted">Сессия защищена · Изоляция данных активна</p></section></div>
      </> : <CabinetSession.Provider value={{ profile, memory, assistantMemory, onUnauthorized, badge: inboxBadge }}>
        <Suspense fallback={<p role="status">Открываем раздел…</p>}>{children}</Suspense>
      </CabinetSession.Provider>}
    </main>
  </div>;
}

export function Account({ screen, id }: { screen: Exclude<Screen, "entry" | "profile"> | RequestScreen | InboxScreen | "assistant" | "assistantDocument" | "assignment" | "sports" | "teacher" | "search"; id?: string }) {
  const session = useContext(CabinetSession);
  const params = useSearchParams();
  if (!session) return null;
  const search: Search = Object.fromEntries([...params.keys()].map((key) => {
    const values = params.getAll(key);
    return [key, values.length === 1 ? values[0] : values];
  }));
  const { profile, memory, assistantMemory, badge, onUnauthorized } = session;
  if (screen === "search") return <SearchView onUnauthorized={onUnauthorized} />;
  if (screen === "teacher") return <TeacherView id={id ?? ""} onUnauthorized={onUnauthorized} />;
  if (screen === "assignment") return <AssignmentView id={id ?? ""} onUnauthorized={onUnauthorized} />;
  if (screen === "sports") return <SportsView onUnauthorized={onUnauthorized} />;
  if (screen === "assistant") return <AssistantView memory={assistantMemory} onUnauthorized={onUnauthorized} standalone />;
  if (screen === "assistantDocument") return <AssistantDocumentView id={id ?? ""} memory={assistantMemory} onUnauthorized={onUnauthorized} />;
  if (screen === "inbox" || screen === "notice") return <InboxView {...{ screen, id, search, onUnauthorized, badge }} />;
  if (screen === "requests" || screen === "requestNew" || screen === "requestDetail") {
    return <RequestView {...{ screen, id, search, profile, memory, onUnauthorized }} />;
  }
  return <AcademicView {...{ screen, id, search, onUnauthorized, assistantMemory }} />;
}
