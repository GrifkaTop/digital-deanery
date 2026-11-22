"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, BotMessageSquare, RotateCcw, Send, X } from "lucide-react";
import { assistantQuestionLimit } from "@/contracts/assistant";
import { useAtlasSession } from "../account";
import { AssistantAnswer } from "../assistant-answer";
import { useAssistantConversation, type AssistantMemory } from "../use-assistant-conversation";
import { AtlasTextarea } from "./atlas-textarea";
import "./assistant-chat.css";

const suggestions = [
  { title: "Моя учёба", questions: [
    "Где ближайшая пара?", "Какие пары завтра?", "Какой ближайший дедлайн?", "Мои оценки", "Когда заканчивается мой паспорт здоровья?",
  ] },
  { title: "Справки и возможности", questions: [
    "Как подать заявку на справку об обучении?", "Когда стипендия?", "Когда сессия и каникулы?", "Как записаться к врачу?", "Как подать заявление в ВУЦ?",
  ] },
];

export function AssistantChat({ onKeyboardChange }: { onKeyboardChange: (open: boolean) => void }) {
  const atlas = useAtlasSession();
  if (!atlas || atlas.session.state !== "ready") return null;
  return <ChatConversation key={atlas.session.generation} memory={atlas.memory} onUnauthorized={atlas.onUnauthorized}
    onKeyboardChange={onKeyboardChange}/>;
}

function ChatConversation({ memory, onUnauthorized, onKeyboardChange }: {
  memory: AssistantMemory; onUnauthorized: () => void; onKeyboardChange: (open: boolean) => void;
}) {
  const { question, updateQuestion, messages, pending, error, ask, cancel, reset } = useAssistantConversation(memory, onUnauthorized);
  const [viewport, setViewport] = useState({ height: 0, top: 0, keyboard: false });
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const latest = messages.at(-1);

  useEffect(() => {
    const visible = window.visualViewport;
    const mobile = matchMedia("(max-width: 1023px)");
    let baselineHeight = Math.max(window.innerHeight, visible?.height ?? 0);
    let baselineWidth = window.innerWidth;
    let frame = 0;
    const sync = () => {
      const focused = document.activeElement === input.current;
      const height = Math.floor(visible?.height ?? window.innerHeight);
      if (Math.abs(window.innerWidth - baselineWidth) > 32) {
        baselineWidth = window.innerWidth;
        baselineHeight = Math.max(window.innerHeight, height);
      } else if (!focused) {
        baselineHeight = Math.max(window.innerHeight, height);
      }
      const keyboard = mobile.matches && focused && (visible?.scale ?? 1) < 1.05 && Math.max(window.innerHeight, baselineHeight) - height > 120;
      const top = Math.round(visible?.offsetTop ?? 0);
      setViewport(previous => previous.height === height && previous.top === top && previous.keyboard === keyboard ? previous : { height, top, keyboard });
      onKeyboardChange(keyboard);
    };
    const scheduleSync = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); };
    sync();
    window.addEventListener("resize", scheduleSync);
    visible?.addEventListener("resize", scheduleSync);
    visible?.addEventListener("scroll", scheduleSync);
    document.addEventListener("focusin", scheduleSync);
    document.addEventListener("focusout", scheduleSync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleSync);
      visible?.removeEventListener("resize", scheduleSync);
      visible?.removeEventListener("scroll", scheduleSync);
      document.removeEventListener("focusin", scheduleSync);
      document.removeEventListener("focusout", scheduleSync);
      onKeyboardChange(false);
    };
  }, [onKeyboardChange]);

  useEffect(() => {
    const log = thread.current;
    if (!log) return;
    const answer = latest?.role === "assistant" && log.querySelector(".pch-messages > li:last-child");
    if (answer && answer.getBoundingClientRect().height > log.clientHeight - 32) {
      log.scrollTop += answer.getBoundingClientRect().top - log.getBoundingClientRect().top - 14;
    } else {
      log.scrollTop = log.scrollHeight;
    }
  }, [latest, viewport.height, pending, error]);

  return <section className="pch-root" aria-labelledby="pch-title" data-keyboard-open={viewport.keyboard || undefined}
    style={viewport.height ? { "--pch-vv-height": `${viewport.height}px`, "--pch-vv-top": `${viewport.top}px` } as CSSProperties : undefined}>
    <header className="pch-header">
      <div className="pch-heading">
        <span className="pch-bot-mark"><BotMessageSquare size={22} aria-hidden="true"/></span>
        <div><h1 id="pch-title">ИИ-чат</h1><p>Конкурсный прототип</p></div>
      </div>
      <div className="pch-actions">
        <button type="button" onClick={reset} disabled={!messages.length && !question} title="Новый диалог" aria-label="Новый диалог"><RotateCcw size={19} aria-hidden="true"/></button>
      </div>
    </header>
    <div className="pch-thread" data-empty={messages.length === 0 || undefined} ref={thread} role="log" aria-label="Переписка с помощником" aria-relevant="additions" tabIndex={0}>
      {messages.length === 0 ? <div className="pch-empty">
        <h2>О чём спросить</h2>
        <div className="pch-suggestion-groups">{suggestions.map((group, groupIndex) => <section key={group.title} aria-labelledby={`pch-group-${groupIndex}`}>
          <h3 id={`pch-group-${groupIndex}`}>{group.title}</h3>
          <div className="pch-suggestions">{group.questions.map((example, index) => <button key={example} type="button"
            className={groupIndex === 1 && index >= 2 ? "pch-desktop-suggestion" : undefined}
            disabled={pending} onClick={() => void ask(example)}><span>{example}</span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
        </section>)}</div>
      </div> : <ol className="pch-messages">{messages.map((message, index) => <li key={index} data-chat-role={message.role} data-widgets={message.role === "assistant" && Boolean(message.answer.widgets?.length) || undefined} className="pch-message">
        <span className="sr-only">{message.role === "student" ? "Вы: " : "Помощник: "}</span>
        {message.role === "student" ? <p>{message.text}</p> : <AssistantAnswer answer={message.answer} memory={memory} back="/prototype#assistant"/>}
      </li>)}</ol>}
      {pending && <p className="pch-status" role="status">Готовим ответ…</p>}
      {error && <p className="pch-status" role="alert">{error}</p>}
    </div>
    <form className="pch-composer" onSubmit={event => { event.preventDefault(); void ask(question); }}>
      <label className="sr-only" htmlFor="pch-message">Сообщение</label>
      <AtlasTextarea id="pch-message" fieldRef={input} rows={1} maxLength={assistantQuestionLimit} value={question} placeholder="Напишите сообщение" enterKeyHint="send" autoComplete="off"
        onChange={event => updateQuestion(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); }
        }}/>
      <button type={pending ? "button" : "submit"} onClick={pending ? cancel : undefined}
        disabled={!pending && !question.trim()} aria-label={pending ? "Отменить запрос" : "Отправить вопрос"}>
        {pending ? <X size={22} aria-hidden="true"/> : <Send size={22} aria-hidden="true"/>}
      </button>
    </form>
  </section>;
}
