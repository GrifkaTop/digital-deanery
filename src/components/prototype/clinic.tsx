"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarCheck, CalendarDays, ChevronDown, Clock3, Download, HeartPulse, MapPin, Stethoscope } from "lucide-react";
import { clinicAfkSample, clinicOverview, type ClinicCommand, type ClinicOverview, type ClinicSlot } from "@/contracts/clinic";
import { dateInMoscow } from "@/contracts/calendar";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { CampusPage } from "./campus-page";
import "./clinic.css";

const path = "/api/v1/clinic";
const dayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const dateLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" });
const timeLabel = new Intl.DateTimeFormat("ru-RU", { timeStyle: "short", timeZone: "Europe/Moscow" });
const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" });
const dateText = (date: string) => dateLabel.format(new Date(date));
const clockText = (date: string) => timeLabel.format(new Date(date));

const errors: Record<string, string> = {
  CLINIC_SLOT_TAKEN: "Это время уже занято. Выберите другой интервал.",
  CLINIC_ALREADY_BOOKED: "У вас уже есть запись.",
  CLINIC_BOOKING_CLOSED: "Приём уже начался. Отмена онлайн недоступна.",
  NOT_FOUND: "Интервал недоступен. Выберите другое время.",
};

function DocumentGuide() {
  return <section className="campus-help clinic-documents" aria-labelledby="clinic-documents-heading">
    <h2 id="clinic-documents-heading">Подготовка к приёму</h2>
    <p className="campus-help-text">Перечень документов уточняйте у врача факультета. Здесь доступны только демонстрационные записи и справки вымышленного вуза.</p>
    <p>Запись на приём сама по себе не обновляет паспорт здоровья. Срок действия и допуск появятся после публикации результата врачом.</p>
  </section>;
}

function Passport({ data }: { data: ClinicOverview }) {
  const { passport, completion, now } = data;
  const updated = completion?.passportUpdatedAt;
  const current = passport && passport.validUntil >= dateInMoscow(now);
  return <section className="campus-panel clinic-passport" aria-labelledby="clinic-passport-heading">
    <h2 id="clinic-passport-heading">Паспорт здоровья</h2>
    {passport ? <>
      <p className="clinic-passport-state" data-current={current}>
        {updated ? "Обновлён после приёма" : current ? "Оформлен ранее" : "Срок действия истёк"}
      </p>
      <p>{current ? "Действует по " : "Действовал по "}<strong><time dateTime={passport.validUntil}>{dateText(passport.validUntil)}</time></strong> включительно.</p>
      {updated && <p className="campus-help-text">Обновление опубликовано <time dateTime={updated}>{dateText(updated)}</time>.</p>}
      {passport.medicalGroup && <p>Медицинская группа · <strong>{passport.medicalGroup}</strong></p>}
      <p>{passport.admitted ? "Допуск указан в паспорте." : "Допуск не указан в паспорте."}</p>
    </> : <p>Паспорт пока не опубликован.</p>}
    {completion && !updated && <p>Приём завершён <time dateTime={completion.completedAt}>{dateText(completion.completedAt)}</time>. Обновление паспорта ожидается.</p>}
    <a className="clinic-link" href="#sports">Паспорт в разделе «Физкультура»</a>
  </section>;
}

function Visit({ doctor, slot }: { doctor: NonNullable<ClinicOverview["doctor"]>; slot: ClinicSlot }) {
  return <dl className="campus-visit">
    <div><dt><CalendarDays size={18} aria-hidden="true"/>Когда</dt>
      <dd><time dateTime={slot.startsAt}>{dateText(slot.startsAt)}, {clockText(slot.startsAt)}</time>–{clockText(slot.endsAt)} МСК</dd></div>
    <div><dt><Stethoscope size={18} aria-hidden="true"/>Врач</dt><dd>{doctor.name}</dd></div>
    <div><dt><MapPin size={18} aria-hidden="true"/>Куда прийти</dt><dd>{doctor.place}</dd></div>
  </dl>;
}

