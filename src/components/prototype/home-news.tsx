import type { MouseEventHandler, ReactNode } from "react";
import { ArrowLeft, ChevronRight, Pin } from "lucide-react";
import { bulletinDate, homeDetailHref, type HomeNews } from "./home-content";
import { useLiveContent } from "./live-content";

const newsDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

export function NewsFeed({ items, readNewsIds, onDetailClick, archive = false, children }: {
  items: HomeNews[];
  readNewsIds: readonly string[];
  onDetailClick: MouseEventHandler<HTMLAnchorElement>;
  archive?: boolean;
  children?: ReactNode;
}) {
  const prefix = archive ? "hm-archive" : "hm-news";
  return <div className="hm-news-feed">
    {items.map(item => {
      const titleId = `${prefix}-title-${item.id}`;
      const pinId = `${prefix}-pin-${item.id}`;
      const statusId = `${prefix}-status-${item.id}`;
      const read = readNewsIds.includes(item.id);
      const status = read ? "Просмотрено" : "Не просмотрено";
      const parts = newsDate.formatToParts(bulletinDate(item.date));
      return <article className="hm-news-item" key={item.id} aria-labelledby={titleId}>
        <a id={`${prefix}-${item.id}`} className="hm-news-link" aria-labelledby={titleId}
          aria-describedby={item.pinned ? `${statusId} ${pinId}` : statusId}
          href={homeDetailHref("news", item.id)} onClick={onDetailClick}>
          <span className="hm-news-date-area">
            {item.pinned && <span id={pinId} className="hm-news-pin" role="img" aria-label="Закреплено" title="Закреплено"><Pin size={14} aria-hidden="true"/></span>}
            <time className="hm-news-date" dateTime={item.date}>
              <strong>{parts.find(part => part.type === "day")?.value}</strong>{" "}
              <span>{parts.find(part => part.type === "month")?.value}</span>
            </time>
          </span>
          <span className="hm-news-title-row" id={titleId}>{item.title}</span>
          <ChevronRight className="hm-news-chevron" size={18} aria-hidden="true"/>
          <span className="hm-news-summary">{item.summary}</span>
          <span className="hm-news-status" data-read={read} title={status}>
            <span className="sr-only" id={statusId}>{status}</span>
          </span>
        </a>
      </article>;
    })}
    {children}
  </div>;
}

export function NewsArchive({ readNewsIds, onDetailClick }: { readNewsIds: readonly string[]; onDetailClick: MouseEventHandler<HTMLAnchorElement> }) {
  const { news: orderedNews } = useLiveContent();
  return <section className="hm-root hm-news-archive" aria-labelledby="hm-archive-heading">
    <a className="hm-calendar-back" href="#today" onClick={() => window.scrollTo(0, 0)}><ArrowLeft size={17} aria-hidden="true"/>На главную</a>
    <header className="hm-archive-heading p-page-heading">
      <h1 id="hm-archive-heading" tabIndex={-1}>Все новости</h1>
    </header>
    {orderedNews.length ? <NewsFeed items={orderedNews} readNewsIds={readNewsIds} onDetailClick={onDetailClick} archive/> : <p>Новостей пока нет.</p>}
  </section>;
}
