"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import type { AssistantResponse, AssistantWidget } from "@/contracts/assistant";
import { CabinetLink } from "./cabinet-link";
import { atlasPath } from "./login-destination";
import type { AssistantMemory } from "./use-assistant-conversation";
import "./assistant-answer.css";

type TextBlock = { kind: "paragraph" | "ordered" | "unordered"; lines: string[]; start?: number };
const sentenceBoundary = new Intl.Segmenter("ru", { granularity: "sentence" });

function paragraphs(text: string) {
  const parts: string[] = [];
  let current = "";
  for (const { segment } of sentenceBoundary.segment(text)) {
    if (current && current.length + segment.length > 290) {
      parts.push(current.trim());
      current = "";
    }
    current += segment;
  }
  if (current) parts.push(current.trim());
  return parts;
}

function textBlocks(text: string) {
  const blocks: TextBlock[] = [];
  let active: TextBlock | undefined;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) {
      active = undefined;
      continue;
    }
    const marker = /^(?:(\d{1,3})[.)]|[-*•])\s+(.+)$/u.exec(line);
    const kind = marker ? (marker[1] ? "ordered" : "unordered") : "paragraph";
    const start = marker?.[1] ? Number(marker[1]) : undefined;
    if (active?.kind === kind && (kind !== "ordered" || start === (active.start ?? 1) + active.lines.length)) {
      active.lines.push(marker?.[2] ?? line);
    } else {
      active = { kind, lines: [marker?.[2] ?? line], start };
      blocks.push(active);
    }
  }
  return blocks;
}

function emphasis(line: string) {
  return line.split(/(\*\*[^*\n]+\*\*)/u).map((part, index) =>
    index % 2 ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}

function AnswerText({ text }: { text: string }) {
  return <div className="chat-answer-text">
    {textBlocks(text).map(({ kind, lines, start }, index) => {
      if (kind === "paragraph") return paragraphs(lines.join(" ")).map((part, paragraph) =>
        <p key={`${index}:${paragraph}`}>{emphasis(part)}</p>);
      const List = kind === "ordered" ? "ol" : "ul";
      return <List key={index} start={start}>{lines.map((line, row) => <li key={row}>{emphasis(line)}</li>)}</List>;
    })}
  </div>;
}

function Widget({ widget, atlas }: { widget: AssistantWidget; atlas: boolean }) {
  const local = (href: string) => atlas && href.startsWith(atlasPath + "#") ? href.slice(atlasPath.length) : href;
  switch (widget.type) {
    case "lesson":
      return <CabinetLink className="chat-widget chat-widget-lesson" href={widget.href}>
        <span className="chat-widget-date"><strong>{widget.dateLabel}</strong><small><span className="chat-widget-date-divider" aria-hidden="true"> · </span>{widget.timeRange}</small></span>
        <span className="chat-widget-main">
          <strong>{widget.title}</strong>
          {widget.teacher && <small>{widget.teacher}</small>}
          {widget.status && <small className="chat-widget-lesson-status">{widget.status}</small>}
        </span>
        <span className="chat-widget-room chat-widget-badge">{/^\d/u.test(widget.room) ? "Ауд. " : ""}{widget.room}</span>
        <ChevronRight className="chat-widget-chevron" size={16} aria-hidden="true"/>
      </CabinetLink>;
    case "deadline": {
      const [date, time] = widget.dueLabel.split(" · ");
      return <CabinetLink className="chat-widget chat-widget-deadline" data-overdue={widget.isOverdue} href={widget.href}>
        <span className="chat-widget-date"><span>{date}</span>{time && <> <span>{time}</span></>}</span>
        <span className="chat-widget-main">
          <strong>{widget.title}</strong>
          {widget.isOverdue || widget.required ? <span className="chat-widget-badge" data-tone={widget.isOverdue ? "danger" : "warning"}>
            {widget.isOverdue ? "Просрочено" : "Обязательный"}
          </span> : null}
        </span>
        <ChevronRight className="chat-widget-chevron" size={16} aria-hidden="true"/>
      </CabinetLink>;
    }
    case "grades":
      return <div className="chat-widget chat-widget-grades">
        <ul aria-label="Опубликованные оценки">
          {widget.items.map(({ title, label, href, tone, resultText }, index) => {
            const row = <>
              <span className="chat-widget-main"><strong>{title}</strong><small>{label}</small></span>
              <span className="chat-widget-badge" data-tone={tone}>{resultText.replace(/^(\d+(?:[.,]\d+)?)\s+из\s+(\d+)$/u, "$1/$2")}</span>
            </>;
            return <li key={index}>{href
              ? <CabinetLink className="chat-widget-grade-row" href={href}>{row}</CabinetLink>
              : <div className="chat-widget-grade-row">{row}</div>}
            </li>;
          })}
        </ul>
        <CabinetLink className="chat-widget-grades-footer" href={widget.allGradesHref}>
          Вся успеваемость <ArrowRight size={16} aria-hidden="true"/>
        </CabinetLink>
      </div>;
    case "actions":
      return <ul className="chat-widget chat-widget-actions"
        data-single-action={widget.items.length === 1 && !widget.items[0].description ? "" : undefined} aria-label="Доступные переходы">
        {widget.items.map(({ label, description, href }) => <li key={href}>
          <CabinetLink href={local(href)}>
            <span className="chat-widget-main"><strong>{label}</strong>{description && <small>{description}</small>}</span>
            <ArrowRight size={16} aria-hidden="true"/>
          </CabinetLink>
        </li>)}
      </ul>;
  }
}

export function AssistantAnswer({ answer, memory, back }: {
  answer: AssistantResponse; memory: AssistantMemory; back: NonNullable<AssistantMemory["documentBack"]>;
}) {
  return <div className="chat-answer">
    <AnswerText text={answer.text}/>
    {Boolean(answer.widgets?.length) && <div className="chat-widgets mt-2 space-y-2">
      {answer.widgets?.map((widget, index) =>
        <Widget key={"id" in widget ? widget.id : index} widget={widget} atlas={back === "/prototype#assistant"}/>)}
    </div>}
    {answer.cards.length > 0 && <div className="chat-sources">
      <p className="chat-answer-meta">Источник</p>
      <ul>
        {answer.cards.map(({ title, text, link }) => <li key={link.href}>
          {!answer.concise && text && <details>
            <summary>{title}</summary>
            <AnswerText text={text}/>
          </details>}
          <a href={link.href.replace(/^\/today\/assistant\/documents\/([^#]+)#section-(\d+)$/u, "/api/v1/assistant/documents/$1/open?section=$2")}
            target="_blank" rel="noopener noreferrer" onClick={() => { memory.documentBack = back; }}>
            {link.label} <ArrowRight size={16} aria-hidden="true"/>
          </a>
        </li>)}
      </ul>
    </div>}
    {answer.processing === "qwen" && <p className="chat-answer-meta chat-processing">С участием Qwen</p>}
  </div>;
}
