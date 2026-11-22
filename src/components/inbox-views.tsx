"use client";

import { ChevronRight } from "lucide-react";
import { CabinetLink } from "./cabinet-link";
import { compactDate } from "./compact-date";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { inboxCount, inboxDetail, inboxFilter, inboxList, notificationLabels } from "@/contracts/inbox";
import { Resource } from "./resource";
import type { Search } from "./academic-views";

export type InboxScreen = "inbox" | "notice";
const filters = { all: "Все", important: "Важное", deadlines: "Дедлайны" };
const targetRoutes = {
  lesson: { path: "/schedule", label: "К занятию" },
  discipline: { path: "/study", label: "К дисциплине" },
  assignment: { path: "/assignments", label: "К работе" },
  request: { path: "/requests", label: "К заявке" },
};
const dates = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" });
const date = (value: string) => dates.format(new Date(value)) + " МСК";

export function useInboxBadge(generation: number | null, onUnauthorized: () => void) {
  const [badge, setBadge] = useState<{ generation: number; count: number } | null>(null);
  const revision = useRef(0);
  const refresh = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (generation === null) return;
    let request: AbortController | undefined;
    function read() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const version = revision.current;
      void fetch("/api/v1/inbox", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (controller.signal.aborted) return;
          if (response.status === 401) return onUnauthorized();
          if (!response.ok) return;
          const { unreadCount } = inboxCount.parse(await response.json());
          if (!controller.signal.aborted && version === revision.current) {
            setBadge({ generation: generation!, count: unreadCount });
          }
        })
        .catch(() => {});
    }
    refresh.current = read;
    read();
    const timer = setInterval(read, 15_000);
    return () => { clearInterval(timer); request?.abort(); refresh.current = null; };
  }, [generation, onUnauthorized]);
  const adjust = useCallback((delta: number) => {
    revision.current += 1;
    setBadge((previous) => previous && previous.generation === generation
      ? { ...previous, count: Math.max(0, previous.count + delta) } : previous);
  }, [generation]);
  const sync = useCallback(() => { refresh.current?.(); }, []);
  return { count: badge && badge.generation === generation ? badge.count : null, adjust, sync };
}

function Feed({ search, onUnauthorized }: { search: Search; onUnauthorized: () => void }) {
  const parsed = inboxFilter.safeParse(search.filter);
  const filter = parsed.success ? parsed.data : "all";
  const query = new URLSearchParams({ filter });
  if (typeof search.cursor === "string") query.set("cursor", search.cursor);
  const back = "/inbox?" + query;
  return <>
    <h1>Входящие</h1>
    <div className="segmented" aria-label="Фильтр входящих">
      {Object.entries(filters).map(([key, label]) => <CabinetLink key={key} href={`/inbox?filter=${key}`}
        aria-current={key === filter ? "true" : undefined}>{label}</CabinetLink>)}
    </div>
    <div className="desktop-columns"><div className="desktop-main-column">
    <Resource url={"/api/v1" + back} schema={inboxList} onUnauthorized={onUnauthorized}>
      {({ items, unreadCount, nextCursor }) => <>
        <p className="muted inbox-count">{unreadCount === 0 && items.length > 0 ? "Новых сообщений нет" : `Непрочитанных: ${unreadCount}`}</p>
        <section aria-label="Уведомления">
          {items.length ? items.map((item) =>
            <CabinetLink key={item.id} className={`data-row chevron-row notice-row notice-${item.kind}${item.readAt ? "" : " notice-unread"}`} href={`/inbox/${item.id}?${new URLSearchParams({ back })}`}>
              <span className="row-body">
                <span className="row-meta notice-meta">{notificationLabels[item.kind]} · {compactDate(item.dueAt ?? item.publishedAt)}</span>
                <strong>{!item.readAt && <span className="unread-dot" aria-hidden="true" />}{item.title}</strong>
              </span>
              {!item.readAt && <span className="sr-only">Непрочитано</span>}
              <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
            </CabinetLink>) : <>
              <p>{filter === "all" ? "Сообщений пока нет" : "В этом разделе сообщений пока нет"}</p>
              {filter !== "all" && <CabinetLink className="back-link" href="/inbox">Показать все</CabinetLink>}
            </>}
        </section>
        {nextCursor && <CabinetLink className="back-link" href={"/inbox?" + new URLSearchParams({ filter, cursor: nextCursor })}>Следующая страница</CabinetLink>}
      </>}
    </Resource>
    </div><aside className="desktop-context data-panel"><h2>В центре внимания</h2>
      <Resource url="/api/v1/inbox" schema={inboxList} onUnauthorized={onUnauthorized}>{({ items, unreadCount, nextCursor }) => <><p>Непрочитанных: <strong>{unreadCount}</strong></p><div className="category-summary">{([["deadline", "Дедлайны"], ["schedule_change", "Расписание"], ["request_update", "Заявки"]] as const).map(([kind, label]) => <div key={kind}><span>{label}</span><strong>{items.filter((item) => item.kind === kind).length}</strong></div>)}</div>{nextCursor && <p className="muted">Количество на первой странице</p>}</>}</Resource>
    </aside></div>
  </>;
}

