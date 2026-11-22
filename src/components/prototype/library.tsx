"use client";

import { useEffect, useRef } from "react";
import { Bookmark } from "lucide-react";
import { libraryBookings } from "@/contracts/library";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import { PrototypePass } from "./home";
import { LibraryBook } from "./library-book";
import { LibraryCatalog, LibraryTabs, libraryCatalogHref } from "./library-catalog";
import "./desktop-services.css";

export function LibraryLoans() {
  const { onUnauthorized } = useAtlasSession()!;
  return <section className="lb-root" aria-labelledby="lb-heading">
    <header className="lb-header"><h1 id="lb-heading">Мои книги</h1></header>
    <LibraryTabs loans/>
    <section className="lb-reader-card" aria-labelledby="lb-reader-title">
      <div><h2 id="lb-reader-title">Читательский билет</h2><p>Покажите QR-код при получении книг.</p></div>
      <PrototypePass className="p-secondary lb-reader-button" reader>Показать QR-код</PrototypePass>
    </section>
    <Resource url="/api/v1/library/bookings" schema={libraryBookings} onUnauthorized={onUnauthorized}>
      {({ items }) => <div className="lb-circulation">
        {[true, false].map(active => <section key={String(active)} aria-labelledby={active ? "lb-reserved-title" : "lb-history-title"}>
          <h2 id={active ? "lb-reserved-title" : "lb-history-title"}><Bookmark size={19} aria-hidden="true"/>{active ? "Мои брони" : "История броней"}<span>{items.filter(book => book.active === active).length}</span></h2>
          {items.some(book => book.active === active) ? <ul>{items.filter(book => book.active === active).map(book => <li key={book.id}>
            <div className="lb-record-title"><h3><a href={`#library/${book.id}`}>{book.title}</a></h3><span className="lb-record-status">{active ? "Забронировано" : "Бронь отменена"}</span></div>
            <p className="lb-byline">{book.author}</p>
            <p>{active ? "Оформлена" : "Отменена"} {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(book.updatedAt))}</p>
            <a className="lb-download" href={`#library/${book.id}`}>{active ? "Управлять бронью" : "Открыть книгу"}</a>
            {book.online && <a className="lb-download" href={`/api/v1/library/${book.id}/download`} download>Скачать TXT</a>}
          </li>)}</ul> : <p>{active ? "Активных броней нет." : "Завершённых броней пока нет."} <a href="#library">Найти книгу в каталоге</a></p>}
        </section>)}
        <section aria-labelledby="lb-loans-title"><h2 id="lb-loans-title">Выдачи книг</h2><p>Сведения о выданных книгах пока не опубликованы. Бронь не означает выдачу книги.</p></section>
      </div>}
    </Resource>
  </section>;
}

export function Library({ id, reading, invalid, subjectId, restore }: {
  id?: string;
  reading: boolean;
  invalid: boolean;
  subjectId?: string;
  restore?: { y: number; id: string };
}) {
  const root = useRef<HTMLDivElement>(null);
  const arrival = useRef(restore);

  useEffect(() => {
    const view = root.current;
    if (!view) return;
    const saved = arrival.current;
    const focusPage = () => {
      const target = saved?.id ? document.getElementById(saved.id) : null;
      if (!target && view.querySelector(".loading-card")) return;
      const focus = target ?? view.querySelector("h1") ?? view.querySelector("a");
      if (!(focus instanceof HTMLElement)) return;
      observer.disconnect();
      window.scrollTo(0, target ? saved?.y ?? 0 : 0);
      focus.focus({ preventScroll: true });
    };

    const observer = new MutationObserver(focusPage);
    observer.observe(view, { childList: true, subtree: true });
    focusPage();
    return () => observer.disconnect();
  }, []);

  const catalogHref = libraryCatalogHref(subjectId);
  let page;
  if (invalid) {
    page = <>
      <h1 tabIndex={-1}>Страница недоступна</h1>
      <a className="lib-book-back" href={catalogHref}>К библиотеке</a>
    </>;
  } else if (id) {
    page = <LibraryBook id={id} reading={reading} catalogHref={catalogHref}/>;
  } else {
    page = <LibraryCatalog subjectId={subjectId}/>;
  }
  return <div ref={root} className="min-w-0">{page}</div>;
}
