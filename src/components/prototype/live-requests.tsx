"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Download, FileText, Search } from "lucide-react";
import type { Profile } from "@/contracts/auth";
import { isCertificate, kindLabel, requestDetail, requestList, statusLabel, type RequestSummary } from "@/contracts/requests";
import { serviceFormKind, serviceList } from "@/contracts/services";
import { Clarify, RequestView, SubmittedRequisites, type RequestMemory } from "../request-views";
import { Resource } from "../resource";
import "./request-pages.css";
import "./services-sports.css";

const filters = [
  { id: "all", name: "Все", query: "all" },
  { id: "active", name: "В работе", query: "atlas_active" },
  { id: "ready", name: "Готовые", query: "atlas_ready" },
] as const;
const statuses = {
  submitted: { label: "Принята", tone: "active", stage: 0 },
  in_progress: { label: "В работе", tone: "active", stage: 1 },
  needs_clarification: { label: "Нужен ответ", tone: "warning", stage: 1 },
  ready: { label: "Готова", tone: "success", stage: 2 },
  approved: { label: "Одобрена", tone: "success", stage: 2 },
  registered: { label: "Зарегистрирована", tone: "active", stage: 2 },
  rejected: { label: "Отклонена", tone: "warning", stage: 2 },
} as const satisfies Record<RequestSummary["status"], { label: string; tone: string; stage: number }>;
const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" });
const historyDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" });

function ServiceNavigation({ active, count }: { active: "catalog" | "requests"; count: number }) {
  return <>
    <header className="ss-header ss-services-heading">
      <h1>Услуги и заявки</h1><span className="ss-demo">Демонстрационные данные</span>
    </header>
    <nav className="ss-tabs" aria-label="Разделы услуг">
      <a href="#services" aria-current={active === "catalog" ? "page" : undefined}>Каталог услуг</a>
      <a href="#requests" aria-current={active === "requests" ? "page" : undefined}>Мои заявки <span>{count}</span></a>
    </nav>
  </>;
}

function RequestStatus({ status }: { status: RequestSummary["status"] }) {
  const { label, tone } = statuses[status];
  return <span className="atlas-request-status" data-tone={tone}>{label}</span>;
}

type Props = { id?: string; catalog?: boolean; search: Record<string,string>; profile: Profile; memory: RequestMemory; onUnauthorized: () => void; returnFocus?: { id: string; y: number } };

function Catalog({ onUnauthorized }: Pick<Props, "onUnauthorized">) {
  const [category, setCategory] = useState("Все");
  const [search, setSearch] = useState("");
  return <div className="ss-page">
    <Resource url="/api/v1/requests" schema={requestList} onUnauthorized={onUnauthorized}>
      {data => <ServiceNavigation active="catalog" count={data.counts?.all ?? data.items.length}/>}
    </Resource>
    <Resource url="/api/v1/services" schema={serviceList} onUnauthorized={onUnauthorized}>
      {({ items }) => {
        const categories = ["Все", ...new Set(items.map(item => item.category))];
        const query = search.toLocaleLowerCase("ru").trim();
        const visible = items.filter(item => (category === "Все" || item.category === category)
          && (item.title + " " + item.description).toLocaleLowerCase("ru").includes(query));
        return <>
          <div className="ss-tools"><div className="ss-filter" role="group" aria-label="Категория услуг">
            {categories.map(value => <button key={value} type="button" className={category === value ? "active" : ""} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}
          </div><label className="ss-search"><Search size={19}/><span className="ss-sr">Поиск услуг</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск услуги"/>
          </label></div>
          <div className="ss-service-list">
            {visible.map(item => <article className="ss-service" key={item.code}>
              <div className="ss-service-icon"><FileText size={21}/></div><div><h2>{item.title}</h2><span className="ss-category">{item.category}</span><p>{item.description}</p></div>
              {serviceFormKind(item) ? <a className="ss-open" href={"#requests/new?" + new URLSearchParams({ kind: item.code })} aria-label={"Оформить: " + item.title}>Оформить <ArrowRight size={18}/></a>
                : <span className="ss-muted">Форма обновляется</span>}
            </article>)}
            {visible.length === 0 && <div className="ss-empty"><h2>Ничего не найдено</h2><p>Попробуйте изменить запрос или категорию.</p>
              <button className="ss-secondary" type="button" onClick={() => { setSearch(""); setCategory("Все"); }}>Сбросить фильтры</button></div>}
          </div>
        </>;
      }}
    </Resource>
  </div>;
}

function requestListHref(filter: (typeof filters)[number]["id"], cursor?: string) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("filter", filter);
  if (cursor) query.set("cursor", cursor);
  return query.size ? "#requests?" + query : "#requests";
}