function SlotPicker({ slots, select, disabled }: { slots: ClinicSlot[]; select: (slot: ClinicSlot) => void; disabled: boolean }) {
  const [day, setDay] = useState("");
  const days = new Map<string, ClinicSlot[]>();
  for (const slot of slots) {
    const key = dateInMoscow(slot.startsAt);
    const grouped = days.get(key);
    if (grouped) grouped.push(slot);
    else days.set(key, [slot]);
  }
  const active = days.has(day) ? day : days.keys().next().value;
  if (!active) return <p>Свободных дат пока нет.</p>;
  return <>
    <fieldset className="campus-field">
      <legend>Дата приёма</legend>
      <div className="campus-dates">
        {Array.from(days, ([key, [first]]) => <button key={key} type="button" className="campus-secondary campus-day"
          aria-pressed={active === key} disabled={disabled} onClick={() => setDay(key)}>
          <span>{weekdayLabel.format(new Date(first.startsAt))}</span>
          <time dateTime={key}>{dayLabel.format(new Date(first.startsAt))}</time>
        </button>)}
      </div>
    </fieldset>
    <div className="campus-field">
      <h3 id="clinic-time-label">Свободное время, МСК</h3>
      <div className="campus-times" role="group" aria-labelledby="clinic-time-label">
        {days.get(active)?.map(slot => <button key={slot.id} type="button" className="campus-secondary"
          disabled={disabled} onClick={() => select(slot)}>{clockText(slot.startsAt)}</button>)}
      </div>
    </div>
  </>;
}

function AfkPanel({ request, submit, busy, submitting, error }: {
  request: ClinicOverview["afk"]; submit: () => void; busy: boolean; submitting: boolean; error?: string;
}) {
  const [matched, setMatched] = useState(false);
  const [fileError, setFileError] = useState("");
  const selection = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const hadRequest = useRef(!!request);
  useEffect(() => {
    if (!hadRequest.current && request) heading.current?.focus({ preventScroll: true });
    hadRequest.current = !!request;
  }, [request]);
  useEffect(() => () => { selection.current += 1; }, []);
  async function select(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const chosen = ++selection.current;
    setMatched(false);
    setFileError("");
    if (!file) return;
    try {
      let same = false;
      if (file.size === clinicAfkSample.size) {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
        same = hex === clinicAfkSample.sha256;
      }
      if (chosen !== selection.current) return;
      if (same) setMatched(true);
      else {
        input.value = "";
        setFileError("Подходит только файл «atlas-afk-demo.txt» из ссылки выше.");
      }
    } catch {
      if (chosen !== selection.current) return;
      input.value = "";
      setFileError("Не удалось проверить файл. Скачайте образец и выберите его снова.");
    }
  }

  return <section className="campus-panel clinic-afk" aria-labelledby="clinic-afk-heading">
    <h2 id="clinic-afk-heading" ref={heading} tabIndex={-1}>Адаптивная физкультура</h2>
    <p>Демонстрационный случай после вымышленного перелома. Период АФК появляется после публикации решения сотрудником.</p>
    {request ? <>
      <p className={request.status === "approved" ? "campus-confirmed" : "clinic-afk-state"} role="status">
        {request.status === "submitted" ? "На рассмотрении" : request.status === "approved" ? "Согласовано" : "Отклонено"}
      </p>
      <p>Подано <time dateTime={request.submittedAt}>{dateText(request.submittedAt)}</time>. Приложена демосправка.</p>
      {request.status === "approved" && <p>Период АФК · с <time dateTime={request.startsOn}>{dateText(request.startsOn)}</time> по <time dateTime={request.endsOn}>{dateText(request.endsOn)}</time> включительно.</p>}
      {request.status !== "submitted" && <p className="campus-help-text">Решение опубликовано <time dateTime={request.publishedAt}>{dateText(request.publishedAt)}</time>.</p>}
    </> : <>
      <a className="clinic-link" href={clinicAfkSample.href} download={clinicAfkSample.name}><Download size={18} aria-hidden="true"/>Скачать демосправку</a>
      <form onSubmit={event => { event.preventDefault(); if (matched && !busy) submit(); }}>
        <label className="campus-field">
          <span>Прикрепить демосправку</span>
          <input type="file" accept=".txt,text/plain" className="clinic-file" onChange={select} disabled={busy} aria-describedby="clinic-file-description"/>
        </label>
        <p id="clinic-file-description" className="campus-help-text">Выберите скачанный образец. Файл проверяется на устройстве, заявка передаёт только ключ образца.</p>
        {matched && <p className="campus-confirmed" role="status">Демосправка прикреплена.</p>}
        {fileError && <p className="clinic-error" role="alert">{fileError}</p>}
        {error && <p className="clinic-error" role="alert">{error}</p>}
        <button type="submit" disabled={!matched || busy}>{submitting ? "Отправляем…" : "Подать заявку"}</button>
      </form>
    </>}
  </section>;
}

type Feedback = { section: "visit" | "afk"; message: string; error?: boolean };

