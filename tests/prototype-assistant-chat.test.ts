import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantChat } from "../src/components/prototype/assistant-chat";
import type { AssistantMemory } from "../src/components/use-assistant-conversation";

const atlas = vi.hoisted(() => ({ ready: true, memory: {} as AssistantMemory }));
vi.mock("../src/components/account", () => ({
  useAtlasSession: () => ({
    session: atlas.ready ? { state: "ready", generation: 1 } : { state: "loading" },
    memory: atlas.memory, onUnauthorized: () => {},
  }),
}));

const renderChat = () => renderToStaticMarkup(createElement(AssistantChat, { onKeyboardChange: () => {} }));

describe("Atlas assistant", () => {
  beforeEach(() => { atlas.ready = true; atlas.memory = {}; });

  it("restores the named header and disables reset while the conversation is empty", () => {
    const html = renderChat();
    expect(html).toMatch(/^<section class="pch-root" aria-labelledby="pch-title"><header class="pch-header"/u);
    expect(html).toContain('<h1 id="pch-title">ИИ-чат</h1><p>Конкурсный прототип</p>');
    expect(html).toMatch(/<button type="button" disabled="" title="Новый диалог" aria-label="Новый диалог"/u);
    expect(html).toContain("О чём спросить");
    expect(html).toContain("Моя учёба");
    expect(html).toContain("Справки и возможности");
    expect(html).toContain("Где ближайшая пара?");
    expect(html).toContain("Какой ближайший дедлайн?");
    expect(html).toContain("Как подать заявку на справку об обучении?");
    expect(html.match(/class="pch-desktop-suggestion"/gu)).toHaveLength(3);
    expect(html.match(/<div class="pch-suggestions">/gu)).toHaveLength(2);
    expect(html).toContain('aria-label="Отправить вопрос"');
    expect(html).not.toContain("Выйти");
  });

  it("enables reset in the header without duplicating it in the composer", () => {
    atlas.memory.messages = [{ role: "student", text: "Где ближайшая пара?" }];
    const html = renderChat();
    expect(html).toContain('data-chat-role="student"');
    expect(html).toMatch(/<div class="pch-actions"><button type="button" title="Новый диалог" aria-label="Новый диалог"/u);
    expect(html.match(/aria-label="Новый диалог"/gu)).toHaveLength(1);
  });

  it("opens a library source with a native same-document fragment", () => {
    const hash = "#library/20000000-0000-4000-8000-000000000123";
    atlas.memory.messages = [{ role: "assistant", answer: {
      kind: "answer", category: "quick", text: "Найдена книга",
      cards: [], widgets: [{ type: "actions", items: [{ label: "Синтетическая книга", description: "Описание", href: "/prototype" + hash }] }],
    } }];
    expect(renderChat()).toContain('<a href="' + hash + '">');
    expect(renderChat()).toContain("<strong>Синтетическая книга</strong><small>Описание</small>");
  });

  it("separates a document source from the answer", () => {
    atlas.memory.messages = [{ role: "assistant", answer: {
      kind: "answer", category: "document", text: "Текст ответа", concise: true,
      cards: [{ title: "Правила", text: "Подтверждённый текст", link: { label: "Открыть документ", href: "/today/assistant/documents/example#section-2" } }],
    } }];
    expect(renderChat()).toContain('<p>Текст ответа</p></div><div class="chat-sources"><p class="chat-answer-meta">Источник</p>');
    expect(renderChat()).toContain('href="/api/v1/assistant/documents/example/open?section=2" target="_blank"');
  });

  it("renders lists and bold as React elements and escapes HTML", () => {
    atlas.memory.messages = [{ role: "assistant", answer: {
      kind: "answer", category: "quick", cards: [],
      text: "Инструкция\n\n1. Нажмите **Оформить**.\n2. Проверьте данные.\n\n- <img src=x onerror=alert(1)>\n- <em>Текст</em>",
    } }];
    const html = renderChat();
    expect(html).toContain('<ol start="1"><li>Нажмите <strong>Оформить</strong>.');
    expect(html).toContain('<ul><li>&lt;img src=x onerror=alert(1)&gt;</li><li>&lt;em&gt;Текст&lt;/em&gt;');
    expect(html).not.toContain("<img");
  });

  it("does not render the conversation while the session is being checked", () => {
    atlas.ready = false;
    expect(renderChat()).toBe("");
  });
});