type BadgeActions = { adjust: (delta: number) => void; sync: () => void };

function NoticeBody({ item, onUnauthorized, badge }: {
  item: z.output<typeof inboxDetail>; onUnauthorized: () => void; badge: BadgeActions;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const { adjust, sync } = badge;
  useEffect(() => {
    if (item.readAt) return;
    const controller = new AbortController();
    let optimistic = false;
    function restore() {
      if (optimistic) adjust(1);
      optimistic = false;
    }
    async function read() {
      setFailed(false);
      try {
        const csrf = await fetch("/api/v1/csrf", { cache: "no-store", signal: controller.signal });
        if (!csrf.ok) throw new Error("Could not get CSRF token");
        const { token } = await csrf.json();
        if (controller.signal.aborted) return;
        optimistic = true;
        adjust(-1);
        const response = await fetch(`/api/v1/inbox/${item.id}/read`, {
          method: "POST", signal: controller.signal, headers: { "X-CSRF-Token": token },
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) { restore(); return onUnauthorized(); }
        if (!response.ok) throw new Error("Could not save read state");
        optimistic = false;
        sync();
      } catch {
        if (!controller.signal.aborted) {
          restore();
          setFailed(true);
          sync();
        }
      }
    }
    void read();
    return () => { controller.abort(); restore(); };
  }, [item.id, item.readAt, onUnauthorized, adjust, sync, attempt]);

  const target = item.target && targetRoutes[item.target.kind];
  return <>
    <p className="muted">{notificationLabels[item.kind]} · {date(item.publishedAt)}</p>
    <h1>{item.title}</h1>
    <section className="data-panel">
      {item.dueAt && <p className="muted">Срок · {date(item.dueAt)}</p>}
      <p className="notice-body">{item.body}</p>
      {item.target && target && <CabinetLink className="primary-link" href={`${target.path}/${item.target.id}`}>{target.label}</CabinetLink>}
    </section>
    {failed && <div className="load-error">
      <p role="alert">Не удалось отметить сообщение как прочитанное.</p>
      <button type="button" className="quiet-button" onClick={() => setAttempt(attempt + 1)}>Повторить отметку</button>
    </div>}
  </>;
}

export function InboxView({ screen, id, search, onUnauthorized, badge }: {
  screen: InboxScreen; id?: string; search: Search; onUnauthorized: () => void; badge: BadgeActions;
}) {
  if (screen === "inbox") return <Feed search={search} onUnauthorized={onUnauthorized} />;
  const back = typeof search.back === "string" && search.back.startsWith("/inbox?") ? search.back : "/inbox";
  return <>
    <CabinetLink className="back-link" href={back}>К входящим</CabinetLink>
    <Resource url={`/api/v1/inbox/${encodeURIComponent(id ?? "")}`} schema={inboxDetail} onUnauthorized={onUnauthorized}>
      {(item) => <NoticeBody key={item.id} item={item} onUnauthorized={onUnauthorized} badge={badge} />}
    </Resource>
  </>;
}
