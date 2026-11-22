"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties, type MouseEventHandler } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { eventItem, newsItem } from "@/contracts/publications";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { bulletinDate, eventDateLabel, type CampusEvent, type HomeDetailRoute, type HomeNews } from "./home-content";
import { presentEvent, presentNews } from "./live-content";
import { eventArtwork } from "./home-event-artwork";
import "./home-detail.css";

const newsDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function HomeDetail({ route, back, onBack, onNewsOpen }: {
  route: HomeDetailRoute;
  back: { href: string; label: string };
  onBack: MouseEventHandler<HTMLAnchorElement>;
  onNewsOpen: (id: string) => void;
}) {
  const auth = useAtlasSession();
  if (!auth) return null;

  const url = "/api/v1/" + route.kind + "/" + encodeURIComponent(route.id);
  return <article className="hm-detail" aria-label="Новости и события">
    <a className="hm-detail-back" href={back.href} onClick={onBack}><ArrowLeft size={19} aria-hidden="true"/>{back.label}</a>
    {route.kind === "events" ? <Resource url={url} schema={eventItem} onUnauthorized={auth.onUnauthorized}>
      {item => <Article article={presentEvent(item)}/>}
    </Resource> : <Resource url={url} schema={newsItem} onUnauthorized={auth.onUnauthorized}>
      {item => <Article article={presentNews(item)} onNewsOpen={onNewsOpen}/>}
    </Resource>}
  </article>;
}

function Article({ article, onNewsOpen }: {
  article: CampusEvent | (HomeNews & { author: string });
  onNewsOpen?: (id: string) => void;
}) {
  const event = "kind" in article ? article : undefined;
  const author = "author" in article ? article.author : undefined;
  const { id, title } = article;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { onNewsOpen?.(id); }, [id, onNewsOpen]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title + " · Цифровой деканат";
    window.scrollTo({ top: 0, behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
    return () => { document.title = previousTitle; };
  }, [title]);

  const eventTone = event ? { "--hm-event-hue": event.hue } as CSSProperties : undefined;
  const artwork = event ? eventArtwork(event) : null;

  return <>
    <header className="hm-detail-header">
      <h1 id="hm-detail-title" ref={heading} tabIndex={-1}>{title}</h1>
      {event ? <p className="hm-detail-byline hm-event-tone" style={eventTone}><span className="hm-detail-kind">{event.kind}</span></p> : (
        <p className="hm-detail-byline"><time dateTime={article.date}>{newsDate.format(bulletinDate(article.date))}</time>{author && <><span aria-hidden="true">·</span><span>{author}</span></>}</p>
      )}
    </header>
    <div className={event ? "hm-detail-layout hm-detail-event" : "hm-detail-layout"}>
      {event && <dl className="hm-detail-facts hm-event-tone" style={eventTone}>
        <div><CalendarDays size={20} aria-hidden="true"/><dt>Когда</dt><dd>{eventDateLabel(event)}<span>{event.time}</span></dd></div>
        <div><MapPin size={20} aria-hidden="true"/><dt>Где</dt><dd>{event.place}</dd></div>
      </dl>}
      <div className="hm-detail-body">
        <p className="hm-detail-lead">{article.summary}</p>
        {artwork && <figure className="hm-detail-cover">
          <div><Image src={artwork.src} alt={artwork.alt} fill unoptimized sizes="(max-width: 700px) 100vw, 700px"/></div>
          <figcaption>{artwork.type === "published" ? <>
            Фото <a href={artwork.source} target="_blank" rel="noreferrer">{artwork.credit}</a> · <a href={artwork.license} target="_blank" rel="noreferrer">{artwork.license.includes("creativecommons.org/licenses/by-sa/2.0") ? "CC BY-SA 2.0" : "Лицензия"}</a>, кадрировано.
          </> : artwork.caption}</figcaption>
        </figure>}
        {article.sections.map(part => <section className="hm-detail-part" key={part.heading}>
          <h2>{part.heading}</h2>
          {part.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>)}
        {article.action && <a className="hm-detail-action" href={article.action.href}>{article.action.label}<ArrowRight size={17} aria-hidden="true"/></a>}
      </div>
    </div>
  </>;
}
