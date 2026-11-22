import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inboxDetail, inboxList } from "@/contracts/inbox";
import { PrototypeInbox, PrototypeNoticeBody } from "@/components/prototype/prototype-inbox";

const publishedAt = "2026-11-17T06:15:00.000Z";
const defaults = { important: false, publishedAt, readAt: null, dueAt: null, body: "Опубликовано." };
const lessonId = "20000000-0000-4000-8000-070000300772";
const gradeNotices = [
  ["homework", "dz", 1, 0, "Домашняя работа"],
  ["control", "rk", 1, 9, "Рубежный контроль"],
  ["lab", "lr", 3, 8, "Лабораторная работа"],
].map(([category, workKind, number, points, title], index) => ({
  category,
  item: inboxDetail.parse({
    ...defaults, id: "10000000-0000-4000-8000-00000000000" + (index + 1),
    kind: "assignment_result", title: "Проверена работа",
    context: { type: "grade", subject: "Демонстрационная дисциплина", workKind, number, title, points, maxPoints: 10 },
    target: { kind: "assignment", id: "20000000-0000-4000-8000-08000000000" + (index + 1) },
  }),
}));
const move = inboxDetail.parse({
  ...defaults, id: "10000000-0000-4000-8000-000000000009", kind: "schedule_change", title: "Перенос · Экономика",
  context: {
    type: "room_change", title: "Экономика", kind: "seminar", startsAt: "2026-11-17T12:00:00+03:00", endsAt: "2026-11-17T13:35:00+03:00",
    room: "412", building: "корпус А", previousRoom: "112", previousBuilding: null,
  },
  target: { kind: "lesson", id: lessonId },
});
const notices = [...gradeNotices.map(({ item }) => item), move];
const renderInbox = (opened: string | null = null, read: string[] = [], items = notices) =>
  renderToStaticMarkup(createElement(PrototypeInbox, {
    items: inboxList.parse({ items, unreadCount: items.length, nextCursor: null }).items,
    read: new Set(read), opened, onToggle: () => {}, onClose: () => {}, onReadAll: () => {}, readAllDisabled: false,
    renderDetail: id => {
      const item = items.find(entry => entry.id === id);
      return item ? createElement(PrototypeNoticeBody, { item }) : null;
    },
  }));

describe("Atlas typed inbox", () => {
  it("shows a labelled ring for each published assignment result in its category", () => {
    const markup = renderInbox();
    expect(markup.match(/class="p-work-score-badge"/g)).toHaveLength(3);
    for (const { category, item } of gradeNotices) {
      if (item.context?.type !== "grade") throw new Error("Missing grade fixture");
      expect(markup).toContain('data-academic-category="' + category + '"');
      expect(markup).toContain('<span class="p-progress-ring-earned">' + item.context.points + '</span><span class="p-progress-ring-maximum">/10</span>');
    }
    expect(markup).toContain("Баллы: 0 из 10");
    expect(markup).toContain('stroke-dasharray="80 100"');
    expect(markup).toContain('stroke-dasharray="0 100" stroke-linecap="round" visibility="hidden"');
  });

  it("uses the same published score and direct assignment ID after opening or reading", () => {
    const { item } = gradeNotices[2];
    const expanded = renderInbox(item.id, [item.id]);
    expect(expanded.match(/class="p-work-score-badge"/g)).toHaveLength(2);
    expect(expanded).toContain('class="p-inbox-row" data-academic-category="lab"');
    expect(expanded.match(/Непрочитано/g)).toHaveLength(notices.length - 1);
    expect(expanded).toContain("<h2>Демонстрационная дисциплина</h2>");
    expect(expanded).toContain("<strong>8</strong> <span>из 10</span>");
    expect(expanded).toContain('href="#work/' + item.target?.id + '?back=%23inbox"');
  });

  it("shows a result with an unspecified maximum without inventing a denominator", () => {
    const base = gradeNotices[0].item;
    const item = inboxDetail.parse({ ...base, context: { ...base.context, maxPoints: null } });
    expect(renderInbox(null, [], [item])).toContain('aria-label="Баллы: 0"');
    const expanded = renderInbox(item.id, [], [item]);
    expect(expanded).toContain("<dt>Баллы</dt><dd><strong>0</strong>");
    expect(expanded).not.toContain("из 0");
  });

  it("highlights time and the two rooms separately from publication", () => {
    const collapsed = renderInbox();
    const expanded = renderInbox(move.id);
    expect(collapsed).toContain('data-room-change="true"');
    expect(collapsed).toContain('Смена аудитории</strong><small><time dateTime="' + publishedAt + '">');
    expect(collapsed).toContain("09:15");
    expect(collapsed).toContain("Начало пары в </span>");
    expect(collapsed).toContain(">12:00</time>");
    expect(collapsed).toContain("Было </span>112");
    expect(collapsed).toContain("Новая аудитория </span>412 · корпус А");
    expect(expanded).toContain("<h2>Экономика</h2><p>Семинар</p>");
    expect(expanded).toContain("Новая аудитория</span><strong>412 · корпус А</strong>");
    expect(expanded).toContain("17 ноября</span><strong><time");
    expect(expanded).toContain(">13:35</time>");
    expect(expanded).toContain("Было: аудитория 112");
    expect(expanded).toContain('href="#lesson/' + lessonId + '?back=%23inbox"');
  });

  it("can render an ordinary notice without private result data or a fabricated action", () => {
    const item = inboxDetail.parse({ ...defaults, id: move.id, title: "Объявление", kind: "announcement", target: null });
    const markup = renderInbox(item.id, [], [item]);
    expect(markup).toContain("<p>Опубликовано.</p>");
    expect(markup).not.toContain("p-work-score");
    expect(markup).not.toContain("atlas-notice-source");
  });
});
