"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, GraduationCap } from "lucide-react";
import { vucOverview, vucStudy, type VucCommand, type VucOverview, type VucSlot } from "@/contracts/vuc";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { CampusPage } from "./campus-page";
import "./vuc.css";

const steps = [
  { title: "Подайте заявление", text: "В реальном отборе учебный центр также сообщает порядок предварительной проверки." },
  { title: "Запишитесь на испытания", text: "Выберите время и проверьте место в подтверждении записи." },
  { title: "Проверьте баллы", text: "Комиссия публикует отдельно физподготовку и текущую успеваемость." },
  { title: "Дождитесь решения", text: "После опубликованного допуска здесь появятся расписание и дальнейшие требования." },
];

const checklist = [
  { id: "conditions", label: "Уточнить условия набора" },
  { id: "documents", label: "Сверить перечень документов" },
  { id: "application", label: "Подготовить заявление" },
  { id: "deadlines", label: "Записать сроки отбора" },
] as const;

export type VucChecklistItem = typeof checklist[number]["id"];

const statuses: Record<VucOverview["status"], string> = {
  not_applied: "Заявление ещё не подано",
  submitted: "Заявление подано",
  scheduled: "Вы записаны на испытания",
  awaiting_results: "Ожидаем публикацию результатов",
  results_published: "Результаты опубликованы",
  admitted: "Допущены к обучению",
  not_admitted: "В допуске отказано",
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" });
const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const valueFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
function dateText(timestamp: string) { return dateFormat.format(new Date(timestamp)); }

function SlotTime({ slot }: { slot: Pick<VucSlot, "startsAt" | "endsAt"> }) {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  return <><time dateTime={slot.startsAt}>{dateFormat.format(start)}, {timeFormat.format(start)}</time>–<time dateTime={slot.endsAt}>{timeFormat.format(end)}</time> МСК</>;
}

type Result = NonNullable<VucOverview["results"]>;
const exercises = [
  { id: "pullUps", title: "Подтягивание на перекладине", unit: "повт." },
  { id: "sprintSeconds", title: "Бег на 100 м", unit: "с" },
  { id: "distanceSeconds", title: "Бег на 1 км", unit: "с" },
] as const;

function Results({ results }: { results: Result | null }) {
  return <section className="campus-panel" aria-labelledby="vuc-results-heading">
    <h2 id="vuc-results-heading">{results ? "Результаты отбора" : "Испытания и баллы"}</h2>
    <p className="campus-help-text">Упражнения показаны на примере вымышленного набора. Выбор испытаний реального набора публикует учебный центр.</p>
    <ul className="vuc-exercises">
      {exercises.map(({ id, title, unit }) => <li key={id}><span>{title}</span>
        {results && <strong>{valueFormat.format(results.exercises[id])} {unit}</strong>}
      </li>)}
    </ul>
    {results ? <>
      <dl className="vuc-scores">
        <div><dt>Физподготовка</dt><dd>{results.physicalScore} <span>из 100</span></dd></div>
        <div><dt>Успеваемость</dt><dd>{results.academicScore} <span>из 100</span></dd></div>
        <div><dt>Сумма</dt><dd>{results.total} <span>из 200</span></dd></div>
      </dl>
      <p className="campus-help-text">Баллы опубликованы <time dateTime={results.publishedAt}>{dateText(results.publishedAt)}</time>. Решение о допуске принимает комиссия.</p>
    </> : <p className="campus-help-text">Комиссия публикует две оценки до 100 баллов каждую. Итоговая сумма составляет до 200 баллов.</p>}
  </section>;
}

function AdmittedStudy({ onUnauthorized }: { onUnauthorized: () => void }) {
  return <Resource url="/api/v1/vuc/study" schema={vucStudy} onUnauthorized={onUnauthorized}>
    {data => <section className="campus-panel" aria-labelledby="vuc-study-heading">
      <h2 id="vuc-study-heading">Расписание и требования</h2>
      <ul className="vuc-schedule">
        {data.schedule.map(item => <li key={item.startsAt}>
          <h3>{item.title}</h3><p><SlotTime slot={item}/></p><p>{item.place}</p>
        </li>)}
      </ul>
      <h3>Что дальше</h3><ul className="vuc-requirements">{data.requirements.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
  </Resource>;
}

const errorText: Record<string, string> = {
  APPLICATION_REQUIRED: "Сначала подайте заявление.",
  ALREADY_BOOKED: "Запись уже существует. Проверьте подтверждение.",
  NOT_FOUND: "Это время больше недоступно. Выберите другой интервал.",
  CSRF_REJECTED: "Срок подтверждения истёк. Повторите действие.",
};

function Admission({ data, onUnauthorized, onChanged }: {
  data: VucOverview; onUnauthorized: () => void; onChanged: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [focusStatus, setFocusStatus] = useState<VucOverview["status"] | null>(null);
  const request = useRef<AbortController | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (focusStatus !== data.status) return;
    title.current?.focus({ preventScroll: true });
    setFocusStatus(null);
  }, [data.status, focusStatus]);

  async function save(command: VucCommand) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    try {
      const csrf = await fetch("/api/v1/csrf", { signal: controller.signal, cache: "no-store" });
      if (csrf.status === 401) return onUnauthorized();
      if (!csrf.ok) throw new Error("CSRF");
      const { token } = await csrf.json() as { token?: string };
      if (!token) throw new Error("CSRF");
      const response = await fetch("/api/v1/vuc", {
        method: "POST", signal: controller.signal, cache: "no-store",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(command),
      });
      if (response.status === 401) return onUnauthorized();
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { code?: string };
        if (!controller.signal.aborted) { setError(errorText[body.code ?? ""] ?? "Не удалось сохранить действие. Повторите попытку."); onChanged(); }
        return;
      }
      const confirmed = vucOverview.parse(await response.json());
      if (!controller.signal.aborted) { setFocusStatus(confirmed.status); onChanged(); }
    } catch {
      if (!controller.signal.aborted) setError("Не удалось подтвердить действие. Попробуйте ещё раз.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  const selectedSlot = data.availableSlots.find(slot => slot.id === selected);
  return <>
    <section className="campus-panel vuc-application" aria-labelledby="vuc-application-heading">
      <h2 id="vuc-application-heading">Моё заявление</h2>
      <h3 className="vuc-status" ref={title} tabIndex={-1} aria-live="polite">{statuses[data.status]}</h3>
      {data.submittedAt && <p className="campus-help-text">Подано <time dateTime={data.submittedAt}>{dateText(data.submittedAt)}</time></p>}
      {data.decidedAt && <p className="campus-help-text">Решение опубликовано <time dateTime={data.decidedAt}>{dateText(data.decidedAt)}</time></p>}
      {data.status === "not_applied" && <>
        <p>Подайте заявление в демонстрационном кабинете, чтобы выбрать время испытаний.</p>
        <button type="button" className="campus-primary" disabled={pending} onClick={() => void save({ action: "apply" })}>
          {pending ? "Подаём заявление…" : "Подать демозаявление"}
        </button>
      </>}
      {data.status === "submitted" && (data.availableSlots.length > 0
        ? <form onSubmit={event => { event.preventDefault(); if (selectedSlot) void save({ action: "book", slotId: selectedSlot.id }); }}>
          <fieldset className="vuc-slots" disabled={pending}>
            <legend>Выберите время испытаний</legend>
            {data.availableSlots.map(slot => <label key={slot.id}>
              <input type="radio" name="vuc-slot" value={slot.id} checked={selected === slot.id} onChange={() => setSelected(slot.id)}/>
              <span><strong><SlotTime slot={slot}/></strong><small>{slot.place}</small></span>
            </label>)}
          </fieldset>
          <button type="submit" className="campus-primary" disabled={pending || !selectedSlot}>
            {pending ? "Записываем…" : "Записаться на испытания"}
          </button>
        </form>
        : <p>Доступных дат пока нет. Проверьте этот раздел позже.</p>)}
      {data.appointment && <div className="vuc-appointment">
        <CalendarDays size={20} aria-hidden="true"/><div><strong><SlotTime slot={data.appointment}/></strong><p>{data.appointment.place}</p></div>
      </div>}
      {data.status === "awaiting_results" && <p>Результаты и решение появятся здесь после публикации комиссией.</p>}
      {error && <p role="alert" className="vuc-error">{error}</p>}
    </section>
    <Results results={data.results}/>
    {data.status === "admitted" && <AdmittedStudy onUnauthorized={onUnauthorized}/>}
  </>;
}

export function Vuc({ checked, toggle }: {
  checked: ReadonlySet<VucChecklistItem>;
  toggle: (id: VucChecklistItem) => void;
}) {
  const auth = useAtlasSession()!;
  const [revision, setRevision] = useState(0);
  return <CampusPage title="Военный учебный центр" icon={GraduationCap}
    description="Демонстрационный отбор вымышленного кампуса. Подайте заявление, выберите время испытаний и следите за результатами.">
    <div className="campus-columns">
      <div className="campus-stack">
        <Resource url="/api/v1/vuc" schema={vucOverview} onUnauthorized={auth.onUnauthorized}
          retainPrevious refreshMs={30_000} reloadKey={revision}>
          {data => <Admission data={data} onUnauthorized={auth.onUnauthorized} onChanged={() => setRevision(value => value + 1)}/>}
        </Resource>
        <section className="campus-panel" aria-labelledby="vuc-steps-heading">
          <h2 id="vuc-steps-heading">Этапы отбора</h2>
          <ol className="campus-timeline" role="list">
            {steps.map(({ title, text }) => <li key={title}><div><h3>{title}</h3><p>{text}</p></div></li>)}
          </ol>
        </section>
      </div>
      <div className="campus-aside">
        <section className="campus-panel" aria-labelledby="vuc-checklist-heading">
          <h2 id="vuc-checklist-heading">Чек-лист подготовки</h2>
          <p role="status" className="campus-progress-label">Выполнено {checked.size} из {checklist.length}</p>
          <progress className="campus-progress" aria-labelledby="vuc-checklist-heading" value={checked.size} max={checklist.length}/>
          <ul className="campus-checklist" role="list">
            {checklist.map(({ id, label }) => <li key={id}><label><input type="checkbox" checked={checked.has(id)} onChange={() => toggle(id)}/><span>{label}</span></label></li>)}
          </ul>
          <p className="campus-help-text">Отметки сохраняются до окончания текущей сессии или обновления страницы.</p>
        </section>
        <section aria-labelledby="vuc-help-heading" className="campus-help">
          <h2 id="vuc-help-heading">Частые вопросы</h2>
          <details><summary>Где уточнить условия и документы?<ChevronDown size={18} aria-hidden="true"/></summary>
            <p>Перечень публикует учебный центр в объявлении о наборе. В примере консультации проходят в учебной части корпуса «Маяк», кабинет 205.</p></details>
          <details><summary>Как считают успеваемость?<ChevronDown size={18} aria-hidden="true"/></summary>
            <p>Комиссия публикует оценку текущей успеваемости. Период и способ расчёта уточняются в правилах конкретного набора.</p></details>
        </section>
      </div>
    </div>
  </CampusPage>;
}