function AtlasRequestList({ search, onUnauthorized, returnFocus }: Pick<Props, "search" | "onUnauthorized" | "returnFocus">) {
  const filter = filters.find(item => item.id === search.filter) ?? filters[0];
  const query = new URLSearchParams({ filter: filter.query });
  if (search.cursor && /^[A-Za-z0-9_-]+$/.test(search.cursor)) query.set("cursor", search.cursor);
  const focusRestored = useCallback((node: HTMLAnchorElement | null) => {
    if (!node || !returnFocus) return;
    window.scrollTo({ top: returnFocus.y, behavior: "instant" });
    node.focus({ preventScroll: true });
  }, [returnFocus]);
  return <div className="ss-page atlas-requests">
    <Resource url={"/api/v1/requests?" + query} schema={requestList} onUnauthorized={onUnauthorized}>
      {({ items, counts, nextCursor }) => <>
        <ServiceNavigation active="requests" count={counts?.all ?? items.length}/>
        <nav className="atlas-request-filters" aria-label="Фильтр заявок">
          {filters.map(item => <a key={item.id} href={requestListHref(item.id)} aria-current={item.id === filter.id ? "page" : undefined}>
            {item.name}{counts && <span>{counts[item.id]}</span>}
          </a>)}
        </nav>
        <ul className="atlas-request-list">
          {items.map(item => <li key={item.id}>
            <a id={"atlas-request-" + item.id} ref={returnFocus?.id === "atlas-request-" + item.id ? focusRestored : undefined} className="atlas-request-row" href={"#requests/" + item.id + "?" + new URLSearchParams({ filter: filter.id, ...(search.cursor ? { cursor: search.cursor } : {}) })}>
              <span className="atlas-request-icon"><FileText size={21} aria-hidden="true"/></span>
              <span className="atlas-request-copy"><strong>{kindLabel[item.kind]}</strong><small>{item.publicNo} · <time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time></small></span>
              <RequestStatus status={item.status}/><ChevronRight className="atlas-request-chevron" size={16} aria-hidden="true"/>
            </a>
          </li>)}
          {!items.length && <li className="atlas-request-empty">{filter.id === "all" ? "У вас пока нет заявок." : "Нет заявок с таким статусом."}</li>}
        </ul>
        {nextCursor && <a className="ss-secondary atlas-page-action" href={requestListHref(filter.id, nextCursor)}>Следующая страница</a>}
      </>}
    </Resource>
  </div>;
}

