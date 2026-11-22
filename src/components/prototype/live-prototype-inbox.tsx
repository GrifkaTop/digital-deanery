"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { inboxDetail, inboxList } from "@/contracts/inbox";
import { Resource } from "../resource";
import { PrototypeInbox, PrototypeNoticeBody } from "./prototype-inbox";

type Badge = { count?: number | null; sync: () => void };
type Notice = z.output<typeof inboxDetail>;
type PageData = z.output<typeof inboxList>;
type InboxProps = { badge: Badge; onUnauthorized: () => void; detailId?: string };

function noticeUrl(id: string) {
  return "/api/v1/inbox/" + encodeURIComponent(id);
}

async function postRead(url: string, signal: AbortSignal, onUnauthorized: () => void) {
  const csrf = await fetch("/api/v1/csrf", { cache: "no-store", signal });
  if (csrf.status === 401) { onUnauthorized(); return false; }
  if (!csrf.ok) throw new Error("Unread state unavailable");
  const { token } = await csrf.json();
  const response = await fetch(url, { method: "POST", headers: { "X-CSRF-Token": token }, signal });
  if (response.status === 401) { onUnauthorized(); return false; }
  if (!response.ok) throw new Error("Could not save read state");
  return true;
}

function ReadNotice({ item, read, onRead, onUnauthorized }: {
  item: Notice; read: boolean; onRead: (id: string) => void; onUnauthorized: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const id = item.id;
  useEffect(() => {
    if (read) return;
    const request = new AbortController();
    setFailed(false);
    void postRead(noticeUrl(id) + "/read", request.signal, onUnauthorized)
      .then(saved => { if (saved && !request.signal.aborted) onRead(id); })
      .catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => request.abort();
  }, [attempt, id, onRead, onUnauthorized, read]);
  return <>
    <PrototypeNoticeBody item={item}/>
    {failed && !read && <div className="load-error">
      <p role="alert">Не удалось отметить сообщение прочитанным.</p>
      <button type="button" className="p-secondary" onClick={() => setAttempt(count => count + 1)}>Повторить отметку</button>
    </div>}
  </>;
}

function InboxFeed({ data, direct, badge, onUnauthorized }: {
  data: PageData; direct?: Notice; badge: Badge; onUnauthorized: () => void;
}) {
  const [opened, setOpened] = useState<string | null>(direct?.id ?? null);
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set());
  const [page, setPage] = useState<{ items: PageData["items"]; nextCursor: string | null } | null>(null);
  const [readAll, setReadAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const { sync } = badge;
  const items = page ? [...data.items, ...page.items] : data.items;
  const cursor = page ? page.nextCursor : data.nextCursor;
  const unreadCount = badge.count ?? data.unreadCount;

  useEffect(() => () => active.current?.abort(), []);

  const markRead = useCallback((id: string) => {
    setRead(previous => new Set([...previous, id]));
    sync();
  }, [sync]);

  async function act(action: (signal: AbortSignal) => Promise<void>, message: string) {
    if (active.current) return;
    const request = new AbortController();
    active.current = request;
    setBusy(true);
    setError("");
    try { await action(request.signal); }
    catch { if (!request.signal.aborted) setError(message); }
    finally {
      if (!request.signal.aborted) setBusy(false);
      active.current = null;
    }
  }

  function readEverything() {
    void act(async signal => {
      const saved = await postRead("/api/v1/inbox/read-all", signal, onUnauthorized);
      if (!saved || signal.aborted) return;
      setRead(previous => new Set([...previous, ...items.map(item => item.id)]));
      setReadAll(true);
      sync();
    }, "Не удалось отметить все сообщения прочитанными.");
  }

  function loadNext() {
    if (!cursor) return;
    void act(async signal => {
      const response = await fetch("/api/v1/inbox?" + new URLSearchParams({ cursor }), { cache: "no-store", signal });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error("Could not load notices");
      const next = inboxList.parse(await response.json());
      if (signal.aborted) return;
      const existing = new Set(items.map(item => item.id));
      const unseen = next.items.filter(item => !existing.has(item.id));
      setPage(previous => ({ items: [...(previous?.items ?? []), ...unseen], nextCursor: next.nextCursor }));
      if (unseen.some(item => !item.readAt)) setReadAll(false);
    }, "Не удалось загрузить остальные уведомления.");
  }

  function renderNotice(item: Notice) {
    return <ReadNotice item={item} read={Boolean(item.readAt || read.has(item.id))}
      onRead={markRead} onUnauthorized={onUnauthorized}/>;
  }

  return <>
    {direct && <a href="#inbox" className="p-text-link">К входящим</a>}
    <PrototypeInbox items={items} read={read} opened={opened}
      onToggle={id => { setOpened(value => value === id ? null : id); }}
      onClose={() => setOpened(null)}
      onReadAll={readEverything} readAllDisabled={busy || readAll || unreadCount === 0}
      renderDetail={id => direct?.id === id ? renderNotice(direct) :
        <Resource url={noticeUrl(id)} schema={inboxDetail} onUnauthorized={onUnauthorized}>{renderNotice}</Resource>}/>
    {cursor && <button type="button" className="p-secondary p-inbox-more" disabled={busy} onClick={loadNext}>Ещё уведомления</button>}
    {error && <p className="load-error" role="alert">{error}</p>}
  </>;
}

export function LivePrototypeInbox({ badge, onUnauthorized, detailId }: InboxProps) {
  if (detailId) return <Resource url={noticeUrl(detailId)} schema={inboxDetail} onUnauthorized={onUnauthorized}>
    {item => <InboxFeed key={item.id} data={{ items: [item], unreadCount: item.readAt ? 0 : 1, nextCursor: null }}
      direct={item} badge={badge} onUnauthorized={onUnauthorized}/>}
  </Resource>;
  return <Resource url="/api/v1/inbox" schema={inboxList} onUnauthorized={onUnauthorized}>
    {data => <InboxFeed data={data} badge={badge} onUnauthorized={onUnauthorized}/>}
  </Resource>;
}
