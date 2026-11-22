"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ZodType } from "zod";

type Load<T> = { state: "loading" | "missing" | "error" } | { state: "ready"; data: T; url: string; academicNow?: number };
export function Resource<T>({ url, schema, onUnauthorized, children, refreshMs, retainPrevious = false, reloadKey, fallback }: {
  url: string; schema: ZodType<T>; onUnauthorized: () => void;
  children: (data: T, academicNow?: number) => ReactNode; refreshMs?: number; retainPrevious?: boolean; reloadKey?: number; fallback?: ReactNode;
}) {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let reading = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    async function read(background = false) {
      if (reading) return;
      reading = true;
      if (!background) {
        setRefreshFailed(false);
        setLoad((previous) => retainPrevious && previous.state === "ready" ? previous : { state: "loading" });
      }
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 404) {
          clearInterval(timer);
          if (response.status === 401) return onUnauthorized();
          return setLoad({ state: "missing" });
        }
        if (!response.ok) throw new Error("Could not load data");
        const data = schema.parse(await response.json());
        const clock = Date.parse(response.headers.get("X-Academic-Now") ?? "");
        if (!controller.signal.aborted) setLoad({
          state: "ready", data, url, academicNow: Number.isFinite(clock) ? clock : undefined,
        });
      } catch {
        if (!controller.signal.aborted && !background) {
          setLoad((previous) => retainPrevious && previous.state === "ready" ? previous : { state: "error" });
          setRefreshFailed(true);
        }
      } finally {
        reading = false;
      }
    }
    void read();
    if (refreshMs) timer = setInterval(() => { void read(true); }, refreshMs);
    return () => { controller.abort(); clearInterval(timer); };
  }, [url, schema, onUnauthorized, attempt, refreshMs, retainPrevious, reloadKey]);

  if (load.state === "ready" && (retainPrevious || load.url === url)) return <>
    {load.url !== url && !refreshFailed && <span className="sr-only" role="status">Обновляем данные…</span>}
    {children(load.data, load.academicNow)}
    {refreshFailed && <div className="load-error">
      <p role="alert">Не удалось обновить данные. Показаны последние загруженные данные.</p>
      <button type="button" className="quiet-button" onClick={() => setAttempt(attempt + 1)}>Повторить</button>
    </div>}
  </>;
  if (fallback !== undefined) return fallback;
  if (load.state === "missing") return <p role="status">Страница недоступна</p>;
  if (load.state === "error") return <div className="load-error">
    <p role="alert">Не удалось загрузить данные.</p>
    <button type="button" className="quiet-button" onClick={() => setAttempt(attempt + 1)}>Повторить</button>
  </div>;
  return <div className="loading-card" role="status"><span>Загружаем данные…</span></div>;
}
