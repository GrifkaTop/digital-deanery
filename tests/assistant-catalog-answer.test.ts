import { expect, it, vi } from "vitest";
import { catalogSources, catalogTopic } from "../src/server/assistant/catalog-topics";
import { catalogAnswer } from "../src/server/assistant/catalog-answer";
import type { AssistantDocument } from "../src/contracts/assistant";
vi.mock("server-only", () => ({}));
const questions: Record<string, string> = {
  "academic-debt": "Не сдал экзамен, сколько ещё попыток дадут?",
  "academic-leave": "Как оформить академический отпуск?",
  "assessment-appeals": "Как обратиться, если не согласен с оценкой?",
  "assessment-rules": "В какой форме проходит промежуточная аттестация?",
  "attendance-rules": "Я болел и не пришёл, мне автоматически поставят ноль?",
  "consultation-control-info": "Когда ближайшая консультация?",
  "consultation-rescheduling": "Как попросить перенести консультацию?",
  "discipline-overview": "Какие дисциплины есть и где посмотреть рабочую программу?",
  "dormitory-rules": "Сколько стоит общежитие и есть ли места?",
  "learning-materials": "Где взять материалы курса?",
  "practice-thesis": "Где у меня будет практика и когда сдавать ВКР?",
  "service-directory": "Куда позвонить в деканат?",
  "student-conduct-requests": "Какие правила внутреннего распорядка и как обратиться студенту?",
  "student-social-support": "материальная помощь",
  "transfer-restoration": "Можно ли перевестись и есть ли свободные места?",
  "tuition-payment": "Сколько я должен заплатить и дадут ли скидку?",
};
function fixture(key: string) {
  const source = catalogSources.find((item) => item.id === key)!;
  const id = `file-${key}-${"a".repeat(64)}`;
  const document: AssistantDocument = { id, title: source.title, number: source.number, issuedOn: source.issuedOn,
    sections: source.sections.map((section, i) => ({ id: String(i + 1), title: section.title, text: `Синтетический документ\n\n${section.text}\n\nУчебный материал. При расхождении применяются акты.` })) };
  const card = { title: source.title, text: document.sections[0].text,
    link: { label: source.number, href: `/today/assistant/documents/${id}#section-1` } };
  return { source, document, card };
}
it.each(catalogSources.map((source) => source.id))("provides a verified concise answer for %s", async (key) => {
  const { source, document, card } = fixture(key);
  const question = questions[key];
  expect(catalogTopic(question)?.keys).toContain(key);
  const answer = await catalogAnswer(question, [card], async () => document);
  expect(answer?.cards).toHaveLength(1);
  expect(answer?.text).not.toContain("Полный ответ по ним не подтверждён");
  for (const paragraph of answer!.text.split("\n\n").filter((part) => part !== "По остальным частям вопроса подтверждённые сведения не найдены.")) expect(source.sections.some((section) => section.text === paragraph), paragraph).toBe(true);
});
it("states absent amounts and application procedure for financial aid", async () => {
  const { document, card } = fixture("student-social-support");
  const answer = await catalogAnswer("материальная помощь", [card], async () => document);
  expect(catalogTopic("материальная помощь")?.keys).toEqual(["student-social-support"]);
  expect(answer?.text).toContain("не содержит личного статуса, суммы");
  expect(answer?.text).toContain("список документов, сроки и канал подачи здесь не установлены");
});
it("rejects changed text, an absent section and withdrawn publication", async () => {
  const { document, card } = fixture("student-social-support");
  const changed = { ...document, sections: document.sections.map((part) => ({ ...part, text: part.text.replace("не содержит", "содержит") })) };
  expect(await catalogAnswer("материальная помощь", [card], async () => changed)).toBeUndefined();
  expect(await catalogAnswer("материальная помощь", [card], async () => ({ ...document, sections: document.sections.slice(0, 1) }))).toBeUndefined();
  const load = vi.fn().mockResolvedValueOnce(document).mockResolvedValueOnce(undefined);
  expect(await catalogAnswer("материальная помощь", [card], load)).toBeUndefined();
});
it("retains both confirmed topics with one document card", async () => {
  const a = fixture("assessment-rules"), b = fixture("academic-debt");
  const question = "Какая форма промежуточной аттестации и сколько раз можно пересдать академическую задолженность?";
  const answer = await catalogAnswer(question, [a.card, b.card], async (id) => id === a.document.id ? a.document : b.document);
  expect(answer?.text).toContain("форме, указанной в учебном плане");
  expect(answer?.text).toContain("не более двух раз");
  expect(answer?.cards).toHaveLength(1);
});
it.each(["Когда экзамен по математике?", "Какие у меня оценки?", "Какой ближайший дедлайн?", "Расписание на завтра"])("does not replace personal operations for %s", (question) => {
  expect(catalogTopic(question)).toBeUndefined();
});
