"use client";

import { useEffect, useRef, useState } from "react";
import { dateInMoscow } from "@/contracts/calendar";
import { sportsList } from "@/contracts/sports";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { SportsPrototype, type LiveSportData, type SportSession, type SportTab } from "./services-sports";
import type { infer as Infer } from "zod";
import "./services-sports.css";

type SportsData = Infer<typeof sportsList>;
const medicalGroupNames: Record<string, string> = {
  main: "Основная", preparatory: "Подготовительная / дополнительная",
  special: "Специальная медицинская", adaptive: "Адаптивная физкультура",
};
const time = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
}).format(new Date(value));
const apiErrors: Record<string, string> = {
  FULL: "Свободных мест уже нет. Обновите список занятий.",
  BOOKING_LIMIT: "У вас уже две активные записи. Отмените одну, чтобы выбрать это занятие.",
  BOOKING_CLOSED: "Запись на это занятие закрыта.",
};

function SportsDataView({ data, changed, visible }: { data: SportsData; changed: () => void; visible: boolean }) {
  const auth = useAtlasSession()!;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    };
  }, []);

  async function changeBooking(id: string, cancel: boolean) {
    if (pending.current) return;
    pending.current = true;
    setPendingId(id);
    setError("");
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const csrfResponse = await fetch("/api/v1/csrf", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (csrfResponse.status === 401) return auth.onUnauthorized();
      if (!csrfResponse.ok) throw new Error("Не удалось подтвердить запрос. Повторите попытку.");
      const { token } = await csrfResponse.json() as { token?: string };
      if (!token) throw new Error("Не удалось подтвердить запрос. Повторите попытку.");
      const response = await fetch(`/api/v1/sports/${encodeURIComponent(id)}/booking`, {
        method: cancel ? "DELETE" : "POST",
        headers: { "X-CSRF-Token": token }, signal: controller.signal, cache: "no-store",
      });
      if (controller.signal.aborted) return;
      if (response.status === 401) { auth.onUnauthorized(); return; }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { code?: string };
        throw new Error(apiErrors[payload.code ?? ""] ?? "Не удалось изменить запись. Попробуйте ещё раз.");
      }
      changed();
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(cause instanceof Error ? cause.message : "Не удалось изменить запись.");
    } finally {
      controllers.current.delete(controller);
      pending.current = false;
      if (mounted.current) setPendingId(null);
    }
  }

  const groups: Record<SportTab, SportSession[]> = { "Занятия": [], "Отработки": [], "Бассейн": [] };
  const tabByKind = { class: "Занятия", makeup: "Отработки", pool: "Бассейн" } as const;
  const booked: string[] = [];
  const now = Date.parse(data.now);
  for (const item of data.items) {
    if (Date.parse(item.startsAt) <= now) continue;
    const active = item.booking === "active";
    if (active) booked.push(item.id);
    groups[tabByKind[item.kind]].push({
      id: item.id, name: item.title, date: dateInMoscow(item.startsAt), time: time(item.startsAt) + "–" + time(item.endsAt),
      teacher: item.teacherName ?? "Не указан", place: item.place, capacity: item.capacity,
      occupied: item.capacity - item.available - Number(active), bookingOpen: item.bookingOpen,
    });
  }
  const passport = data.passport;
  const live: LiveSportData = {
    today: dateInMoscow(data.now), groups, booked, pendingId, error, onBooking: changeBooking,
    passport: passport ? { validThrough: passport.validUntil, admitted: passport.admitted,
      group: passport.medicalGroup && (medicalGroupNames[passport.medicalGroup] ?? passport.medicalGroup) } : null,
    currentId: data.results.find(item => item.isCurrent)?.semesterId,
    terms: data.results.map(term => ({
      id: term.semesterId, label: term.label, attended: term.attendance, goal: term.targetAttendance,
      minimumPoints: term.minimumPoints ?? null, points: term.score, norms: term.norms ?? [],
      result: term.result, priorYearId: term.priorSemesterId ?? undefined,
    })),
  };
  return <SportsPrototype visible={visible} live={live}/>;
}

export function LiveSports({ visible }: { visible: boolean }) {
  const auth = useAtlasSession()!;
  const [revision, setRevision] = useState(0);
  return <Resource url="/api/v1/sports" schema={sportsList} onUnauthorized={auth.onUnauthorized} reloadKey={revision} refreshMs={60_000} retainPrevious>
    {data => <SportsDataView visible={visible} data={data} changed={() => setRevision(value => value + 1)} />}
  </Resource>;
}
