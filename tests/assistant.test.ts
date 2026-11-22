import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { assertSectionFits } from "../scripts/document-pdf-layout";
import { assistantRequest, assistantResponse } from "../src/contracts/assistant";
import { documentManifest, preparedDocument } from "../src/contracts/assistant-files";
import { sourceDocument, sourceIds, sourceManifest, sourceQuestions } from "../src/contracts/document-source";
import { classifyFromWords, classifyWithModel, isPeriodFollowUp, normalizeQuestion, questionScope, selectSourcesWithModel, type AssistantClassifier, type AssistantModel } from "../src/server/assistant/classify";
import { conciseDocumentAnswer, scholarshipPaymentCards } from "../src/server/assistant/documents";
import { getImportedDocument, getPublishedTopicCards } from "../src/server/assistant/files";
import { academicCalendarDocumentId, documentVersionId, scholarshipPolicyDocumentId } from "../src/contracts/assistant-files";

vi.mock("server-only", () => ({}));
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db", () => ({ getPool: () => ({ query }) }));

const today = "2026-11-17";
const publicationRevision = "1".repeat(64);
function fragmentsFor(id: string) {
  const source = sourceDocument.parse(JSON.parse(readFileSync(`documents/sources/${id}.json`, "utf8")));
  return source.sections.map(({ text }, index) => ({
    id, text, title: source.title, number: source.number, issuedOn: source.issuedOn,
    hasPdf: false, revision: publicationRevision, position: index + 1, page: index + 1,
  }));
}

it("recognizes period clarifications without treating unrelated questions as follow-ups", () => {
  expect(isPeriodFollowUp("а за декабрь?", today)).toBe(true);
  expect(isPeriodFollowUp("и в 2027 году?", today)).toBe(true);
  expect(isPeriodFollowUp("какая погода в декабре?", today)).toBe(false);
});

it("accepts only the question and classifies paraphrases and multiple topics", () => {
  expect(assistantRequest.safeParse({ command: "next_lesson", args: {} }).success).toBe(false);
  expect(classifyFromWords(normalizeQuestion("Когда придёт стипуха?"))).toEqual({ kind: "topics", topics: ["scholarship_payment"] });
  expect(classifyFromWords("какие правила получения стипендии?")).toEqual({ kind: "topics", topics: ["scholarship_rules"] });
  expect(classifyFromWords("когда сессия и каникулы?")).toEqual({ kind: "topics", topics: ["holidays", "session"] });
  expect(classifyFromWords("сколько составляет социальная стипендия?")).toEqual({ kind: "unsupported" });
  expect(classifyFromWords("куда идти на пару?")).toBeUndefined();
});

it("uses the next published payout date or the requested period", () => {
  const link = { label: "УС-02", href: "/today/assistant/documents/test#section-1" };
  const payments = [
    { month: "2026-12", payOn: "2027-01-05", link },
    { month: "2026-11", payOn: "2026-11-25", link },
  ];
  const question = (value: string, day = today) => scholarshipPaymentCards(payments, questionScope(value, day), day);
  const [answer] = question("когда стипендия?");
  expect(answer.text).toContain("25 ноября 2026");
  expect(answer.text).not.toContain("г..");
  expect(answer.link).toEqual(link);
  expect(question("когда стипендия?", "2026-11-25")[0].text).toContain("25 ноября 2026");
  expect(question("когда стипендия?", "2026-11-26")[0].text).toContain("5 января 2027");
  expect(question("стипендия за декабрь 2026?", "2027-01-07")[0]).toMatchObject({
    title: "Выплата за декабрь 2026 г.", text: expect.stringContaining("5 января 2027"),
  });
  expect(question("стипендия завтра?", "2026-11-24")[0].text).toContain("25 ноября 2026");
  expect(question("стипендия завтра?")).toEqual([]);
  expect(question("стипендия в марте 2027?")).toEqual([]);
  expect(question("когда стипендия?", "2027-01-06")).toEqual([]);
});

it.each(["Когда стипендия?", "Когда будет стипендия?", "Когда перечислят стипуху?", "через сколько стипендия"])("recognizes payment paraphrase %s", (question) => {
  expect(classifyFromWords(normalizeQuestion(question))).toEqual({ kind: "topics", topics: ["scholarship_payment"] });
});

it("rejects duplicate payment months and citations to a page without extracted text", () => {
  const payment = { month: "2026-12", payOn: "2027-01-05", page: 2 };
  const manifest = { title: "График выплат", number: "УС-02", issuedOn: today, synthetic: true, payments: [payment] };
  expect(documentManifest.safeParse({ ...manifest, payments: [payment, payment] }).success).toBe(false);
  const prepared = { format: "deanery-pdf-v1", manifest, fragments: [{ page: 1, text: "График" }] };
  expect(preparedDocument.safeParse(prepared).success).toBe(false);
  expect(preparedDocument.safeParse({ ...prepared, fragments: [{ page: 2, text: "График" }] }).success).toBe(true);
});

