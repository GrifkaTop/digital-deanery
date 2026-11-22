"use client";

import { useEffect, useId, useMemo, useRef, type MouseEventHandler, type ReactNode, type RefObject } from "react";
import { ArrowRight, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { dateInMoscow } from "@/contracts/calendar";
import { useAtlasSession } from "../account";
import { FoldSection } from "./fold-section";
import { UpcomingEvents } from "./home-events";
import { NewsFeed } from "./home-news";
import { NextLesson } from "./home-schedule";
import { useLiveContent } from "./live-content";
import "./home.css";

type DetailClick = MouseEventHandler<HTMLAnchorElement>;

const demoPassPayload = "DEANERY-PROTOTYPE:DEMO-PASS:NOT-VALID-FOR-ENTRY";
const demoReaderPayload = "DEANERY-PROTOTYPE:DEMO-LIBRARY-CARD";

function PassDialog({ dialogRef, onClose, reader }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  reader: boolean;
}) {
  const session = useAtlasSession()?.session;
  const profile = session?.state === "ready" ? session.profile : undefined;
  const titleId = useId();
  const code = useMemo(() => QRCode.create(reader ? demoReaderPayload : demoPassPayload, { errorCorrectionLevel: "M" }).modules, [reader]);
  const quiet = 4;
  const dimension = code.size + quiet * 2;
  const path = Array.from(code.data).flatMap((dark, index) => dark ? [`M${index % code.size + quiet} ${Math.floor(index / code.size) + quiet}h1v1h-1z`] : []).join("");
  return <dialog ref={dialogRef} className="hm-pass-dialog" aria-labelledby={titleId} onClose={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close();
  }} onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); event.currentTarget.querySelector("button")?.focus(); } }}>
    <header><h2 id={titleId}>{reader ? "Читательский билет" : "QR-пропуск"}</h2><button type="button" autoFocus aria-label={reader ? "Закрыть читательский билет" : "Закрыть пропуск"} onClick={() => dialogRef.current?.close()}><X size={22} aria-hidden="true"/></button></header>
    {profile && <p className="hm-pass-owner">{profile.fullName}<span>{[profile.group, profile.studentNumber].filter(Boolean).join(" · ")}</span></p>}
    <svg className="hm-qr" role="img" aria-label={reader ? "Демонстрационный QR-код читательского билета" : "Демонстрационный QR-код пропуска"} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges"><rect width={dimension} height={dimension} fill="#fff"/><path d={path} fill="#000"/></svg>
    <p className="hm-pass-note">{reader ? "Демонстрационный билет" : <>Демонстрационный пропуск<br/>Не действует для прохода</>}</p>
  </dialog>;
}

export function PrototypePass({ className, children, reader = false }: {
  className?: string;
  children?: ReactNode;
  reader?: boolean;
}) {
  const passDialog = useRef<HTMLDialogElement>(null);
  const passButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOnNavigation = () => passDialog.current?.close();
    window.addEventListener("hashchange", closeOnNavigation);
    return () => window.removeEventListener("hashchange", closeOnNavigation);
  }, []);

  return <>
    <button ref={passButton} className={className} type="button" aria-haspopup="dialog" onClick={() => {
      const dialog = passDialog.current;
      if (dialog && !dialog.open) dialog.showModal();
    }}><QrCode size={21} aria-hidden="true"/>{children ?? <>Показать пропуск<ArrowRight size={17} aria-hidden="true"/></>}</button>
    <PassDialog dialogRef={passDialog} reader={reader} onClose={() => {
      const button = passButton.current;
      if (!passDialog.current?.open && button?.getClientRects().length) button.focus({ preventScroll: true });
    }}/>
  </>;
}

export function PrototypeHome({ readNewsIds, onDetailClick }: { readNewsIds: readonly string[]; onDetailClick: DetailClick }) {
  const { news: orderedNews, events } = useLiveContent();
  const now = new Date();
  const today = homeDate.format(now);
  const date = dateInMoscow(now);
  const featured = events.filter(event => (event.endDate ?? event.date) >= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 3);
  return <div className="hm-root hm-home">
    <header className="hm-heading">
      <div className="p-page-heading"><div><h1 id="hm-home-heading" tabIndex={-1}>Главная</h1><p>{today[0].toLocaleUpperCase("ru-RU") + today.slice(1)}</p></div></div>
      <PrototypePass className="hm-pass-button p-secondary"/>
    </header>
    <div className="hm-layout">
      <div className="hm-main-column">
        <div className="hm-home-widgets">
          <NextLesson/>
        </div>
        <FoldSection title="Новости" headingId="hm-news-title" className="hm-news" headingClassName="hm-section-heading" desktopExpanded>
          {orderedNews.length ? <NewsFeed items={orderedNews.slice(0, 3)} readNewsIds={readNewsIds} onDetailClick={onDetailClick}>
            {orderedNews.length > 3 && <a className="hm-feed-all" href="#news">Все новости<ArrowRight size={17} aria-hidden="true"/></a>}
          </NewsFeed> : <p>Новостей пока нет.</p>}
        </FoldSection>
      </div>
      <UpcomingEvents events={featured} onDetailClick={onDetailClick}/>
    </div>
  </div>;
}

const homeDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });
