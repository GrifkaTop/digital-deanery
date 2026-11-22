"use client";

import { ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { libraryCatalog } from "@/contracts/library";
import { useAtlasSession } from "../account";
import { Resource } from "../resource";
import "./library-catalog.css";

type Catalog = z.infer<typeof libraryCatalog>;
const subjectIdSchema = z.uuid();

function subjectQuery(subjectId?: string) {
  return subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
}

export function libraryCatalogHref(subjectId?: string) {
  return `#library${subjectQuery(subjectId)}`;
}

function CatalogBooks({ data, subjectId, onSubjects, query }: {
  data: Catalog;
  subjectId?: string;
  onSubjects: (subjects: Catalog["subjects"]) => void;
  query: string;
}) {
  useEffect(() => onSubjects(data.subjects), [data.subjects, onSubjects]);

  const normalize = (value: string) => value.toLocaleLowerCase("ru").replaceAll("ё", "е");
  const terms = normalize(query.trim()).split(/\s+/u);
  const books = data.items.filter(book => terms.every(term => normalize(book.title + " " + book.author).includes(term)));
  if (!books.length) {
    return <p className="lib-catalog-empty" role="status">
      {query ? "Книги не найдены." : subjectId ? "По этому предмету книг пока нет." : "В каталоге пока нет книг."}
    </p>;
  }

  const filter = subjectQuery(subjectId);
  return <div className="lib-catalog-list">
    {books.map(book => <article key={book.id}>
      <h2>
        <a id={`library-book-${book.id}`} href={`#library/${book.id}${filter}`}>
          <span>{book.title}</span>
          <ChevronRight size={20} aria-hidden="true"/>
        </a>
      </h2>
      <p className="lib-catalog-muted">{book.author}</p>
      <p>{book.description}</p>
      <p className="lib-catalog-muted lib-catalog-meta">
        <span>{book.online ? "Электронная версия · TXT" : "Печатное издание"}</span>
        <span>{book.booked ? "Ваша бронь" : book.available ? `Свободных экземпляров: ${book.available}` : "Нет свободных экземпляров"}</span>
      </p>
    </article>)}
  </div>;
}

export function LibraryCatalog({ subjectId }: { subjectId?: string }) {
  const auth = useAtlasSession()!;
  const [subjects, setSubjects] = useState<Catalog["subjects"]>();
  const [query, setQuery] = useState("");
  const parsedSubject = subjectIdSchema.safeParse(subjectId);
  const selected = parsedSubject.success ? parsedSubject.data.toLowerCase() : undefined;
  const missing = selected && !subjects?.some(subject => subject.id === selected);

  return <section className="lib-catalog" aria-labelledby="library-catalog-heading">
    <header>
      <h1 id="library-catalog-heading" tabIndex={-1}>Библиотека</h1>
    </header>
    <LibraryTabs/>
    <label className="lb-search"><Search size={17} aria-hidden="true"/>
      <span className="sr-only">Поиск по названию или автору</span>
      <input type="search" placeholder="Название или автор" value={query} onChange={event => setQuery(event.currentTarget.value)}/>
    </label>
    <label className="lib-catalog-filter">
      Предмет
      <select value={selected ?? ""} disabled={!subjects} onChange={event => {
        window.location.hash = libraryCatalogHref(event.currentTarget.value);
      }}>
        <option value="">Все предметы</option>
        {missing && <option value={selected}>{subjects ? "Недоступный предмет" : "Загружаем предмет…"}</option>}
        {subjects?.map(subject => <option key={subject.id} value={subject.id}>{subject.title}</option>)}
      </select>
    </label>
    <Resource url={`/api/v1/library${subjectQuery(selected)}`} schema={libraryCatalog} onUnauthorized={auth.onUnauthorized}>
      {data => <CatalogBooks data={data} subjectId={selected} onSubjects={setSubjects} query={query}/>}
    </Resource>
  </section>;
}

export function LibraryTabs({ loans = false }: { loans?: boolean }) {
  return <nav className="lb-sections" aria-label="Разделы библиотеки">
    <a href="#library" aria-current={!loans ? "page" : undefined}>Каталог книг</a>
    <a href="#library-loans" aria-current={loans ? "page" : undefined}>Мои книги</a>
  </nav>;
}
