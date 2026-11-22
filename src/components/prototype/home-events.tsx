"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AtlasBreadcrumbs } from "./atlas-breadcrumbs";
import { FoldSection } from "./fold-section";
import { coverScrollStep, defaultCoverScrollStep, scrollEventCover, startCoverSelection } from "./home-events-cover";
import { bulletinDate, homeDetailHref, type CampusEvent } from "./home-content";
import { eventArtwork } from "./home-event-artwork";
import { useLiveContent } from "./live-content";
import "./home-events.css";

const chronological = (a: CampusEvent, b: CampusEvent) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

function EventStories({ events, prefix, onDetailClick, footer }: {
  events: readonly CampusEvent[];
  prefix: string;
  onDetailClick: MouseEventHandler<HTMLAnchorElement>;
  footer?: ReactNode;
}) {
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const cover = useRef(startCoverSelection());
  const resetScroll = useRef<(() => void) | null>(null);
  const listId = `${prefix}-covers`;

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    const container = node;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let touchInProgress = false;
    let shown = Boolean(container.clientWidth);
    let step = defaultCoverScrollStep;
    let previous = measure();

    function measure() {
      const bounds = container.getBoundingClientRect();
      return { top: window.scrollY, visible: bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight };
    }

    function reset() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previous = measure();
      cover.current = startCoverSelection(cover.current.index);
    }

    function resize() {
      if (prefix === "hm-archive") {
        const height = document.scrollingElement?.scrollHeight ?? window.innerHeight;
        step = coverScrollStep(height - window.innerHeight, events.length);
      }
      reset();
    }

    function onScroll() {
      if (reducedMotion.matches || frame) return;
      frame = requestAnimationFrame(now => {
        frame = 0;
        const next = measure();
        const delta = next.top - previous.top;
        // Hold the current photo until its bottom has moved comfortably above the bottom navigation.
        const photo = prefix === "hm-council" && delta > 0
          ? container.children[cover.current.index]?.querySelector(".hm-story-media-clip") : null;
        const coverHasRoom = !photo || photo.getBoundingClientRect().bottom <= window.innerHeight * 0.72;
        if (previous.visible && next.visible && coverHasRoom) {
          const updated = scrollEventCover(cover.current, delta, step, events.length, now, touchInProgress);
          if (updated.index !== cover.current.index) setSelected(updated.index);
          cover.current = updated;
        } else if (!previous.visible || !next.visible) {
          cover.current = startCoverSelection(cover.current.index);
        }
        previous = next;
      });
    }

    function startTouch() {
      if (!touchInProgress) reset();
      touchInProgress = true;
    }

    function finishTouch(event: TouchEvent) {
      touchInProgress = event.touches.length > 0;
    }

    resetScroll.current = reset;
    const visibility = new ResizeObserver(() => {
      const nowShown = Boolean(container.clientWidth);
      if (nowShown === shown) return;
      shown = nowShown;
      resize();
    });
    visibility.observe(container);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("atlas:home-scroll-restored", reset);
    window.addEventListener("resize", resize);
    window.addEventListener("touchstart", startTouch, { passive: true });
    window.addEventListener("touchend", finishTouch, { passive: true });
    window.addEventListener("touchcancel", finishTouch, { passive: true });
    reducedMotion.addEventListener("change", reset);
    resize();
    return () => {
      visibility.disconnect();
      resetScroll.current = null;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("atlas:home-scroll-restored", reset);
      window.removeEventListener("resize", resize);
      window.removeEventListener("touchstart", startTouch);
      window.removeEventListener("touchend", finishTouch);
      window.removeEventListener("touchcancel", finishTouch);
      reducedMotion.removeEventListener("change", reset);
    };
  }, [events.length, prefix]);

  function selectArtwork(index: number) {
    cover.current = startCoverSelection(index);
    resetScroll.current?.();
    setSelected(index);
  }

  function moveArtwork(direction: -1 | 1) {
    const index = selected + direction;
    if (index < 0 || index >= events.length) return;
    list.current?.children.item(index)?.scrollIntoView({ block: "nearest", behavior: "instant" });
    selectArtwork(index);
  }

  return <div className="hm-event-stories">
      {prefix === "hm-archive" && events.length > 1 && <div className="hm-story-controls" role="group" aria-label="Листание обложек">
        <button type="button" aria-label="Предыдущая обложка" aria-disabled={selected === 0} aria-controls={listId} onClick={() => moveArtwork(-1)}><ChevronLeft size={19} aria-hidden="true"/></button>
        <span className="hm-story-counter" role="status">{selected + 1} из {events.length}</span>
        <button type="button" aria-label="Следующая обложка" aria-disabled={selected === events.length - 1} aria-controls={listId} onClick={() => moveArtwork(1)}><ChevronRight size={19} aria-hidden="true"/></button>
      </div>}
      <ul ref={list} className="hm-council-list" id={listId} aria-label="Афиша">{events.map((event, index) => {
        const expanded = index === selected;
        const coverId = `${prefix}-preview-${event.id}`;
        const titleId = `${prefix}-title-${event.id}`;
        const dateId = `${prefix}-date-${event.id}`;
        const start = bulletinDate(event.date);
        const end = event.endDate ? bulletinDate(event.endDate) : null;
        const sameMonth = event.endDate?.slice(0, 7) === event.date.slice(0, 7);
        const month = dayMonth.formatToParts(start).find(part => part.type === "month")?.value;
        const artwork = eventArtwork(event);
        return <li key={event.id} className="hm-story-row hm-event-tone" data-event-id={event.id} data-selected={expanded || undefined}
          style={{ "--hm-event-hue": event.hue } as CSSProperties}>
          <div id={coverId} className="hm-story-media" aria-hidden={!expanded}>
            <div className="hm-story-media-clip">
              <figure className="hm-story-preview" data-event={event.id} aria-label={`Обложка события «${event.title}»`}>
                <Image src={artwork.src} alt={artwork.alt} fill unoptimized sizes="(max-width: 700px) 100vw, 900px"/>
              </figure>
            </div>
          </div>
          <div className="hm-story-summary">
            <button type="button" className="hm-story-choice" aria-label={`Показать обложку: ${event.title}`} aria-pressed={expanded}
              aria-controls={coverId} aria-describedby={dateId} onClick={() => selectArtwork(index)}>
              <span id={dateId} className="hm-story-date">
                <strong><time dateTime={event.date}>{start.getUTCDate()}</time>{end && sameMonth && <>–<time dateTime={event.endDate}>{end.getUTCDate()}</time></>}</strong>{" "}
                <span>{month}</span>
              </span>
            </button>
            <a id={`${prefix}-${event.id}`} href={homeDetailHref("events", event.id)} onClick={onDetailClick} aria-labelledby={titleId} className="hm-story-link">
              <span className="hm-story-copy">
                <span className="hm-story-time">{end && !sameMonth && <>До <time dateTime={event.endDate}>{dayMonth.format(end)}</time> · </>}{event.time}</span>
                <strong id={titleId}>{event.title}</strong>
                <span className="hm-story-place">{event.place}</span>
              </span>
              <ChevronRight size={17} aria-hidden="true"/>
            </a>
          </div>

        </li>;
      })}</ul>
      {footer}
  </div>;
}

