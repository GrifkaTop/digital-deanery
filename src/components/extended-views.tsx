"use client";
import { useState } from "react";
import { scheduleResponse } from "@/contracts/academics";
import { assignmentItem, assignmentLabel } from "@/contracts/assignments";
import { searchResponse } from "@/contracts/search";
import { sportsList } from "@/contracts/sports";
import { CabinetLink } from "./cabinet-link";
import { Resource } from "./resource";

const dateTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(value));
export function AssignmentView({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  return <><CabinetLink href="/study" className="back-link">К учёбе</CabinetLink>
    <Resource url={`/api/v1/assignments/${encodeURIComponent(id)}`} schema={assignmentItem} onUnauthorized={onUnauthorized}>
      {item => <><h1>{item.title}</h1><section className="data-panel">
        <p>{assignmentLabel(item.kind, item.number)} · {item.teacherName}</p><p>{item.description}</p>
        <h2>Что сделать</h2><p>{item.actions}</p><h2>Что сдать</h2><p>{item.requirements}</p>
        {item.dueAt && <p>Срок сдачи {dateTime(item.dueAt)} МСК</p>}
        {item.maxScore !== null && <p>Максимум {item.maxScore} баллов</p>}
        {item.result && <p>Результат: {({ issued: "Выдано", completed: "Выполнено", defended: "Защищено" })[item.result.stage]}
          {item.result.score !== null && ` · ${item.result.score} баллов`}{item.result.onTime !== null && (item.result.onTime ? " · В срок" : " · После срока")}</p>}
      </section></>}
    </Resource></>;
}
export function SportsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function change(id: string, cancel: boolean) {
    setPending(true); setMessage("");
    try {
      const csrf = await fetch("/api/v1/csrf", { cache: "no-store" });
      if (csrf.status === 401) return onUnauthorized();
      if (!csrf.ok) throw new Error();
      const { token } = await csrf.json();
      const response = await fetch(`/api/v1/sports/${encodeURIComponent(id)}/booking`, { method: cancel ? "DELETE" : "POST", headers: { "X-CSRF-Token": token } });
      if (response.status === 401) return onUnauthorized();
      if (!response.ok) { setMessage(response.status === 409 ? "Запись закрыта или свободных мест больше нет." : "Не удалось изменить запись."); return; }
      setRevision(value => value + 1);
    } catch { setMessage("Не удалось изменить запись."); } finally { setPending(false); }
  }
  return <><h1>Физкультура</h1><Resource url="/api/v1/sports" schema={sportsList} onUnauthorized={onUnauthorized} reloadKey={revision}>
    {data => <><section className="data-panel"><h2>Допуск</h2>{data.passport ? <p>{data.passport.admitted ? "Допущен" : "Допуск не получен"} · паспорт до {data.passport.validUntil}</p> : <p>Сведения о допуске отсутствуют.</p>}
      {data.results.map(result => <p key={result.semesterId}>{result.result ?? "Результат ожидается"}{result.score !== null && ` · ${result.score} баллов`}</p>)}</section>
      {message && <p role="alert">{message}</p>}{data.items.length === 0 && <p>Занятий пока нет.</p>}
      {data.items.map(item => <section className="data-panel" key={item.id}><h2>{item.title}</h2><p>{dateTime(item.startsAt)}–{dateTime(item.endsAt)} МСК · {item.place}</p><p>Свободно мест: {item.available} из {item.capacity}</p>
        {item.attended !== null && <p>{item.attended ? "Посещение отмечено" : "Не посещено"}</p>}
        <button type="button" className="quiet-button" disabled={pending || (item.booking !== "active" && !item.bookingOpen)} onClick={() => void change(item.id, item.booking === "active")}>{item.booking === "active" ? "Отменить запись" : "Записаться"}</button>
      </section>)}</>}
    </Resource></>;
}

export function TeacherView({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  const [day, setDay] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  return <><CabinetLink href="/schedule" className="back-link">К расписанию</CabinetLink><h1>Расписание преподавателя</h1>
    <label htmlFor="teacher-date">Дата</label><input id="teacher-date" type="date" value={day} onChange={event => setDay(event.target.value)} />
    {day && <Resource url={`/api/v1/teachers/${encodeURIComponent(id)}/schedule?date=${encodeURIComponent(day)}&view=week`} schema={scheduleResponse} onUnauthorized={onUnauthorized}>
      {data => data.items.length ? data.items.map(item => <CabinetLink key={item.id} href={`/schedule/${item.id}`} className="data-row">
        <span><strong>{item.title}</strong><br />{dateTime(item.startsAt)} · {item.room}</span>
      </CabinetLink>) : <p>На этой неделе занятий нет.</p>}
    </Resource>}
  </>;
}

export function SearchView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  return <><h1>Поиск</h1><form onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); }}>
    <label htmlFor="search-query">Дисциплина, преподаватель или раздел</label>
    <input id="search-query" value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} />
    <button className="quiet-button" type="submit">Найти</button>
  </form>{query && <Resource url={`/api/v1/search?q=${encodeURIComponent(query)}`} schema={searchResponse} onUnauthorized={onUnauthorized}>
    {data => data.items.length ? data.items.map(item => <CabinetLink key={`${item.type}:${item.id}`} className="data-row" href={item.type === "section" ? item.id : `/${item.type === "teacher" ? "teachers" : "study"}/${item.id}`}>{item.title}</CabinetLink>) : <p>Ничего не найдено.</p>}
  </Resource>}</>;
}
