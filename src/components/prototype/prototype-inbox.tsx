import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Bell, BookOpen, CalendarClock, Check, ChevronRight, ClipboardCheck, FileText, FlaskConical } from "lucide-react";
import type { z } from "zod";
import { assignmentLabel } from "@/contracts/assignments";
import { inboxDetail, notificationLabels } from "@/contracts/inbox";
import { academicCategoryLabels, type AcademicCategory } from "./academic-categories";
import { FoldBody } from "./fold-section";
import { PublishedWorkScore, WorkScoreBadge } from "./published-work-score";

type Notice = z.output<typeof inboxDetail>;
type NoticeRow = Omit<Notice, "body" | "target">;

const noticeDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
});
const lessonDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const lessonTime = new Intl.DateTimeFormat("ru-RU", { timeStyle: "short", timeZone: "Europe/Moscow" });
const gradeCategories = new Map<string, AcademicCategory>([["dz", "homework"], ["rk", "control"], ["lr", "lab"]]);
const lessonKinds = { lecture: "Лекция", practice: "Практика", seminar: "Семинар", laboratory: "Лаб. работа" };
const categoryIcons = {
  homework: BookOpen, control: ClipboardCheck, lab: FlaskConical, schedule: CalendarClock, request: FileText,
};
const targetRoutes = {
  lesson: ["lesson", "Открыть занятие"], discipline: ["study", "К дисциплине"],
  assignment: ["work", "Открыть работу"], request: ["requests", "К заявке"],
} as const;

function categoryFor(item: NoticeRow) {
  if (item.context?.type === "grade" || item.context?.type === "work_deadline") return gradeCategories.get(item.context.workKind);
  if (item.kind === "schedule_change") return "schedule";
  if (item.kind === "request_update") return "request";
}

const locationLabel = (room: string, building: string | null) => [room, building].filter(Boolean).join(" · ");
const inboxFilters = [
  { key: "all", label: "Все", matches: () => true },
  { key: "important", label: "Важное", matches: (item: NoticeRow) => item.important },
  { key: "grades", label: "Оценки", matches: (item: NoticeRow) => item.context?.type === "grade" || item.kind === "assignment_result" },
  { key: "reminders", label: "Напоминания", matches: (item: NoticeRow) => item.kind === "deadline" },
  { key: "requests", label: "Заявки", matches: (item: NoticeRow) => item.kind === "request_update" },
] as const;

export function PrototypeNoticeBody({ item }: { item: Notice }) {
  const context = item.context;
  const category = categoryFor(item);
  const target = item.target && targetRoutes[item.target.kind];
  return <>
    {context?.type === "grade" ? <div className="p-inbox-work">
      <div className="p-inbox-work-copy">
        <div className="p-inbox-work-heading">
          <h2>{context.subject}</h2>
          <span className="p-work-category">{assignmentLabel(context.workKind, context.number)}</span>
        </div>
        <p>{context.title}</p>
      </div>
      {context.maxPoints === null
        ? <dl className="p-work-score"><dt>Баллы</dt><dd><strong>{context.points}</strong></dd></dl>
        : <PublishedWorkScore points={context.points} maxPoints={context.maxPoints}/>}
    </div> : context?.type === "room_change" ? <div className="p-inbox-work p-inbox-room-detail">
      <div><h2>{context.title}</h2><p>{lessonKinds[context.kind]}</p></div>
      <div className="p-inbox-room-destination">
        <div><span>Новая аудитория</span><strong>{locationLabel(context.room, context.building)}</strong></div>
        <div>
          <span>{lessonDate.format(new Date(context.startsAt))}</span>
          <strong><time dateTime={context.startsAt}>{lessonTime.format(new Date(context.startsAt))}</time>–<time dateTime={context.endsAt}>{lessonTime.format(new Date(context.endsAt))}</time></strong>
        </div>
      </div>
      <p>Было: аудитория {locationLabel(context.previousRoom, context.previousBuilding)}</p>
    </div> : <p>{item.body}</p>}
    {item.target && target && <a id={"atlas-notice-source-" + item.id}
      data-academic-category={category}
      href={"#" + target[0] + "/" + item.target.id + (item.target.kind === "request" ? "" : "?back=%23inbox")}>
      {target[1]}<ArrowRight size={17} aria-hidden="true"/>
    </a>}
  </>;
}

