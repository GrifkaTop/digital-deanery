import { useEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { FoldSection } from "./fold-section";
import { calendarMonthWeeks, calendarVisibleLanes, calendarWeekEntries, calendarWeekPreview, eventEndDate, eventOccursOn, shiftCalendarMonth } from "./home-calendar-model";
import { dateInMoscow } from "@/contracts/calendar";
import { bulletinDate, eventDateLabel, homeDetailHref, type CampusEvent } from "./home-content";
import { useLiveContent } from "./live-content";
import "./home-calendar.css";

const weekDays = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const chronological = (events: readonly CampusEvent[]) => [...events].sort((a, b) =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
);

type EventClick = MouseEventHandler<HTMLAnchorElement>;

function EventCards({ events, prefix, onDetailClick, archive = false }: {
  events: CampusEvent[]; prefix: string; onDetailClick: EventClick; archive?: boolean;
}) {
  const Heading = archive ? "h2" : "h4";
  return events.map(event => {
    const titleId = `${prefix}-title-${event.id}`;
    return <article className="hm-event hm-event-tone" key={event.id} style={{ "--hm-event-hue": event.hue } as CSSProperties}>
      <a id={`${prefix}-event-${event.id}`} className="hm-event-link" href={homeDetailHref("events", event.id)} onClick={onDetailClick} aria-labelledby={titleId}>
        <div className="hm-event-meta">
          {event.endDate ? <span>{eventDateLabel(event)}</span> : <span>
            {archive && <><time dateTime={event.date}>{eventDateLabel(event)}</time> · </>}{event.time}
          </span>}
          <span>{event.kind}</span>
        </div>
        <Heading className="hm-event-title" id={titleId}>{event.title}</Heading>
        <p><MapPin size={15} aria-hidden="true"/>{event.place}</p>
        <ChevronRight className="hm-day-chevron" size={16} aria-hidden="true"/>
      </a>
    </article>;
  });
}

export function EventsArchive({ onDetailClick }: { onDetailClick: EventClick }) {
  const { events } = useLiveContent();
  const chronologicalEvents = chronological(events);
  return <section className="hm-root hm-events-archive" aria-labelledby="hm-events-archive-heading">
    <nav className="hm-events-archive-nav" aria-label="Навигация по событиям">
      <a className="hm-calendar-back" href="#today" onClick={() => window.scrollTo(0, 0)}><ArrowLeft size={17} aria-hidden="true"/>На главную</a>
      <a className="hm-calendar-back" href="#events"><CalendarDays size={17} aria-hidden="true"/>Календарь событий</a>
    </nav>
    <div className="p-page-heading"><h1 id="hm-events-archive-heading" tabIndex={-1}>Все события</h1></div>
    <div className="hm-event-list hm-event-archive-list">
      {chronologicalEvents.length ? <EventCards events={chronologicalEvents} prefix="hm-archive" onDetailClick={onDetailClick} archive/> : <p className="hm-event-empty">Событий пока нет.</p>}
    </div>
  </section>;
}

function CalendarWeek({ week, selected, today, bands, onSelectDate }: {
  week: (string | null)[]; selected: string; today: string; bands: CampusEvent[]; onSelectDate: (day: string) => void;
}) {
  const { visible, overflow } = calendarWeekPreview(calendarWeekEntries(week, bands));

  return <div className="hm-week">
    <div className="hm-dates">{week.map((day, column) => {
      if (day === null) return <span key={column} aria-hidden="true"/>;
      const date = bulletinDate(day);
      const count = bands.filter(event => eventOccursOn(event, day)).length;
      const hidden = overflow[column];
      return <button key={day} type="button" data-date={day} aria-current={day === today ? "date" : undefined} aria-pressed={day === selected}
        aria-label={`${dayFormat.format(date)}, событий: ${count}${hidden ? `, скрыто: ${hidden}` : ""}`} onClick={() => onSelectDate(day)}>
        <span className="hm-day-number">{date.getUTCDate()}</span>
        {hidden > 0 && <span className="hm-calendar-more" aria-hidden="true">+{hidden}</span>}
      </button>;
    })}</div>
    <div className="hm-week-events">
      {visible.map(({ event, first, last, span, lane }) => {
        const start = week[first] ?? event.date;
        const end = week[last] ?? eventEndDate(event);
        return <span key={event.id} className="hm-event-tone hm-calendar-event"
          role="img" aria-label={event.title} title={event.title}
          data-start={start} data-end={end}
          data-prev={event.date < start || undefined} data-next={eventEndDate(event) > end || undefined}
          style={{ gridColumn: `${first + 1} / span ${span}`, gridRow: lane + 1, "--hm-event-hue": event.hue } as CSSProperties}>
          {event.title}
        </span>;
      })}
    </div>
  </div>;
}

export function HomeCalendar({ inline = false, onDetailClick }: { inline?: boolean; onDetailClick: EventClick }) {
  const { events } = useLiveContent();
  const today = dateInMoscow(new Date());
  const chronologicalEvents = chronological(events);
  const bands = [...chronologicalEvents].sort((a, b) => Number(!!b.endDate) - Number(!!a.endDate));
  const [selected, setSelected] = useState(today);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const focusList = useRef(false);
  const prefix = inline ? "hm-home" : "hm";
  const headingId = `${prefix}-calendar-title`;
  const listHeadingId = `${prefix}-day-title`;
  const weeks = calendarMonthWeeks(selected);
  const monthLabel = monthFormat.format(bulletinDate(selected));
  const selectedEvents = chronologicalEvents.filter(event => eventOccursOn(event, selected));

  useEffect(() => {
    if (focusList.current) {
      focusList.current = false;
      listHeading.current?.focus();
    }
  }, [selected]);

  function selectDate(day: string) {
    if (day === selected) {
      listHeading.current?.focus();
      return;
    }
    focusList.current = true;
    setSelected(day);
  }

  function changeMonth(step: number) {
    setSelected(date => shiftCalendarMonth(date, step));
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    suppressClick.current = false;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      swipeStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  function finishSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || start.id !== event.pointerId) return;
    swipeStart.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClick.current = true;
    changeMonth(dx < 0 ? 1 : -1);
  }

  return <FoldSection
    title="Календарь событий"
    level={inline ? 2 : 1}
    headingId={headingId}
    className={`hm-root hm-calendar-section${inline ? " hm-calendar-inline" : ""}`}
    headingClassName="hm-section-heading"
    bodyClassName="hm-calendar-body"
    beforeHeading={!inline && <a className="hm-calendar-back" href="#all-events"><ArrowLeft size={17} aria-hidden="true"/>Все события</a>}
  >
      <div className="hm-calendar-toolbar">
        <div className="hm-period-controls">
          <button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}><ArrowLeft size={19} aria-hidden="true"/></button>
          <h3 aria-live="polite">{monthLabel}</h3>
          <button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)}><ArrowRight size={19} aria-hidden="true"/></button>
        </div>
        <button type="button" className="hm-calendar-today" onClick={() => setSelected(today)}>Сегодня</button>
      </div>
      <div className="hm-calendar" role="group" aria-label="Даты месяца" style={{ "--hm-event-lanes": calendarVisibleLanes } as CSSProperties}
          onPointerDown={startSwipe} onPointerUp={finishSwipe}
          onPointerCancel={event => { if (swipeStart.current?.id === event.pointerId) swipeStart.current = null; }}
          onClickCapture={event => {
            if (!suppressClick.current || event.detail === 0) return;
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}>
          <div className="hm-weekdays" aria-hidden="true">{weekDays.map(day => <span key={day}>{day}</span>)}</div>
          {weeks.map(week => <CalendarWeek key={week.find(day => day !== null)} week={week} selected={selected} today={today} bands={bands} onSelectDate={selectDate}/>)}
      </div>
      <section className="hm-event-list" aria-labelledby={listHeadingId} aria-live="polite">
          <h3 id={listHeadingId} ref={listHeading} tabIndex={-1}>{dayFormat.format(bulletinDate(selected))} <span>{selectedEvents.length}</span></h3>
          {selectedEvents.length ? <EventCards events={selectedEvents} prefix={`${prefix}-day`} onDetailClick={onDetailClick}/> : <p className="hm-event-empty">На эту дату событий нет.</p>}
      </section>
  </FoldSection>;
}
