"use client";
import { createContext, useContext, type ReactNode } from "react";
import { Resource } from "../resource";
import { useAtlasSession } from "../account";
import { dateInMoscow } from "@/contracts/calendar";
import { eventList, newsList, type eventItem, type newsItem } from "@/contracts/publications";
import type { z } from "zod";
import type { CampusEvent, HomeNews } from "./home-content";

const Content = createContext<{ events: CampusEvent[]; news: HomeNews[] }>({ events: [], news: [] });
const eventTime = new Intl.DateTimeFormat("ru-RU", { timeStyle: "short", timeZone: "Europe/Moscow" });
export const useLiveContent = () => useContext(Content);

const categoryHues = new Map<string, number>([
  ["Кинопоказ", 58], ["Квиз", 312], ["Фестиваль", 265], ["Проекты", 293],
  ["Встреча", 170], ["Мастер-класс", 235], ["Деканат", 203], ["Спорт", 142],
  ["Практикум", 84], ["Хакатон", 19],
]);

function eventHue(kind: string) {
  return categoryHues.get(kind) ?? Array.from(kind).reduce((hue, letter) => (hue * 31 + letter.charCodeAt(0)) % 360, 210);
}

export function presentEvent(event: z.infer<typeof eventItem>): CampusEvent {
  const multiDay = event.endsOn !== event.startsOn;
  const time = event.startsAt && event.endsAt
    ? multiDay ? "По программе" : `${eventTime.format(new Date(event.startsAt))}–${eventTime.format(new Date(event.endsAt))}`
    : "Время уточняется";
  return {
    id: event.id, title: event.title, date: event.startsOn,
    endDate: multiDay ? event.endsOn : undefined,
    shortTitle: event.title, hue: eventHue(event.kind), time, place: event.place, kind: event.kind,
    summary: event.summary, cover: event.cover ?? undefined,
    sections: [
      { heading: "Программа", paragraphs: event.body.split("\n\n") },
      { heading: "Условия участия", paragraphs: [event.participation] },
    ],
  };
}

export function presentNews(news: z.infer<typeof newsItem>): HomeNews & { author: string } {
  return {
    id: news.id, title: news.title, date: dateInMoscow(news.publishedAt), author: news.author,
    summary: news.summary, pinned: news.pinned,
    sections: news.body.split(/\r?\n(?:[ \t]*\r?\n)+/u).reduce<HomeNews["sections"]>((sections, block) => {
      const newline = block.indexOf("\n");
      if (newline !== -1) {
        sections.push({ heading: block.slice(0, newline).trim(), paragraphs: [block.slice(newline + 1).trim()] });
      } else {
        const previous = sections.at(-1);
        if (previous) previous.paragraphs.push(block);
        else sections.push({ heading: news.category, paragraphs: [block] });
      }
      return sections;
    }, []),
    action: news.eventId ? { label: "Открыть событие", href: `#events/${news.eventId}` } : undefined,
  };
}

export function LiveContent({ children }: { children: ReactNode }) {
  const { onUnauthorized } = useAtlasSession()!;
  return <Resource url="/api/v1/events" schema={eventList} onUnauthorized={onUnauthorized}>
    {events => <Resource url="/api/v1/news" schema={newsList} onUnauthorized={onUnauthorized}>
      {news => <Content.Provider value={{ events: events.items.map(presentEvent), news: news.items.map(presentNews) }}>
        {children}
      </Content.Provider>}
    </Resource>}
  </Resource>;
}
