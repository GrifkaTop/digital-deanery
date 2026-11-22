import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { campusEvents } from "@/components/prototype/home-content";
import { eventArtwork } from "@/components/prototype/home-event-artwork";
import { presentEvent } from "@/components/prototype/live-content";
import { UpcomingEvents } from "@/components/prototype/home-events";

it("shows event dates on the cover controls and keeps artwork above the summary", () => {
  const featuredIds = ["cinema", "project-week", "quiz"];
  const events = campusEvents.filter(event => featuredIds.includes(event.id)).sort((a, b) => a.date.localeCompare(b.date));
  const markup = renderToStaticMarkup(createElement(UpcomingEvents, { events, onDetailClick: () => {} }));
  const summaries = markup.match(/<div class="hm-story-summary">.*?<\/div>/g) ?? [];
  expect(summaries).toHaveLength(3);
  expect(summaries.every(summary => !summary.includes("<img"))).toBe(true);
  expect(markup.match(/<img\s/g)).toHaveLength(3);

  const [cinema, projects, quiz] = summaries;
  expect(cinema).toContain('<time dateTime="2026-11-20">20</time></strong> <span>ноября</span>');
  expect(quiz).toContain('<time dateTime="2026-11-24">24</time></strong> <span>ноября</span>');
  expect(projects).toContain('<time dateTime="2026-11-23">23</time>–<time dateTime="2026-11-27">27</time></strong> <span>ноября</span>');
  expect(projects).toContain('aria-controls="hm-council-preview-project-week" aria-describedby="hm-council-date-project-week"');
  expect(projects).toContain('<span class="hm-story-time">По программе</span>');
  expect(projects).toContain('href="#events/project-week"');
});

it("shows distinct artwork for the live top three records without published covers", () => {
  const shared = {
    startsAt: null, endsAt: null, cover: null, place: "Кампус",
    summary: "Кампусное событие", body: "Описание", participation: "Свободный вход",
    publishedAt: "2026-11-01T00:00:00.000Z",
  };
  const events = [
    { ...shared, id: "09f67388-fa18-4f98-8323-ef3d4136494c", title: "Турнир по настольному теннису", kind: "Спорт", startsOn: "2026-11-21", endsOn: "2026-11-21" },
    { ...shared, id: "b0000000-0000-4000-8000-000000000001", title: "Фестиваль студенческих клубов", kind: "Событие", startsOn: "2026-11-21", endsOn: "2026-11-22" },
    { ...shared, id: "d72cc945-d305-4240-83c9-681f3fa4c3ff", title: "Открытие недели проектов", kind: "Проекты", startsOn: "2026-11-23", endsOn: "2026-11-23" },
  ].map(presentEvent);
  const markup = renderToStaticMarkup(createElement(UpcomingEvents, { events, onDetailClick: () => {} }));
  expect(markup.match(/<img\s/g)).toHaveLength(3);
  expect(markup).toContain('src="/prototype-assets/table-tennis-cover.webp"');
  expect(markup).toContain('src="/prototype-assets/campus-festival-cover.webp"');
  expect(markup).toContain('src="/prototype-assets/projects-poster.svg"');
  expect(markup).toContain('href="#events/' + events[0].id + '"');
});

it("prefers the published cover and retains its attribution over local illustration", () => {
  const cover = campusEvents.find(event => event.id === "cinema")?.cover;
  expect(cover).toBeDefined();
  expect(eventArtwork({ id: "table-tennis", kind: "Проекты", cover })).toEqual({ type: "published", ...cover });
});
