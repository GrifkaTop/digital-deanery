"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { libraryBookDetail, libraryReading } from "@/contracts/library";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import "./library-book.css";

const csrfResponse = z.object({ token: z.string().min(1) });
const bookingResponse = z.object({ booked: z.boolean() });

type BookDetail = z.output<typeof libraryBookDetail>;

function BookHeading({ title, author }: { title: string; author: string }) {
  return <header className="lib-book-heading">
    <h1 id="library-book-title" tabIndex={-1}>{title}</h1>
    <p>{author}</p>
  </header>;
}

function BookCard({ book, readHref, refresh, onUnauthorized }: {
  book: BookDetail;
  readHref: string;
  refresh: () => void;
  onUnauthorized: () => void;
}) {
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<{ source: BookDetail; booked: boolean } | null>(null);
  const refreshing = update?.source === book;
  const booked = refreshing ? update.booked : book.booked;
  const bookingDisabled = pending || refreshing || (!booked && book.available === 0);

  useLayoutEffect(() => () => controller.current?.abort(), []);

  async function changeBooking() {
    if (bookingDisabled || controller.current) return;

    const request = new AbortController();
    const { signal } = request;
    controller.current = request;
    setPending(true);
    setError("");

    try {
      const csrf = await fetch("/api/v1/csrf", { signal, cache: "no-store" });
      if (signal.aborted) return;
      if (csrf.status === 401) return onUnauthorized();
      if (!csrf.ok) throw new Error();
      const { token } = csrfResponse.parse(await csrf.json());
      if (signal.aborted) return;

      const response = await fetch(`/api/v1/library/${book.id}/booking`, {
        method: booked ? "DELETE" : "POST",
        headers: { "X-CSRF-Token": token },
        signal,
        cache: "no-store",
      });
      if (signal.aborted) return;
      if (response.status === 401) return onUnauthorized();
      if (response.status === 409 || response.status === 404) {
        if (response.status === 409) setError("Свободных экземпляров больше нет. Бронь не создана.");
        setUpdate({ source: book, booked });
        refresh();
        return;
      }
      if (!response.ok) throw new Error();

      const result = bookingResponse.parse(await response.json());
      if (signal.aborted) return;
      setUpdate({ source: book, booked: result.booked });
      refresh();
    } catch {
      if (!signal.aborted) setError("Не удалось изменить бронь. Повторите действие.");
    } finally {
      if (!signal.aborted) {
        controller.current = null;
        setPending(false);
      }
    }
  }

  return <>
    <BookHeading title={book.title} author={book.author}/>
    <section className="lib-book-panel" aria-label="Сведения о книге">
      <p>{book.description}</p>
      {book.subjects.length > 0 && <p className="lib-book-muted">Предметы: {book.subjects.map(subject => subject.title).join(", ")}</p>}
      <p className="lib-book-availability" role="status">
        {booked && <strong>Книга забронирована вами. </strong>}
        {refreshing ? "Уточняем наличие экземпляров…" : `Свободных экземпляров: ${book.available}`}
      </p>
      <div className="lib-book-actions">
        {book.online && <a id={`library-read-${book.id}`} className="lib-book-action lib-book-read" href={readHref} download>Скачать</a>}
        <button type="button" className="lib-book-action" aria-disabled={bookingDisabled} onClick={() => void changeBooking()}>
          {pending ? "Сохраняем…" : booked ? "Отменить бронь" : "Забронировать в библиотеке"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!book.online && <p className="lib-book-muted">Электронная версия недоступна.</p>}
    </section>
  </>;
}

export function LibraryBook({ id, reading, catalogHref }: { id: string; reading?: boolean; catalogHref: string }) {
  const { onUnauthorized } = useAtlasSession()!;
  const [revision, setRevision] = useState(0);
  const encodedId = encodeURIComponent(id);
  const url = `/api/v1/library/${encodedId}`;
  const detailHref = `#library/${encodedId}`;
  const filterQuery = catalogHref.slice("#library".length);

  return <div className="lib-book">
    <a className="lib-book-back" href={reading ? `${detailHref}${filterQuery}` : catalogHref}>
      <ArrowLeft aria-hidden="true" size={18}/>{reading ? "К книге" : "К библиотеке"}
    </a>
    {reading ? <Resource key={`${id}/read`} url={`${url}/read`} schema={libraryReading} onUnauthorized={onUnauthorized}>
      {book => <>
        <BookHeading title={book.title} author={book.author}/>
        <article className="lib-book-panel lib-book-text" aria-labelledby="library-book-title">
          {book.content.split(/\r?\n[\t ]*\r?\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </article>
      </>}
    </Resource> : <Resource key={id} url={url} schema={libraryBookDetail} onUnauthorized={onUnauthorized} reloadKey={revision} retainPrevious>
      {book => <BookCard book={book} readHref={`${url}/download`} refresh={() => setRevision(value => value + 1)} onUnauthorized={onUnauthorized}/>}
    </Resource>}
  </div>;
}