function AtlasRequestDetail({ id, search, memory, onUnauthorized }: Pick<Props, "search" | "memory" | "onUnauthorized"> & { id: string }) {
  const [revision, setRevision] = useState(0);
  const [answeredVersion, setAnsweredVersion] = useState<number | null>(null);
  const path = "/api/v1/requests/" + encodeURIComponent(id);
  const filter = filters.find(item => item.id === search.filter)?.id ?? "all";
  const origin = search.back === "#deadlines" || search.back === "#today" ? search.back : undefined;
  const back = origin ?? requestListHref(filter, search.cursor);
  const backLabel = origin === "#today" ? "На главную" : origin === "#deadlines" ? "К дедлайнам" : "К заявкам";
  const focusTitle = useCallback((node: HTMLHeadingElement | null) => node?.focus({ preventScroll: true }), []);
  const focusConfirmation = useCallback((node: HTMLParagraphElement | null) => node?.focus(), []);
  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  return <div className="ss-page atlas-requests">
    <a className="ss-back atlas-request-back" href={back}><ArrowLeft size={19} aria-hidden="true"/>{backLabel}</a>
    <Resource url={path} schema={requestDetail} onUnauthorized={onUnauthorized} reloadKey={revision} refreshMs={5_000} retainPrevious>
      {item => {
        const stage = statuses[item.status].stage;
        const answered = answeredVersion !== null && (item.version === answeredVersion || item.status !== "needs_clarification");
        const labels = ["Подана", "На рассмотрении", stage === 2 ? statusLabel[item.status] : "Готова"];
        return <>
          <header className="atlas-request-hero"><p>{item.publicNo}</p><h1 ref={focusTitle} tabIndex={-1}>{kindLabel[item.kind]}</h1>
            <div><RequestStatus status={item.status}/><span><Clock3 size={16} aria-hidden="true"/><time dateTime={item.updatedAt}>{date.format(new Date(item.updatedAt))}</time></span></div>
          </header>
          <section className="atlas-request-panel" aria-labelledby="atlas-request-stages"><h2 id="atlas-request-stages">Этапы заявки</h2>
            <ol className="atlas-request-stages">{labels.map((label, i) => <li key={i} data-reached={i <= stage} aria-current={i === stage ? "step" : undefined}>
              <span aria-hidden="true">{i < stage ? <Check size={16}/> : i + 1}</span><strong>{label}</strong></li>)}</ol>
          </section>
          {item.status === "ready" && isCertificate(item.kind) && <section className="atlas-request-panel atlas-request-action" aria-labelledby="atlas-request-document">
            <div><h2 id="atlas-request-document">Справка готова</h2><p>Демонстрационный образец · PDF</p></div>
            <a className="ss-primary" href={path + "/document"} download><Download size={19} aria-hidden="true"/>Скачать образец</a>
          </section>}
          {item.status === "needs_clarification" && !answered && <Clarify atlas key={item.version} item={item} memory={memory} onUnauthorized={onUnauthorized} onSaved={() => {
            setAnsweredVersion(item.version);
            setRevision(number => number + 1);
          }}/>}
          {answered && <p className="atlas-request-confirmation" role="status" ref={focusConfirmation} tabIndex={-1}>Ответ добавлен. Заявка снова на рассмотрении.</p>}
          <section className="atlas-request-panel" aria-labelledby="atlas-request-history"><h2 id="atlas-request-history">История заявки</h2>
            <ol className="atlas-request-history">{item.history.map(entry => <li key={entry.version}><div>
              <strong>{statuses[entry.toStatus].label}</strong><time dateTime={entry.createdAt}>{historyDate.format(new Date(entry.createdAt))}</time></div>
              {entry.reason && <p>{entry.reason}</p>}
            </li>)}</ol>
          </section>
          <SubmittedRequisites atlas item={item}/>
        </>;
      }}
    </Resource>
  </div>;
}

export function LiveAtlasRequests({ id, catalog, search, profile, memory, onUnauthorized, returnFocus }: Props) {
  if (catalog || id === "new" && !search.kind) return <Catalog onUnauthorized={onUnauthorized}/>;
  if (id === "new") return <div className="ss-page">
    <Resource url="/api/v1/requests" schema={requestList} onUnauthorized={onUnauthorized}>
      {data => <ServiceNavigation active="catalog" count={data.counts?.all ?? data.items.length}/>}
    </Resource>
    <RequestView atlas screen="requestNew" search={search} profile={profile} memory={memory} onUnauthorized={onUnauthorized}/></div>;
  if (id) return <AtlasRequestDetail key={id} id={id} search={search} memory={memory} onUnauthorized={onUnauthorized}/>;
  return <AtlasRequestList search={search} onUnauthorized={onUnauthorized} returnFocus={returnFocus}/>;
}