it("validates structured sources and derives payout prose inputs from the same rows", () => {
  const sources = sourceIds.map((id) => sourceDocument.parse(JSON.parse(readFileSync(`documents/sources/${id}.json`, "utf8"))));
  const questions = sourceQuestions.parse(JSON.parse(readFileSync("documents/questions.json", "utf8")));
  expect(sources.map(({ id }) => id)).toEqual(sourceIds);
  expect(questions).toHaveLength(32);
  expect(questions.some(({ answerable }) => !answerable)).toBe(true);
  expect(questions.map(({ id }) => id)).toEqual(expect.arrayContaining([
    "assessment-direct", "assessment-colloquial", "combined-assessment-debt", "debt-date-absent", "personal-grade-absent",
    "attendance-direct", "appeal-colloquial", "program-combined", "consultation-direct", "social-direct", "tuition-colloquial", "dorm-absent", "service-map",
  ]));
  const payout = sources.find(({ payments }) => payments)?.payments;
  const source = sources.find(({ payments }) => payments);
  expect(payout?.find(({ month }) => month === "2026-12")?.payOn).toBe("2026-12-24");
  expect(source && sourceManifest(source).manifest.payments?.map(({ month, payOn }) => ({ month, payOn }))).toEqual(payout);
  expect(sourceDocument.safeParse({ ...sources[0], issuedOn: "2026-02-30" }).success).toBe(false);
  expect(source && sourceManifest(source).manifest.payments?.[1].page).toBe(sourceManifest(source!).paymentSection + 1);
});

it("answers a colloquial scholarship definition from the active imported policy", async () => {
  const topic = classifyFromWords(normalizeQuestion("А академическая стипендия — это вообще что?"));
  expect(topic).toEqual({ kind: "topics", topics: ["scholarship_definition"] });
  if (topic?.kind !== "topics") throw new Error("Definition topic not classified");
  query.mockReset().mockResolvedValueOnce({ rows: fragmentsFor(scholarshipPolicyDocumentId) });
  const [[card]] = await getPublishedTopicCards(topic.topics, questionScope("", today), today);
  expect(card).toMatchObject({ title: "Определение", text: expect.stringContaining("денежная выплата"),
    link: { href: `/today/assistant/documents/${documentVersionId(scholarshipPolicyDocumentId, publicationRevision)}#section-1` } });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("d.issued_on <= $2"), [[scholarshipPolicyDocumentId], today]);
});

it("reads both winter topics from one active version and follows replacement dates", async () => {
  const scope = questionScope("периоды зимней сессии и каникул", today);
  const rows = fragmentsFor(academicCalendarDocumentId);
  query.mockReset().mockResolvedValueOnce({ rows });
  const result = await getPublishedTopicCards(["session", "holidays"], scope, today);
  const cards = result.flat();
  expect(cards.map((card) => card.title)).toEqual(["Зимняя сессия", "Зимние каникулы"]);
  expect(assistantResponse.parse({ kind: "answer", text: "По документам вуза", cards }).cards).toHaveLength(2);
  expect(query).toHaveBeenCalledTimes(1);
  const revision = "2".repeat(64);
  const replacement = rows.map((row) => ({ ...row, revision, text: row.text.replace("с 11 по 24", "с 13 по 26") }));
  query.mockResolvedValueOnce({ rows: replacement });
  const [[session]] = await getPublishedTopicCards(["session"], scope, today);
  expect(session.text).toContain("с 13 по 26 января");
  expect(session.link.href).toContain(revision);
  query.mockResolvedValueOnce({ rows: replacement });
  const document = await getImportedDocument(academicCalendarDocumentId, today);
  expect(document?.sections[0]).toMatchObject({ id: "1", title: session.title, text: session.text });
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("d.revision = $2"), [academicCalendarDocumentId, null, today]);
  query.mockResolvedValueOnce({ rows: [] });
  await expect(getImportedDocument(documentVersionId(academicCalendarDocumentId, publicationRevision), today)).resolves.toBeUndefined();
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("d.revision = $2"), [academicCalendarDocumentId, publicationRevision, today]);
});

it("redacts request numbers and rejects model supplied facts and links", async () => {
  const signal = new AbortController().signal;
  const classify = vi.fn<AssistantClassifier>(async () => ({ kind: "topics", topics: ["scholarship_rules"] }));
  await classifyWithModel("Положение о стипендии, заявка СП-2026-0042", classify, signal);
  expect(classify.mock.calls[0][0].question).toBe("Положение о стипендии, заявка [номер заявки]");
  await expect(classifyWithModel("Вымышленный документ",
    async () => ({ kind: "topics", topics: ["session"], href: "https://example.test" }), signal)).rejects.toThrow();
  await expect(classifyWithModel("Можно ещё на неделю?",
    async () => ({ kind: "search", keywords: ["библиотека", "продление"] }), signal))
    .resolves.toEqual({ kind: "search", keywords: ["библиотека", "продление"] });
});

