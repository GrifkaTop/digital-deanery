import { useEffect, useRef, useState, type FormEvent, type Ref, type RefObject } from "react";
import { ArrowLeft, Check, ChevronRight, Clock3, Download, FileText, MessageSquare } from "lucide-react";
import { AtlasTextarea } from "./atlas-textarea";
import { filterDemoRequests, type DemoRequest, type DemoRequestFilter, type DemoRequestStatus } from "./request-demo";
import "./request-pages.css";

const filters: { id: DemoRequestFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "В работе" },
  { id: "ready", label: "Готовые" },
];
const statuses = {
  accepted: { label: "Принята", tone: "active", stage: 0 },
  "in-progress": { label: "В работе", tone: "active", stage: 1 },
  "needs-answer": { label: "Нужен ответ", tone: "warning", stage: 1 },
  ready: { label: "Готова", tone: "success", stage: 2 },
} as const satisfies Record<DemoRequestStatus, { label: string; tone: string; stage: number }>;
const stages = ["Подана", "На рассмотрении", "Готова"];
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" });
const historyDateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" });
const sampleUrl = `data:text/plain;charset=utf-8,${encodeURIComponent("ОБРАЗЕЦ · СИНТЕТИЧЕСКИЕ ДАННЫЕ. Справка об обучении. Демонстрационный документ, не является официальной справкой.")}`;

function RequestStatus({ status }: { status: DemoRequestStatus }) {
  const { label, tone } = statuses[status];
  return <span className="atlas-request-status" data-tone={tone}>{label}</span>;
}

function RequestDetail({ item, heading, onBack, onAnswer }: {
  item: DemoRequest;
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onAnswer: (id: number, answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);
  const current = statuses[item.status];
  const updatedAt = item.history.at(-1)?.at ?? item.createdAt;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.trim()) return;
    onAnswer(item.id, answer.trim());
    setAnswer("");
    setAnswered(true);
  }
  useEffect(() => { if (answered) confirmation.current?.focus(); }, [answered]);

  return <>
    <button type="button" className="ss-back atlas-request-back" onClick={onBack}><ArrowLeft size={19} aria-hidden="true"/>К заявкам</button>
    <header className="atlas-request-hero">
      <p>{item.publicNo}</p>
      <h1 ref={heading} tabIndex={-1}>{item.name}</h1>
      <div><RequestStatus status={item.status}/><span><Clock3 size={16} aria-hidden="true"/><time dateTime={updatedAt}>{dateFormat.format(new Date(updatedAt))}</time></span></div>
    </header>
    <section className="atlas-request-panel" aria-labelledby="atlas-request-stages">
      <h2 id="atlas-request-stages">Этапы заявки</h2>
      <ol className="atlas-request-stages">
        {stages.map((label, index) => <li key={label} data-reached={index <= current.stage} aria-current={index === current.stage ? "step" : undefined}>
          <span aria-hidden="true">{index < current.stage ? <Check size={16}/> : index + 1}</span><strong>{label}</strong>
        </li>)}
      </ol>
    </section>
    {item.status === "ready" && <section className="atlas-request-panel atlas-request-action" aria-labelledby="atlas-request-document">
      <div><h2 id="atlas-request-document">Справка готова</h2><p>Демонстрационный образец · TXT</p></div>
      <a className="ss-primary" download="obrazets-spravki.txt" href={sampleUrl}><Download size={19} aria-hidden="true"/>Скачать образец</a>
    </section>}
    {item.status === "needs-answer" && item.clarification && <form className="atlas-request-panel atlas-request-reply" onSubmit={submit} aria-labelledby="atlas-request-reply">
      <h2 id="atlas-request-reply"><MessageSquare size={19} aria-hidden="true"/>Уточнение по заявке</h2>
      <p>{item.clarification}</p>
      <label>Ваш ответ<AtlasTextarea rows={3} value={answer} onChange={event => setAnswer(event.target.value)} required/></label>
      <button type="submit" className="ss-primary" disabled={!answer.trim()}>Отправить ответ</button>
    </form>}
    {answered && <p className="atlas-request-confirmation" role="status" ref={confirmation} tabIndex={-1}>Ответ добавлен. Заявка снова на рассмотрении.</p>}
    <section className="atlas-request-panel" aria-labelledby="atlas-request-history">
      <h2 id="atlas-request-history">История заявки</h2>
      <ol className="atlas-request-history">
        {item.history.map((entry, index) => <li key={`${entry.at}-${index}`}>
          <div><strong>{statuses[entry.status].label}</strong><time dateTime={entry.at}>{historyDateFormat.format(new Date(entry.at))}</time></div>
          {entry.note && <p>{entry.note}</p>}
        </li>)}
      </ol>
    </section>
    <section className="atlas-request-panel" aria-labelledby="atlas-request-info">
      <h2 id="atlas-request-info">Сведения о заявке</h2>
      <dl className="atlas-request-info"><div><dt>Цель</dt><dd>{item.purpose}</dd></div>
        {item.details && <div><dt>Дополнительно</dt><dd>{item.details}</dd></div>}
      </dl>
    </section>
  </>;
}

export function PrototypeRequests({ items, visible, heading, onAnswer }: {
  items: readonly DemoRequest[];
  visible: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  onAnswer: (id: number, answer: string) => void;
}) {
  const [filter, setFilter] = useState<DemoRequestFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listReturn = useRef<{ buttonId: string; scrollY: number } | null>(null);
  const selected = items.find(item => item.id === selectedId);
  const results = filterDemoRequests(items, filter);

  useEffect(() => {
    if (!visible) return;
    const returnTo = selectedId === null ? listReturn.current : null;
    window.scrollTo({ top: returnTo?.scrollY ?? 0, behavior: "instant" });
    const target = (returnTo && document.getElementById(returnTo.buttonId)) || heading.current;
    target?.focus({ preventScroll: true });
    if (returnTo) listReturn.current = null;
  }, [selectedId, visible]);

  return <div className="atlas-requests" hidden={!visible}>
    {selected ? <RequestDetail key={selected.id} item={selected} heading={heading} onBack={() => setSelectedId(null)} onAnswer={onAnswer}/> : <>
      <div className="atlas-request-filters" role="group" aria-label="Фильтр заявок">
        {filters.map(({ id, label }) => <button type="button" aria-pressed={filter === id} key={id} onClick={() => setFilter(id)}>
          {label}<span>{filterDemoRequests(items, id).length}</span>
        </button>)}
      </div>
      <ul className="atlas-request-list">
        {results.map(item => <li key={item.id}><button id={`atlas-request-${item.id}`} type="button" className="atlas-request-row" onClick={event => {
          listReturn.current = { buttonId: event.currentTarget.id, scrollY: window.scrollY };
          setSelectedId(item.id);
        }}>
          <span className="atlas-request-icon"><FileText size={21} aria-hidden="true"/></span>
          <span className="atlas-request-copy"><strong>{item.name}</strong><small>{item.publicNo} · <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time></small></span>
          <RequestStatus status={item.status}/><ChevronRight className="atlas-request-chevron" size={16} aria-hidden="true"/>
        </button></li>)}
        {!results.length && <li className="atlas-request-empty">{filter === "all" ? "У вас пока нет заявок." : "Нет заявок с таким статусом."}</li>}
      </ul>
    </>}
  </div>;
}
