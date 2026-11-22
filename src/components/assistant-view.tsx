"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { assistantDocument, assistantQuestionLimit, type AssistantDocument } from "@/contracts/assistant";
import { AssistantAnswer } from "./assistant-answer";
import { CabinetLink } from "./cabinet-link";
import { Resource } from "./resource";

import { useAssistantConversation, type AssistantMemory } from "./use-assistant-conversation";

const quickQuestions = [
  "Какие пары завтра?",
  "Где ближайшая пара?",
  "Какой ближайший дедлайн?",
  "Когда стипендия?",
  "Как получить стипендию?",
  "Когда сессия и каникулы?",
];

export function AssistantEntry({ memory }: { memory: AssistantMemory }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!memory.fromToday) return;
    memory.fromToday = false;
    link.current?.focus({ preventScroll: true });
  }, [memory]);
  return <CabinetLink ref={link} className="action-link assistant-entry" href="/today/assistant"
    onNavigate={() => { memory.fromToday = true; }}>
    <MessageSquare size={19} aria-hidden="true" /> Спросить помощника <ChevronRight size={18} aria-hidden="true" />
  </CabinetLink>;
}

export function AssistantView({ memory, onUnauthorized, standalone = false }: {
  memory: AssistantMemory; onUnauthorized: () => void; standalone?: boolean;
}) {
  const router = useRouter();
  const { question, updateQuestion, messages, pending, error, ask, cancel, reset } = useAssistantConversation(memory, onUnauthorized);
  const fieldId = standalone ? "assistant-page-question" : "assistant-panel-question";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim()) void ask(question.trim());
  }

  return <>
    {standalone && <>
      <h1>Помощник студента</h1>
      <CabinetLink className="back-link" href="/today" onNavigate={(event) => {
        if (!memory.fromToday) return;
        event.preventDefault();
        router.back();
      }}><ChevronLeft size={18} aria-hidden="true" /> Назад</CabinetLink>
    </>}
    <section className={`data-panel assistant-panel${standalone ? " assistant-standalone" : " assistant-desktop"}`}
      aria-label="Вопросы помощнику">
      {!standalone && <h2>Помощник студента</h2>}
      {messages.length > 0 && <>
        <button type="button" className="quiet-button assistant-reset" onClick={reset}>Новый диалог</button>
        <ol className="assistant-messages" aria-label="Диалог">
          {messages.map((message, index) => <li key={index} className={`assistant-message assistant-message-${message.role}`}>
            <span className="assistant-message-author">{message.role === "student" ? "Вы" : "Помощник"}</span>
            {message.role === "student" ? <p>{message.text}</p> : <AssistantAnswer answer={message.answer} memory={memory} back={standalone ? "/today/assistant" : "/today"}/>}
          </li>)}
        </ol>
      </>}
      {pending && <p role="status">Готовим ответ…</p>}
      {error && <p role="alert" className="assistant-error">{error}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor={fieldId}>Ваш вопрос</label>
        <p id={`${fieldId}-hint`} className="muted">Расписание, дедлайны, стипендия, сессия и каникулы. Ответы по синтетическим данным кабинета.</p>
        <input id={fieldId} aria-describedby={`${fieldId}-hint`} autoComplete="off" maxLength={assistantQuestionLimit}
          value={question} onChange={(event) => updateQuestion(event.target.value)} />
        <div className="assistant-actions">
          <button type="submit" disabled={pending || !question.trim()}>Спросить</button>
          {pending && <button type="button" className="quiet-button" onClick={cancel}>Отменить</button>}
        </div>
      </form>
      {messages.length === 0 && <div className="assistant-quick" role="group" aria-label="Примеры вопросов">
        {quickQuestions.map((example) => <button key={example} type="button" className="quiet-button"
          disabled={pending} onClick={() => void ask(example)}>{example}</button>)}
      </div>}
    </section>
  </>;
}

export function AssistantDocumentView({ id, memory, onUnauthorized }: {
  id: string; memory: AssistantMemory; onUnauthorized: () => void;
}) {
  const router = useRouter();
  return <>
    <CabinetLink className="back-link" href={memory.documentBack ?? "/today/assistant"} onNavigate={(event) => {
      if (!memory.documentBack) return;
      event.preventDefault();
      memory.documentBack = undefined;
      router.back();
    }}>
      <ChevronLeft size={18} aria-hidden="true" /> К помощнику
    </CabinetLink>
    <Resource url={`/api/v1/assistant/documents/${encodeURIComponent(id)}`} schema={assistantDocument} onUnauthorized={onUnauthorized}>
      {(document) => <DocumentText publication={document} />}
    </Resource>
  </>;
}

const issuedDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" });

function DocumentText({ publication }: { publication: AssistantDocument }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const moveToSection = () => {
      const id = window.location.hash.slice(1);
      const section = document.getElementById(id);
      if (section && root.current?.contains(section)) {
        section.focus({ preventScroll: true });
        section.scrollIntoView({ block: "start" });
      }
    };
    moveToSection();
    window.addEventListener("hashchange", moveToSection);
    return () => window.removeEventListener("hashchange", moveToSection);
  }, [publication.id]);

  return <article ref={root} className="data-panel assistant-publication">
    <p className="muted">Синтетический документ</p>
    <h1>{publication.title}</h1>
    <p className="muted">№ {publication.number} от {issuedDate.format(new Date(`${publication.issuedOn}T12:00:00Z`))}</p>
    {publication.pdfHref && <a className="action-link" href={publication.pdfHref}>Открыть оригинал PDF</a>}
    {publication.sections.map((section) => <section key={section.id} id={`section-${section.id}`} tabIndex={-1}>
      <h2>{publication.pdfHref ? section.title : `${section.id}. ${section.title}`}</h2>
      <p>{section.text}</p>
    </section>)}
  </article>;
}
