"use client";

import { useEffect, useRef, useState } from "react";
import { assistantQuestionLimit, assistantResponse, type AssistantResponse } from "@/contracts/assistant";

type Message =
  | { role: "student"; text: string; context?: AssistantResponse["context"] }
  | { role: "assistant"; answer: AssistantResponse };

export type AssistantMemory = {
  draft?: string;
  messages?: Message[];
  context?: AssistantResponse["context"];
  fromToday?: boolean;
  documentBack?: "/today" | "/today/assistant" | "/prototype#assistant";
};

export function useAssistantConversation(memory: AssistantMemory, onUnauthorized: () => void) {
  const [question, setQuestion] = useState(memory.draft ?? "");
  const [messages, setMessages] = useState<Message[]>(memory.messages ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = () => active.current?.abort();
    const onVisibility = () => { if (document.hidden) abort(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", abort);
    return () => {
      abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", abort);
    };
  }, []);

  function updateQuestion(value: string) {
    memory.draft = value;
    setQuestion(value);
  }

  function cancel() {
    active.current?.abort();
    active.current = null;
    setPending(false);
  }

  function reset() {
    cancel();
    memory.messages = [];
    delete memory.context;
    setMessages([]);
    updateQuestion("");
    setError(undefined);
  }

  async function ask(value: string) {
    const text = value.trim();
    if (active.current || !text || text.length > assistantQuestionLimit) return;
    const first = /^верн[её]мся к первому вопросу[?!.]*$/iu.test(text)
      ? memory.messages?.find((message) => message.role === "student") : undefined;
    const context = first ? first.context : memory.context;
    const nextMessages: Message[] = [...(memory.messages ?? []), { role: "student", text, context }];
    memory.messages = nextMessages;
    setMessages(nextMessages);
    updateQuestion("");
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    setPending(true);
    setError(undefined);
    try {
      const csrf = await fetch("/api/v1/csrf", { cache: "no-store", signal });
      if (!csrf.ok) throw new Error();
      const { token } = await csrf.json();
      const response = await fetch("/api/v1/assistant/ask", {
        method: "POST", cache: "no-store", signal,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ question: first?.text ?? text, context }),
      });
      if (signal.aborted) return;
      if (response.status === 401) return onUnauthorized();
      if (response.status === 429) {
        const retry = Number(response.headers.get("Retry-After"));
        setError(retry > 0 ? `Слишком много запросов. Повторите через ${retry} сек.` : "Слишком много запросов. Повторите позже.");
        return;
      }
      if (!response.ok) throw new Error();
      const result = assistantResponse.parse(await response.json());
      if (signal.aborted) return;
      memory.context = result.context;
      const updated: Message[] = [...nextMessages, { role: "assistant", answer: result }];
      memory.messages = updated;
      setMessages(updated);
    } catch {
      if (!signal.aborted) {
        if (!memory.draft) updateQuestion(text);
        setError("Не удалось получить ответ. Повторите попытку.");
      }
    } finally {
      if (active.current === controller && !signal.aborted) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return { question, updateQuestion, messages, pending, error, ask, cancel, reset };
}