it.each(["javascript:alert(1)", "//example.test/path", "https://example.test", "/study/../../profile", "/requests?unexpected=1"])(
  "rejects widget links outside the cabinet route allowlist: %s", (href) => {
    const id = "20000000-0000-4000-8000-070000000101";
    const variants = [
      { type: "lesson", id, title: "Дисциплина", dateLabel: "23 ноя", timeRange: "14:00–15:30", room: "310", href },
      { type: "deadline", id, title: "Работа", dueLabel: "23 ноя · 14:00", isOverdue: true, href },
      { type: "grades", items: [{ title: "Дисциплина", label: "Итог", resultText: "5 из 5", tone: "success", href }], allGradesHref: "/study" },
      { type: "actions", items: [{ label: "Открыть", href }] },
    ];
    for (const widget of variants) {
      expect(assistantResponse.safeParse({ kind: "answer", text: "Откройте раздел", cards: [], widgets: [widget] }).success).toBe(false);
    }
  },
);

it.each([
  { kind: "personal_grades", discipline: null, owner: "student-b" },
  { kind: "health_passport", group: "group-b" },
  { kind: "submit_request", publicNo: "ЗА-2026-0001" },
  { kind: "clarify", message: "Перейдите на https://example.test" },
])("rejects model output that tries to add authority or an operation: %j", async (output) => {
  await expect(classifyWithModel("Покажи мои данные", async () => output, new AbortController().signal))
    .rejects.toThrow();
});

it("selects only catalog fragments and keeps their original internal links", async () => {
  const signal = new AbortController().signal;
  const cards = [
    { title: "Выдача", text: "14 дней", link: { label: "стр. 1", href: "/today/assistant/documents/test#section-1" } },
    { title: "Продление", text: "7 дней", link: { label: "стр. 2", href: "/today/assistant/documents/test#section-2" } },
  ];
  const select = vi.fn<AssistantModel["selectSources"]>(async () => ({ references: [2] }));
  await expect(selectSourcesWithModel("Можно продлить?", cards, select, signal)).resolves.toEqual([cards[1]]);
  expect(select.mock.calls[0][0].candidates).toEqual([
    { reference: 1, title: "Выдача", text: "14 дней" },
    { reference: 2, title: "Продление", text: "7 дней" },
  ]);
  await expect(selectSourcesWithModel("Можно продлить?", cards, async () => ({ references: [3] }), signal)).rejects.toThrow();
});


it("rejects a section that would overflow its assigned PDF page", () => {
  const pdf = new PDFDocument({ size: "A4", margins: { top: 66, bottom: 82, left: 58, right: 58 } });
  try {
    pdf.font("Helvetica").fontSize(11);
    pdf.y = 640;
    expect(() => assertSectionFits(pdf, "Short text", "test-document", 2)).not.toThrow();
    expect(() => assertSectionFits(pdf, "Long text ".repeat(500), "test-document", 2)).toThrow(/test-document.*2.*не помещается/u);
  } finally {
    pdf.destroy();
  }
});

it("answers from the published policy rules and keeps the legacy policy link usable", async () => {
  const scope = { years: [], months: [], dates: [] };
  const rows = fragmentsFor(scholarshipPolicyDocumentId);
  query.mockReset().mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows });
  const [rules] = await getPublishedTopicCards(["scholarship_rules"], scope, "2026-11-20");
  expect(conciseDocumentAnswer(rules)).toContain("академической задолженности");
  expect(rules[0].link.href).toContain("#section-2");
  expect((await getImportedDocument("scholarship-policy", today))?.sections[1].text).toBe(rules[0].text);
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("d.revision = $2"), [scholarshipPolicyDocumentId, null, today]);
  const payment = scholarshipPaymentCards([{ month: "2026-11", payOn: "2026-11-25", link: { label: "Приказ", href: "/today/assistant/documents/payment#section-1" } }], scope, "2026-11-20");
  expect(conciseDocumentAnswer(payment)).toContain("25 ноября 2026");
  expect(conciseDocumentAnswer(payment)).toContain("назначена академическая стипендия");
});

it("does not substitute a built-in answer for a withdrawn or unsupported publication", async () => {
  const scope = questionScope("Когда зимняя сессия?", today);
  query.mockReset().mockResolvedValueOnce({ rows: [] });
  await expect(getPublishedTopicCards(["session"], scope, today)).resolves.toEqual([[]]);
  const published = fragmentsFor(academicCalendarDocumentId);
  query.mockResolvedValueOnce({ rows: [{ ...published[0], text: "Даты зимней сессии уточняются." }] });
  await expect(getPublishedTopicCards(["session"], scope, today)).resolves.toEqual([[]]);
  query.mockResolvedValueOnce({ rows: published });
  await expect(getPublishedTopicCards(["session"], questionScope("Когда зимняя сессия в 2028 году?", today), today))
    .resolves.toEqual([[]]);
});

it("recognizes the misspelled December when selecting a payment period", () => {
  expect(questionScope("кагда степендия за дикябрь 2026?", "2026-11-20")).toMatchObject({
    years: ["2026"], months: ["12"],
  });
});

it("recognizes misspelled December as a payment period continuation", () => {
  expect(isPeriodFollowUp("а за дикябрь?", "2026-11-21")).toBe(true);
});