export function ClinicWorkflow({ initial, onUnauthorized }: { initial: ClinicOverview; onUnauthorized: () => void }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<ClinicSlot | null>(null);
  const [busy, setBusy] = useState<ClinicCommand["action"] | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const pending = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef("");
  const { doctor, appointment, slots, now } = data;
  const stage = appointment ? "booked" : draft ? "review" : "pick";
  useEffect(() => () => { pending.current?.abort(); }, []);
  useEffect(() => {
    if (previousStage.current && previousStage.current !== stage) heading.current?.focus({ preventScroll: true });
    previousStage.current = stage;
  }, [stage]);

  async function submit(command: ClinicCommand) {
    if (pending.current) return;
    const controller = new AbortController();
    const section = command.action === "request_afk" ? "afk" : "visit";
    pending.current = controller;
    setBusy(command.action);
    setFeedback(null);
    try {
      const options = { signal: controller.signal, cache: "no-store" as const };
      const csrf = await fetch("/api/v1/csrf", options);
      if (csrf.status === 401) return onUnauthorized();
      if (!csrf.ok) throw new Error("CSRF failed");
      const { token } = await csrf.json();
      const response = await fetch(path, {
        ...options, method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify(command),
      });
      if (response.status === 401) return onUnauthorized();
      if (!response.ok) {
        const { code } = await response.json();
        if (code === "CLINIC_SLOT_TAKEN" || code === "NOT_FOUND" || code === "CLINIC_ALREADY_BOOKED") {
          const refresh = await fetch(path, options);
          if (refresh.status === 401) return onUnauthorized();
          if (refresh.ok && !controller.signal.aborted) {
            setData(clinicOverview.parse(await refresh.json()));
            setDraft(null);
          }
        }
        if (!controller.signal.aborted) setFeedback({ section, error: true, message: errors[code] ?? "Не удалось сохранить действие. Попробуйте ещё раз." });
        return;
      }
      const next = clinicOverview.parse(await response.json());
      if (controller.signal.aborted) return;
      setData(next);
      setDraft(null);
      if (command.action === "cancel") setFeedback({ section: "visit", message: "Запись отменена." });
    } catch {
      if (!controller.signal.aborted) setFeedback({ section, error: true, message: "Не удалось сохранить действие. Попробуйте ещё раз." });
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  return <div className="campus-columns">
    <div className="campus-stack">
      <Passport data={data}/>
      <section className="campus-panel campus-booking" aria-labelledby="clinic-booking-heading">
        <h2 id="clinic-booking-heading" ref={heading} tabIndex={-1}>
          {appointment ? "Моя запись" : draft ? "Проверьте запись" : "Запись к врачу факультета"}
        </h2>
        {feedback?.section === "visit" && <p className={feedback.error ? "clinic-error" : undefined} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
        {appointment ? <>
          {appointment.startsAt > now
            ? <p className="campus-confirmed"><CalendarCheck size={18} aria-hidden="true"/>Запись подтверждена</p>
            : <p><Clock3 size={18} aria-hidden="true"/> Ожидается отметка врача о приёме.</p>}
          <Visit doctor={appointment.doctor} slot={appointment}/>
          {appointment.startsAt > now && <button type="button" className="campus-secondary" disabled={!!busy}
            onClick={() => void submit({ action: "cancel", slotId: appointment.id })}>Отменить запись</button>}
        </> : doctor ? draft ? <>
          <Visit doctor={doctor} slot={draft}/>
          <div className="campus-actions">
            <button type="button" disabled={!!busy} onClick={() => void submit({ action: "book", slotId: draft.id })}>
              {busy === "book" ? "Подтверждаем…" : "Подтвердить запись"}
            </button>
            <button type="button" className="campus-secondary" disabled={!!busy} onClick={() => setDraft(null)}>Изменить время</button>
          </div>
        </> : <>
          <p><strong>{doctor.name}</strong></p>
          <p className="campus-clinician">{doctor.faculty} · {doctor.place}</p>
          <SlotPicker slots={slots} select={setDraft} disabled={!!busy}/>
        </> : <p>За вашим факультетом пока не закреплён врач.</p>}
      </section>
    </div>
    <div className="campus-aside">
      <AfkPanel request={data.afk} submit={() => void submit({ action: "request_afk", documentKey: clinicAfkSample.key })}
        busy={!!busy} submitting={busy === "request_afk"} error={feedback?.section === "afk" ? feedback.message : undefined}/>
      <DocumentGuide/>
    </div>
  </div>;
}

export function Clinic() {
  const auth = useAtlasSession();
  if (!auth) return null;
  return <CampusPage title="Поликлиника" icon={HeartPulse}
    description="Паспорт здоровья, запись к врачу факультета и демонстрационная заявка на адаптивную физкультуру.">
    <Resource url={path} schema={clinicOverview} onUnauthorized={auth.onUnauthorized}>
      {data => <ClinicWorkflow initial={data} onUnauthorized={auth.onUnauthorized}/>}
    </Resource>
  </CampusPage>;
}
