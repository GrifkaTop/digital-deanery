import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LiveDeadlineBoard } from "@/components/prototype/live-deadlines";

it("renders live items in Moscow dates with all authorized destination types", () => {
  const first = "10000000-0000-4000-8000-000000000001";
  const second = "10000000-0000-4000-8000-000000000002";
  const third = "10000000-0000-4000-8000-000000000003";
  const assignment = {
    id: first, dueAt: "2026-11-16T20:59:59.000Z", required: true,
    title: "РК1 · Проверочная работа", subjectTitle: "Синтетическая дисциплина",
    target: { kind: "assignment", id: first, workKind: "rk", number: 1 },
  } as const;
  const markup = renderToStaticMarkup(createElement(LiveDeadlineBoard, { data: {
    today: "2026-11-17",
    items: [
      { id: third, title: "Уточнить заявление", dueAt: "2026-11-25T08:00:00.000Z", required: false, target: { kind: "request", id: third } },
      { id: second, title: "Завершить модуль", dueAt: "2026-11-16T21:00:00.000Z", required: true, target: { kind: "discipline", id: second } },
      assignment,
    ],
  }}));

  expect(markup).toContain('dateTime="2026-11-16"');
  expect(markup).toContain('dateTime="2026-11-17"');
  expect(markup).toContain('data-week-start="2026-11-23"');
  expect(markup).toContain('data-academic-category="control">РК1</span>');
  expect(markup).toContain('class="dld-task-subject">Синтетическая дисциплина</strong>');
  expect(markup).toContain('class="dld-task-title">Проверочная работа</span>');
  expect(markup).toContain('href="#work/' + first + '?back=%23deadlines"');
  expect(markup).toContain('href="#study/' + second + '?back=%23deadlines"');
  expect(markup).toContain('href="#requests/' + third + '?back=%23deadlines"');
});

it("shows empty state in all three groups without demo fallbacks", () => {
  const markup = renderToStaticMarkup(createElement(LiveDeadlineBoard, { data: { today: "2026-11-17", items: [] } }));
  expect(markup.match(/class="dld-count">0<\/span>/gu)).toHaveLength(3);
  expect(markup).not.toContain("dld-task-link");
});

it("keeps all rows and full counts in chronological order per status", () => {
  const ids = Array.from({ length: 6 }, (_, index) => "10000000-0000-4000-8000-00000000001" + index);
  const dates = ["2026-11-19", "2026-11-16", "2026-11-17", "2026-11-15", "2026-11-18", "2026-11-17"];
  const kinds = ["request", "request", "discipline", "assignment", "request", "discipline"] as const;
  const data = { today: "2026-11-17", items: dates.map((date, index) => {
    const id = ids[index];
    const kind = kinds[index];
    const target = kind === "assignment" ? { kind, id, workKind: "dz", number: null } : { kind, id };
    return { id, dueAt: date + "T12:00:00+03:00", title: "Работа " + index, subjectTitle: "Предмет", required: true, target };
  }) };
  const markup = renderToStaticMarkup(createElement(LiveDeadlineBoard, { data }));

  expect(markup.match(/class="dld-task-link"/gu)).toHaveLength(6);
  expect(markup.match(/class="dld-count">2<\/span>/gu)).toHaveLength(3);
  expect(markup).toContain('<h1 id="deadline-list-title"');
  expect(markup).toContain('<h3>На этой неделе</h3>');
  expect(markup.match(/id="deadline-link-[^"]+"/gu)).toEqual([3, 1, 2, 5, 4, 0].map(index => 'id="deadline-link-' + ids[index] + '"'));
  expect(markup).toContain('href="#work/' + ids[3] + '?back=%23deadlines"');
});