export function PrototypeInbox({ items, read, opened, onToggle, onClose, onReadAll, renderDetail, readAllDisabled }: {
  items: readonly NoticeRow[];
  read: ReadonlySet<string>;
  opened: string | null;
  onToggle: (id: string) => void;
  onClose: () => void;
  onReadAll: () => void;
  renderDetail: (id: string) => ReactNode;
  readAllDisabled: boolean;
}) {
  const [filter, setFilter] = useState<(typeof inboxFilters)[number]>(inboxFilters[0]);
  const all = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const feed = useId();
  const filtered = items.filter(filter.matches);
  function changeFilter(next: typeof filter) {
    if (filter === next) return;
    onClose();
    setFilter(next);
  }
  return <>
    <div className="p-page-heading p-inbox-heading">
      <div><h1>Уведомления</h1></div>
      <button type="button" className="p-secondary" aria-haspopup="dialog" disabled={readAllDisabled}
        onClick={() => {
          if (!confirm.current) return;
          confirm.current.returnValue = "";
          confirm.current.showModal();
        }}><Check size={17} aria-hidden="true"/>Прочитать все</button>
    </div>
    <dialog className="p-inbox-confirm" ref={confirm} aria-labelledby={dialogTitle} onClose={event => {
      if (event.currentTarget.returnValue === "confirm") {
        onReadAll();
        all.current?.focus();
      }
    }}>
      <h2 id={dialogTitle}>Отметить все уведомления как прочитанные?</h2>
      <p>Будут отмечены уведомления во всех категориях.</p>
      <form method="dialog">
        <button className="p-secondary" type="submit" value="cancel">Отмена</button>
        <button type="submit" value="confirm">Отметить</button>
      </form>
    </dialog>
    <div className="p-inbox-filters" role="group" aria-label="Тип уведомления">
      {inboxFilters.map(option => <button key={option.key} type="button" className="p-inbox-filter"
        ref={option.key === "all" ? all : undefined} aria-pressed={option === filter} aria-controls={feed}
        data-priority={option.key === "important" || undefined} data-academic-category={option.key === "requests" ? "request" : undefined}
        onClick={event => { changeFilter(option); event.currentTarget.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" }); }}>{option.label}</button>)}
    </div>
    <section id={feed} className="p-panel p-inbox-panel" aria-label="Уведомления">
      {filtered.length === 0 && <div className="p-inbox-empty">
        <p role="status">{filter.key === "all" ? "Уведомлений пока нет." : "Уведомлений этого типа пока нет."}</p>
        {filter.key !== "all" && <button type="button" className="p-secondary" onClick={() => {
          changeFilter(inboxFilters[0]);
          all.current?.focus();
        }}>Показать все</button>}
      </div>}
      {filtered.map(item => {
        const unread = !item.readAt && !read.has(item.id);
        const open = opened === item.id;
        const detailId = "p-letter-" + item.id;
        const category = categoryFor(item);
        const Icon = category ? categoryIcons[category] : Bell;
        const move = item.context?.type === "room_change" ? item.context : null;
        const grade = item.context?.type === "grade" ? item.context : null;
        const published = <time dateTime={item.publishedAt}>{noticeDate.format(new Date(item.publishedAt))}</time>;
        const marker = <span className="p-read-marker" data-read={!unread} aria-hidden="true"/>;
        return <div className={unread ? "p-inbox-row p-unread" : "p-inbox-row"} key={item.id}
          data-academic-category={category} data-room-change={Boolean(move) || undefined}>
          <button type="button" className="p-inbox-open" aria-expanded={open} aria-controls={detailId}
            onClick={() => onToggle(item.id)}>
            <span className="p-inbox-symbol" aria-hidden="true"><Icon size={20}/></span>
            <span className="p-inbox-copy">
              {move ? <span className="p-inbox-room-heading"><strong>Смена аудитории</strong><small>{published}</small>{marker}</span> : <>
                <span className="p-inbox-meta">
                  <span className="p-work-category">{category ? academicCategoryLabels[category] : notificationLabels[item.kind]}</span>
                  {item.important && <span className="p-work-category p-inbox-priority">Важное</span>}
                  <small>{published}</small>{marker}
                </span>
                <strong>{item.title}</strong>
              </>}
              {!open && move && <span className="p-inbox-room-preview">
                <span className="p-inbox-lesson-time">
                  <span className="sr-only">Начало пары в </span><time dateTime={move.startsAt}>{lessonTime.format(new Date(move.startsAt))}</time>
                </span>
                <span className="p-inbox-room-route">
                  <span className="p-inbox-room-before"><span className="sr-only">Было </span>{move.previousRoom}</span>
                  <ArrowRight size={13} aria-hidden="true"/>
                  <span className="p-inbox-room-name"><span className="sr-only">Новая аудитория </span>{locationLabel(move.room, move.building)}</span>
                </span>
              </span>}
              {move && item.important && <span className="sr-only">Важное</span>}
              <span className="sr-only">{unread ? "Непрочитано" : "Прочитано"}</span>
            </span>
            <span className="p-inbox-tail">
              {!open && grade && (grade.maxPoints === null
                ? <strong aria-label={"Баллы: " + grade.points}>{grade.points}</strong>
                : <WorkScoreBadge points={grade.points} maxPoints={grade.maxPoints}/>)}
              <ChevronRight size={18} aria-hidden="true"/>
            </span>
          </button>
          <FoldBody id={detailId} className="p-inbox-detail" expanded={open}>{open && renderDetail(item.id)}</FoldBody>
        </div>;
      })}
    </section>
  </>;
}
