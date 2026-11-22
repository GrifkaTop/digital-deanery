import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { assignmentItem } from "../src/contracts/assignments";
import { AssignmentWorkPage } from "../src/components/prototype/work-page";

const assignment = assignmentItem.parse({
  id: "20000000-0000-4000-8000-080000000301",
  planId: "20000000-0000-4000-8000-030000000300",
  disciplineId: "20000000-0000-4000-8000-020000000300",
  teacherId: "20000000-0000-4000-8000-090000000300",
  teacherName: "Озёрский Лев Михайлович", kind: "dz", number: null, moduleId: null,
  title: "ДЗ · График спроса", description: "ДЗ · График спроса",
  actions: "Постройте график.\nОбъясните изменение спроса.",
  requirements: "Отправьте один PDF.", maxScore: 12, required: true, deadlineId: null,
  issuedAt: "2026-11-10T06:00:00.000Z", publishedAt: "2026-11-10T06:00:00.000Z",
  dueAt: "2026-11-17T15:00:00.000Z",
  result: { stage: "defended", score: 0, completedAt: "2026-11-16T15:00:00.000Z", defendedAt: "2026-11-17T08:00:00.000Z", onTime: true },
});
function render(value = assignment, overdue = false) {
  return renderToStaticMarkup(createElement(AssignmentWorkPage, { assignment: value, overdue, subject: "Экономика", back: null }));
}

it("puts the real topic, instructions and deliverable in the original Work hierarchy", () => {
  const html = render();
  expect(html).toContain('id="pw-title" tabindex="-1" aria-describedby="pw-kind pw-topic pw-score">Экономика');
  expect(html).toContain('id="pw-topic">График спроса</p>');
  expect(html).toMatch(/<h2><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Что сделать<\/h2><ol><li>Постройте график\.<\/li><li>Объясните изменение спроса\.<\/li>/u);
  expect(html).toMatch(/<h2><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Что отправить<\/h2><p>Отправьте один PDF\.<\/p>/u);
  expect(html).toContain("18:00");
  expect(html).toContain("Сдано");
  expect(html).toContain("Оценено");
  expect(html).toContain('#teacher/20000000-0000-4000-8000-090000000300');
  expect(html).toContain('<strong>0</strong> <span>из 12</span>');
  expect(html.match(/<dt>Баллы<\/dt>/gu)).toHaveLength(1);
});

it("shows the known maximum without publishing a result and omits missing conditions", () => {
  const html = render({ ...assignment, result: null, description: "", actions: "", requirements: "" }, true);
  expect(html).toContain('data-overdue="true">Просрочено');
  expect(html).toContain("Не опубликованы");
  expect(html).toContain("Максимум 12");
  expect(html).toContain("Условия работы пока не опубликованы.");
  expect(html).not.toContain('id="pw-score"');
});

it("retains an actual score when the source has no maximum", () => {
  const html = render({ ...assignment, maxScore: null });
  expect(html).toContain('<dd><strong>0</strong></dd>');
  expect(html).not.toContain("Максимум");
});