export function UpcomingEvents({ events, onDetailClick }: { events: CampusEvent[]; onDetailClick: MouseEventHandler<HTMLAnchorElement> }) {
  if (!events.length) return <FoldSection title="Ближайшие события" headingId="hm-events-title" className="hm-events" desktopExpanded>
    <p className="hm-event-empty">Предстоящих событий пока нет.</p>
  </FoldSection>;
  return <FoldSection title="Ближайшие события" headingId="hm-events-title" className="hm-events" desktopExpanded>
    <EventStories events={events} prefix="hm-council" onDetailClick={onDetailClick} footer={
      <a className="hm-feed-all" href="#all-events">Все события<ArrowRight size={17} aria-hidden="true"/></a>
    }/>
  </FoldSection>;
}

export function EventsArchive({ onDetailClick }: { onDetailClick: MouseEventHandler<HTMLAnchorElement> }) {
  const { events } = useLiveContent();
  const allEvents = [...events].sort(chronological);
  return <section className="hm-root hm-events hm-events-archive" aria-labelledby="hm-events-archive-heading">
    <AtlasBreadcrumbs parents={[{ label: "Главная", href: "#today" }]} current="Все события"/>
    <div className="p-page-heading hm-events-archive-heading"><h1 id="hm-events-archive-heading" tabIndex={-1}>Все события</h1><a className="p-secondary" href="#events"><CalendarDays size={19} aria-hidden="true"/>Календарь</a></div>
    <EventStories events={allEvents} prefix="hm-archive" onDetailClick={onDetailClick}/>
  </section>;
}
