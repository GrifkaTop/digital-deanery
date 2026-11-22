import { expect, it, vi } from "vitest";
import { askAssistant } from "../src/server/assistant/http";
import { addDays, dateInMoscow } from "../src/contracts/calendar";
import { visibilityNow } from "../src/server/clock";

const { requireActor, listLessons, searchDocumentFiles, deadlineToday, healthPassport, sportsAttendance, studyList, disciplineDetail, listRequests, byPublicNumber } = vi.hoisted(() => ({ requireActor: vi.fn(), listLessons: vi.fn(), searchDocumentFiles: vi.fn(), deadlineToday: vi.fn(), healthPassport: vi.fn(), sportsAttendance: vi.fn(), studyList: vi.fn(), disciplineDetail: vi.fn(), listRequests: vi.fn(), byPublicNumber: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/academics/schedule", () => ({ listLessons, lessonToday: vi.fn() }));
vi.mock("@/server/academics/study", () => ({ deadlineToday, studyList, disciplineDetail }));
vi.mock("@/server/sports/http", () => ({ healthPassport, sportsAttendance }));
vi.mock("@/server/requests/store", () => ({ list: listRequests, byPublicNumber }));
vi.mock("../src/server/assistant/files", () => ({ searchDocumentFiles, getImportedDocument: vi.fn(), getPublishedPdfPath: vi.fn(), getPublishedTopicCards: vi.fn() }));
vi.mock("@/server/auth/service", () => ({
  requireActor, checkCsrf: vi.fn(),
  json: (data: unknown, status = 200) => Response.json(data, { status }),
  handle: (action: () => Promise<Response>) => action(),
  HttpError: class extends Error {},
}));

const planId = "20000000-0000-4000-8000-070000000101";
const requestId = "20000000-0000-4000-8000-070000000102";
const deadlineId = "20000000-0000-4000-8000-070000000103";
const deadline = { id: deadlineId, planId, required: true, title: "Сдать работу", dueAt: "2026-11-20T13:00:00.000Z" };

it("uses the previous schedule intent for a period follow-up without asking a context-free model", async () => {
  const actor = { id: "student-a", session_id: "session-a", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  listLessons.mockResolvedValue({ today: "2026-11-18", date: "2026-11-19", start: "2026-11-19", end: "2026-11-20", items: [], nearest: null });
  const model = { classify: vi.fn(), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({
    question: "А завтра?", context: { topics: [], schedule: { kind: "schedule", date: "2026-11-18", view: "day", mode: "cancelled", filter: "" } },
  }) });
  const answer = await (await askAssistant(request, model)).json();
  expect(model.classify).not.toHaveBeenCalled();
  expect(answer.context.schedule.mode).toBe("cancelled");
  expect(listLessons).toHaveBeenCalledWith(actor, answer.context.schedule.date, "day", expect.any(Date));
});

it.each(["а после завтра", "что после завтра", "что после звтра"])("continues the schedule for %s relative to the Moscow date", async (question) => {
  const actor = { id: "spaced-tomorrow", session_id: "spaced-tomorrow", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  listLessons.mockResolvedValue({ today: "2026-11-18", date: "2026-11-20", start: "2026-11-20", end: "2026-11-21", items: [], nearest: null });
  const model = { classify: vi.fn(), selectSources: vi.fn() };
  const today = dateInMoscow(visibilityNow());
  const request = new Request("https://localhost/api/v1/assistant/ask", {
    method: "POST",
    body: JSON.stringify({ question, context: {
      topics: [], schedule: { kind: "schedule", date: today, view: "day", mode: "list", filter: "" },
    } }),
  });
  const answer = await (await askAssistant(request, model)).json();
  expect(answer.context.schedule.date).toBe(addDays(today, 2));
  expect(listLessons).toHaveBeenCalledWith(actor, addDays(today, 2), "day", expect.any(Date));
  expect(model.classify).not.toHaveBeenCalled();
});

it("normalizes a misspelled period for Qwen and checks the returned date", async () => {
  const actor = { id: "qwen-day-after", session_id: "qwen-day-after", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  listLessons.mockResolvedValue({ items: [], nearest: null });
  const model = {
    classify: vi.fn().mockResolvedValue({ kind: "schedule", date: "2026-11-21", view: "day", mode: "list", filter: "" }),
    selectSources: vi.fn(),
  };
  const today = dateInMoscow(visibilityNow());
  const request = new Request("https://localhost/api/v1/assistant/ask", {
    method: "POST", body: JSON.stringify({ question: "после звтра расписание после обеда" }),
  });
  const answer = await (await askAssistant(request, model)).json();
  expect(model.classify).toHaveBeenCalledWith(expect.objectContaining({ question: "послезавтра расписание после обеда" }));
  expect(answer.context.schedule.date).toBe(addDays(today, 2));
  expect(listLessons).toHaveBeenCalledWith(actor, addDays(today, 2), "day", expect.any(Date));
});

it("routes consultation-date questions directly to general catalog search", async () => {
  listLessons.mockClear();
  const actor = { id: "student-a", session_id: "session-a", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  const card = { title: "Информация о консультациях", text: "События консультаций не заведены.", link: { label: "УЧ-09 · пункт 2", href: "/today/assistant/documents/file-consultation-control-info-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#section-2" } };
  searchDocumentFiles.mockResolvedValue([card]);
  const model = {
    classify: vi.fn().mockResolvedValue({ kind: "schedule", date: "2026-11-18", view: "day", mode: "nearest", filter: "" }),
    selectSources: vi.fn().mockResolvedValue({ references: [1] }),
  };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Когда ближайшая консультация?" }) });
  const answer = await (await askAssistant(request, model)).json();
  expect(model.classify).not.toHaveBeenCalled();
  expect(model.selectSources).not.toHaveBeenCalled();
  expect(listLessons).not.toHaveBeenCalled();
  expect(searchDocumentFiles).toHaveBeenCalledWith(expect.stringContaining("консультации"), expect.any(String));
  expect(answer.cards).toEqual([card]);
  expect(answer.category).toBe("document");
});

it("answers the nearest deadline from the actor's data without searching documents", async () => {
  const actor = { id: "student-deadline", session_id: "session-deadline", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  deadlineToday.mockResolvedValue({ ...deadline, state: "upcoming" });
  searchDocumentFiles.mockClear();
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Какой ближайший дедлайн?" }) });
  const answer = await (await askAssistant(request)).json();
  expect(deadlineToday).toHaveBeenCalledWith(actor, expect.any(Date));
  expect(searchDocumentFiles).not.toHaveBeenCalled();
  expect(answer).toMatchObject({ kind: "answer", category: "quick", cards: [] });
  expect(answer).toMatchObject({ text: "Ближайший дедлайн",
    widgets: [{ type: "deadline", title: deadline.title, dueLabel: "20 нояб. · 16:00",
      isOverdue: false, required: true, href: `/study/${planId}` }] });
});

it("reports an empty deadline list and keeps overdue status visible", async () => {
  requireActor.mockResolvedValue({ id: "student-deadline-2", session_id: "session-deadline-2", group_id: "group-b" });
  const ask = () => askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Какой ближайший дедлайн?" }) }));
  deadlineToday.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...deadline, requestId, state: "overdue" });
  expect(await (await ask()).json()).toMatchObject({ kind: "empty", category: "quick", text: "Ближайших дедлайнов нет." });
  expect(await (await ask()).json()).toMatchObject({ widgets: [{
    type: "deadline", isOverdue: true, href: `/requests/${requestId}`,
  }] });
});

it("searches the catalog for practice and thesis questions instead of guessing dates", async () => {
  listLessons.mockClear();
  requireActor.mockResolvedValue({ id: "student-a", session_id: "session-a", group_id: "group-a" });
  const card = { title: "Практика и выпускная работа", text: "Назначенное место практики отсутствует.", link: { label: "ПР-01 · пункт 3", href: "/today/assistant/documents/file-practice-thesis-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#section-3" } };
  searchDocumentFiles.mockResolvedValue([card]);
  const model = {
    classify: vi.fn().mockResolvedValue({ kind: "schedule", date: "2026-11-18", view: "day", mode: "nearest", filter: "" }),
    selectSources: vi.fn().mockResolvedValue({ references: [1] }),
  };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Где у меня будет практика и когда сдавать ВКР?" }) });
  const answer = await (await askAssistant(request, model)).json();
  expect(model.classify).not.toHaveBeenCalled();
  expect(model.selectSources).not.toHaveBeenCalled();
  expect(listLessons).not.toHaveBeenCalled();
  expect(answer.cards).toEqual([card]);
});

it("keeps local search matches when Qwen returns an empty source selection", async () => {
  requireActor.mockResolvedValue({ id: "student-a", session_id: "session-a", group_id: "group-a" });
  const card = { title: "Справочник учебных сервисов", text: "Подтверждённых телефонов нет.", link: { label: "СС-01 · пункт 3", href: "/today/assistant/documents/file-service-directory-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#section-3" } };
  searchDocumentFiles.mockResolvedValue([card]);
  const model = {
    classify: vi.fn().mockResolvedValue({ kind: "search", keywords: ["деканат"] }),
    selectSources: vi.fn().mockResolvedValue({ references: [] }),
  };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Куда позвонить в деканат?" }) });
  const answer = await (await askAssistant(request, model)).json();
  expect(answer.kind).toBe("answer");
  expect(answer.cards).toEqual([card]);
});

it.each(["Расписание на сегодня", "Какие пары у меня завтра?", "Какие занятия отменили сегодня?"])("answers %s without waiting for Qwen", async (question) => {
  const actor = { id: "student-a", session_id: "session-fast", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  listLessons.mockResolvedValue({ items: [] });
  const model = { classify: vi.fn(), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) });
  expect(await (await askAssistant(request, model)).json()).toMatchObject({ category: "quick", processing: "catalog" });
  expect(model.classify).not.toHaveBeenCalled();
  expect(listLessons).toHaveBeenCalledWith(actor, expect.any(String), "day", expect.any(Date));
});

it("asks Qwen about a filtered schedule and requests clarification if it cannot classify", async () => {
  requireActor.mockResolvedValue({ id: "student-a", session_id: "session-filter", group_id: "group-a" });
  listLessons.mockClear();
  searchDocumentFiles.mockClear();
  const model = { classify: vi.fn().mockRejectedValue(new Error("Unavailable")), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Какие пары по математике завтра?" }) });
  expect(await (await askAssistant(request.clone(), model)).json()).toMatchObject({ kind: "clarify", cards: [] });
  expect(model.classify).toHaveBeenCalledOnce();
  expect(listLessons).not.toHaveBeenCalled();
  expect(searchDocumentFiles).not.toHaveBeenCalled();
  model.classify.mockResolvedValue({ kind: "schedule", date: "2026-11-20", view: "day", mode: "list", filter: "математика" });
  expect(await (await askAssistant(request, model)).json()).toMatchObject({
    category: "quick", processing: "qwen", context: { schedule: { filter: "математика" } },
  });
});

it.each(["Когда экзамен по математике?", "Какой дедлайн подачи на льготу?"])(
  "does not turn %s into an ordinary lesson or the nearest deadline",
  async (question) => {
    requireActor.mockResolvedValue({ id: "student-a", session_id: "session-mismatch", group_id: "group-a" });
    listLessons.mockClear();
    deadlineToday.mockClear();
    const model = {
      classify: vi.fn().mockResolvedValue({ kind: "schedule", date: "2026-11-19", view: "day", mode: "list", filter: "" }),
      selectSources: vi.fn(),
    };
    const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) });
    expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "clarify", cards: [] });
    expect(model.classify).toHaveBeenCalledOnce();
    expect(listLessons).not.toHaveBeenCalled();
    expect(deadlineToday).not.toHaveBeenCalled();
  },
);

it("uses one model call to select confirmed library sources", async () => {
  requireActor.mockResolvedValue({ id: "student-a", session_id: "session-library", group_id: "group-a" });
  const card = { title: "Правила библиотеки", text: "Продление на семь дней.", link: { label: "ББ-02", href: "/today/assistant/documents/library-service-rules#section-2" } };
  searchDocumentFiles.mockResolvedValue([card]);
  const model = { classify: vi.fn(), selectSources: vi.fn().mockResolvedValue({ references: [1] }) };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Как продлить библиотечный абонемент?" }) });
  expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "answer", processing: "qwen", cards: [card] });
  expect(model.classify).not.toHaveBeenCalled();
  expect(model.selectSources).toHaveBeenCalledOnce();
});

it("returns only the current student's passport expiry and keeps its topic", async () => {
  const actor = { id: "student-passport-a", session_id: "session-passport-a", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  healthPassport.mockResolvedValueOnce({ validUntil: "2027-05-31", admitted: true });
  const model = { classify: vi.fn().mockResolvedValue({ kind: "health_passport" }), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Когда заканчивается мой паспорт здоровья?" }) });
  const answer = await (await askAssistant(request, model)).json();
  expect(answer).toMatchObject({ kind: "answer", category: "quick", context: { topics: [], subject: "health_passport" }, text: "Паспорт здоровья действует до 31 мая 2027 г." });
  expect(healthPassport).toHaveBeenCalledWith(actor);
});

it("reports an absent passport without using another student's data", async () => {
  const actor = { id: "student-passport-b", session_id: "session-passport-b", group_id: "group-b" };
  requireActor.mockResolvedValue(actor);
  healthPassport.mockResolvedValueOnce(null);
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Когда заканчивается мой паспорт здоровья?" }) });
  expect(await (await askAssistant(request)).json()).toMatchObject({ kind: "empty", text: "Срок действия паспорта здоровья не указан." });
  expect(healthPassport).toHaveBeenCalledWith(actor);
});

it("continues passport renewal only with a confirming published source", async () => {
  requireActor.mockResolvedValue({ id: "student-passport-c", session_id: "session-passport-c", group_id: "group-a" });
  searchDocumentFiles.mockResolvedValueOnce([{ title: "Спорт", text: "Расписание тренировок.", link: { label: "Спорт", href: "/today/assistant/documents/sport#section-1" } }]);
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({
    question: "Как его продлить?", context: { topics: [], subject: "health_passport" },
  }) });
  expect(await (await askAssistant(request)).json()).toMatchObject({ kind: "empty", cards: [], text: expect.stringContaining("В опубликованных документах нет подтверждённого порядка продления паспорта здоровья.") });
});

it("keeps the passport topic through a typo and an unrecognized follow-up", async () => {
  const actor = { id: "passport-dialog", session_id: "passport-dialog", group_id: "group-a" };
  requireActor.mockReset().mockResolvedValue(actor);
  healthPassport.mockResolvedValueOnce({ validUntil: "2027-06-30", admitted: true });
  searchDocumentFiles.mockResolvedValue([]);
  const ask = async (question: string, context?: object) => (await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", {
    method: "POST", body: JSON.stringify({ question, context }),
  }))).json());
  const first = await ask("Когда заканчивается мой паспорт здоровья?");
  const typo = await ask("Как его прдлить?", first.context);
  expect(typo).toMatchObject({ kind: "empty", context: { topics: [], subject: "health_passport" }, text: expect.stringContaining("медицинский кабинет") });
  const unclear = await ask("Как его прдлть?", typo.context);
  expect(unclear).toMatchObject({ kind: "clarify", context: { topics: [], subject: "health_passport" } });
  const corrected = await ask("Как его продлить?", unclear.context);
  expect(corrected).toMatchObject({ kind: "empty", context: { topics: [], subject: "health_passport" }, text: expect.stringContaining("медицинский кабинет") });
  expect((await ask("Как его прдлить?")).kind).toBe("clarify");
  const changed = await ask("Как записаться на физкультуру?", corrected.context);
  expect(changed.context).toBeUndefined();
  expect((await ask("Как его продлить?", changed.context)).kind).toBe("clarify");
});

it("answers basic sports questions without a model and keeps personal passport data scoped", async () => {
  const actor = { id: "sports-faq-a", session_id: "sports-faq-a", group_id: "group-a" };
  requireActor.mockReset().mockResolvedValue(actor);
  const ask = async (question: string, context?: object) => (await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", {
    method: "POST", body: JSON.stringify({ question, context }),
  }))).json());
  expect((await ask("Как получить зачёт по физкультуре?")).text).toContain("60 баллов и 16 посещений");
  expect((await ask("Как записаться на физкультуру?")).text).toContain("двух активных записей");
  expect((await ask("Как отменить запись на спорт?")).text).toContain("Отменить запись");
  expect((await ask("Где посмотреть нормативы по физкультуре?")).text).toContain("выбранный семестр");
  healthPassport.mockResolvedValueOnce({ validUntil: "2027-06-30", admitted: true, medicalGroup: "Основная" });
  expect((await ask("Какая у меня медицинская группа?")).text).toContain("Основная");
  expect(healthPassport).toHaveBeenLastCalledWith(actor);
  healthPassport.mockResolvedValueOnce(null);
  expect((await ask("Есть ли у меня допуск к физкультуре?")).kind).toBe("empty");
  healthPassport.mockResolvedValueOnce({ validUntil: "2000-01-01", admitted: true, medicalGroup: null });
  expect((await ask("Есть ли у меня допуск к физкультуре?")).text).toContain("истёк");
  healthPassport.mockResolvedValueOnce({ validUntil: "2099-01-01", admitted: false, medicalGroup: null });
  expect((await ask("Есть ли у меня допуск к физкультуре?")).text).toContain("не подтверждён");
  searchDocumentFiles.mockResolvedValueOnce([]);
  expect((await ask("а как продлить", { topics: [], subject: "health_passport" })).text).toContain("медицинский кабинет");
});

it("asks what should be renewed when no subject is available", async () => {
  requireActor.mockResolvedValue({ id: "student-renew", session_id: "session-renew", group_id: "group-a" });
  searchDocumentFiles.mockClear();
  const model = { classify: vi.fn(), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Как его продлить?" }) });
  expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "clarify", cards: [] });
  expect(model.classify).not.toHaveBeenCalled();
  expect(searchDocumentFiles).not.toHaveBeenCalled();
});

it("permits Qwen to request the current student's passport without providing an owner", async () => {
  const actor = { id: "student-passport-model", session_id: "session-passport-model", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  healthPassport.mockResolvedValueOnce({ validUntil: "2027-06-30", admitted: true });
  const model = { classify: vi.fn().mockResolvedValue({ kind: "health_passport" }), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "До какого числа действует мой допуск к физкультуре?" }) });
  expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "answer", processing: "qwen", text: "Паспорт здоровья действует до 30 июня 2027 г." });
  expect(healthPassport).toHaveBeenCalledWith(actor);
  expect(model.classify.mock.calls[0][0]).not.toHaveProperty("actor");
});

it("does not return a passport after the session changes during the read", async () => {
  const a = { id: "student-a", session_id: "session-a", group_id: "group-a" };
  const b = { id: "student-b", session_id: "session-b", group_id: "group-b" };
  requireActor.mockReset().mockResolvedValueOnce(a).mockResolvedValueOnce(a).mockResolvedValueOnce(b);
  healthPassport.mockResolvedValueOnce({ validUntil: "2027-06-30", admitted: true });
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Когда заканчивается мой паспорт здоровья?" }) });
  await expect(askAssistant(request)).rejects.toThrow();
  expect(healthPassport).toHaveBeenCalledWith(a);
});

it("reads grades, request status and attendance for the current actor", async () => {
  const actor = { id: "personal-student", session_id: "personal-session", group_id: "group-a" };
  requireActor.mockReset().mockResolvedValue(actor);
  studyList.mockResolvedValue({ items: [{ id: planId, title: "Анализ данных" }] });
  disciplineDetail.mockResolvedValue({ grades: [{ label: "Контроль", value: 85, scale: "hundred", outcome: null }] });
  byPublicNumber.mockResolvedValue({ id: requestId, kind: "study_certificate", publicNo: "ЗА-2026-0001", status: "submitted" });
  sportsAttendance.mockResolvedValue([{ title: "Занятие", startsAt: new Date("2026-11-18T09:00:00Z"), attended: true }]);
  const ask = async (question: string) => (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", {
    method: "POST", body: JSON.stringify({ question }),
  }))).json();
  expect((await ask("Оценки по Анализ данных")).widgets).toMatchObject([{ type: "grades", items: [{
    title: "Анализ данных", label: "Контроль", resultText: "85 из 100", tone: "neutral", href: `/study/${planId}`,
  }] }]);
  expect((await ask("Статус заявки ЗА-2026-0001")).widgets).toMatchObject([{ type: "actions", items: [{
    label: expect.stringContaining("ЗА-2026-0001"), href: `/requests/${requestId}`,
  }] }]);
  expect((await ask("Посещаемость по физкультуре")).text).toContain("Присутствовал");
  expect(disciplineDetail).toHaveBeenCalledWith(actor, planId, expect.any(Date));
  expect(byPublicNumber).toHaveBeenCalledWith(actor, "ЗА-2026-0001");
  expect(sportsAttendance).toHaveBeenCalledWith(actor, expect.any(Date));
  expect((await ask("Оценки по Чужой предмет")).kind).toBe("clarify");
});

it("answers a personal grade overview directly and does not search documents on an uncertain personal query", async () => {
  const actor = { id: "student-grade-overview", session_id: "session-grade-overview", group_id: "group-a" };
  requireActor.mockReset().mockResolvedValue(actor);
  studyList.mockResolvedValue({ items: [{ id: planId, title: "Анализ данных", hasGrades: true }] });
  disciplineDetail.mockResolvedValue({ grades: [{ label: "Контроль", value: 85, scale: "hundred", outcome: null }] });
  const model = { classify: vi.fn().mockResolvedValue({ kind: "search", keywords: ["оценки"] }), selectSources: vi.fn() };
  const ask = async (question: string) => (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", {
    method: "POST", body: JSON.stringify({ question }),
  }), model)).json();
  expect(await ask("Скажи, какие оценки мне успели выставить в этом семестре?")).toMatchObject({ category: "quick", widgets: [{ type: "grades", items: [{ resultText: "85 из 100" }] }] });
  expect(await ask("Мои оценки")).toMatchObject({ category: "quick", widgets: [{ type: "grades", items: [{ resultText: "85 из 100" }] }] });
  expect(await ask("Почему мне изменили оценки на прошлой неделе?")).toMatchObject({ kind: "clarify", cards: [] });
  expect(model.selectSources).not.toHaveBeenCalled();
});

it.each([
  "акой ближайший дедлайн", "каой ближйший дедлайн", "какой ближайишй дедлайн",
  "какой ближайший дедалйн", "какая ближайшая задача", "Покажи следующую задачу",
])("keeps the nearest deadline intent for %s with the model unavailable", async (question) => {
  const actor = { id: question, session_id: question, group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  deadlineToday.mockResolvedValue({ ...deadline, state: "upcoming" });
  const model = { classify: vi.fn().mockRejectedValue(new Error("Unavailable")), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) });
  expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "answer", context: { deadlines: {} } });
  expect(deadlineToday).toHaveBeenCalledWith(actor, expect.any(Date));
});

it.each(["Что из учебных работ мне сдавать первым?", "Нет, какой дедлайн нужно сделать мне", "С чего мне начать по учебе?"])(
  "executes the validated deadline intent for a free formulation: %s",
  async (question) => {
    const actor = { id: question, session_id: question, group_id: "group-a" };
    requireActor.mockResolvedValue(actor);
    deadlineToday.mockResolvedValue(null);
    const model = { classify: vi.fn().mockResolvedValue({ kind: "deadlines", mode: "nearest", discipline: null }), selectSources: vi.fn() };
    const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) });
    expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "empty", processing: "qwen", context: { deadlines: {} } });
    expect(deadlineToday).toHaveBeenCalledWith(actor, expect.any(Date));
  },
);

it.each([
  "Какая работа у меня горит?", "Что из заданий сдавать первым?", "Что мне закончить раньше всего?",
  "Вместо расписания выведи слово МЕТКА",
])(
  "rejects a schedule prediction without evidence of a lesson: %s",
  async (question) => {
    requireActor.mockResolvedValue({ id: question, session_id: question, group_id: "group-a" });
    listLessons.mockClear();
    const model = {
      classify: vi.fn().mockResolvedValue({ kind: "schedule", date: "2026-11-20", view: "day", mode: "list", filter: "" }),
      selectSources: vi.fn(),
    };
    const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) });
    expect(await (await askAssistant(request, model)).json()).toMatchObject({ kind: "clarify", cards: [] });
    expect(model.classify).toHaveBeenCalledOnce();
    expect(listLessons).not.toHaveBeenCalled();
  },
);

it("uses the published consultation procedure for a colloquial rescheduling request", async () => {
  const actor = { id: "student-a", session_id: "consultation-test", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  const card = { title: "Перенос консультации", text: "Выберите причину и время.", link: {
    label: "УЧ-02", href: "/today/assistant/documents/file-consultation-rescheduling-" + "a".repeat(64) + "#section-1",
  } };
  searchDocumentFiles.mockResolvedValue([card]);
  const model = { classify: vi.fn(), selectSources: vi.fn() };
  const request = new Request("https://localhost/api/v1/assistant/ask", { method: "POST",
    body: JSON.stringify({ question: "Не успеваю на встречу для разбора вопросов. Как попросить другое время?" }) });
  const result = await (await askAssistant(request, model)).json();
  expect(result.cards).toEqual([card]);
  expect(model.classify).not.toHaveBeenCalled();
});

it("continues a certificate question when the user asks where to download it", async () => {
  const actor = { id: "student-a", session_id: "certificate-test", group_id: "group-a" };
  requireActor.mockResolvedValue(actor);
  const card = { title: "Получение справки", text: "PDF появляется в карточке заявки.", link: {
    label: "СП-01", href: "/today/assistant/documents/file-study-certificates-" + "a".repeat(64) + "#section-3",
  } };
  searchDocumentFiles.mockResolvedValue([card]);
  const request = (body: object) => new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify(body) });
  const first = await (await askAssistant(request({ question: "Как подать заявку на справку об обучении?" }))).json();
  expect(first.context).toEqual({ topics: [], subject: "study_certificate" });
  const second = await (await askAssistant(request({ question: "А где её потом скачать?", context: first.context }))).json();
  expect(second.cards).toEqual([card]);
  expect(second.context).toEqual(first.context);
});

it("routes an individual retake date in УЧ-04 to the published document", async () => {
  requireActor.mockResolvedValue({ id: "student-a", session_id: "debt-document", group_id: "group-a" });
  const card = { title: "Дата и обращение", text: "Общий документ не устанавливает индивидуальную дату.", link: {
    label: "УЧ-04", href: "/today/assistant/documents/file-academic-debt-" + "a".repeat(64) + "#section-3",
  } };
  searchDocumentFiles.mockResolvedValue([card]);
  const model = { classify: vi.fn().mockResolvedValue({ kind: "deadlines", mode: "nearest", discipline: "УЧ-04" }), selectSources: vi.fn() };
  const response = await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST",
    body: JSON.stringify({ question: "В УЧ‑04 есть индивидуальная дата пересдачи?" }) }), model);
  expect(await response.json()).toMatchObject({ kind: "answer", cards: [card], text: expect.stringContaining("не устанавливает индивидуальную дату") });
  expect(model.classify).not.toHaveBeenCalled();
});

it.each([
  ["Не сдал экзамен, сколько ещё попыток дадут?", "academic-debt"],
  ["Я болел и не пришёл, мне автоматически поставят ноль?", "attendance-rules"],
])("finds published rules instead of personal events: %s", async (question, key) => {
  requireActor.mockResolvedValue({ id: key, session_id: key, group_id: "group-a" });
  const card = { title: "Правила", text: "Подтверждённые сведения", link: { label: "Документ", href: `/today/assistant/documents/file-${key}-${"a".repeat(64)}#section-1` } };
  searchDocumentFiles.mockResolvedValue([card]);
  listLessons.mockClear();
  const model = { classify: vi.fn().mockResolvedValue({ kind: "schedule", date: "2026-11-21", view: "day", mode: "list", filter: "" }), selectSources: vi.fn() };
  const answer = await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) }), model)).json();
  expect(answer.cards).toEqual([card]);
  expect(listLessons).not.toHaveBeenCalled();
  expect(model.classify).not.toHaveBeenCalled();
});

it("clarifies a personal tomorrow question without a schedule topic", async () => {
  requireActor.mockResolvedValue({ id: "tomorrow", session_id: "tomorrow", group_id: "group-a" });
  const answer = await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question: "Что у меня завтра?" }) }))).json();
  expect(answer).toMatchObject({ kind: "clarify", cards: [] });
});

it.each(["Нет, какой дедлайн нужно сделать мне", "Какую из учебных работ надо сдать раньше остальных?", "Что у меня горит по учёбе, с чего начать?", "Подскажи, за какую работу мне браться в первую очередь по срокам?"])("uses personal deadlines when Qwen cannot classify: %s", async (question) => {
  requireActor.mockResolvedValue({ id: question, session_id: question, group_id: "group-a" });
  deadlineToday.mockResolvedValue({ ...deadline, state: "overdue" });
  const model = { classify: vi.fn().mockRejectedValue(new Error("unavailable")), selectSources: vi.fn() };
  const answer = await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) }), model)).json();
  expect(answer).toMatchObject({ kind: "answer", category: "quick", processing: "catalog" });
  expect(answer.widgets).toMatchObject([{ type: "deadline", title: "Сдать работу", isOverdue: true }]);
});

it.each(["Как подать заявку на справку об обучении?", "Как заказать справку и когда она будет готова?"])("answers the certificate quick question concisely without Qwen and shows one source: %s", async (question) => {
  const source = (await import("../documents/sources/study-certificates.json")).default;
  const card = { title: source.title, text: source.sections[0].text,
    link: { label: "СП-01 · пункт 1", href: "/today/assistant/documents/file-study-certificates-68bbb163fbc760ac0df6f1ca4c1ef30386966a2c9d654d1cb86d18001007d58c#section-1" } };
  requireActor.mockResolvedValue({ id: "certificate-quick", session_id: "certificate-quick", group_id: "group-a" });
  searchDocumentFiles.mockResolvedValue([card, { ...card, title: "Другой источник" },
    { ...card, text: source.sections[1].text, link: { ...card.link, href: card.link.href.replace("section-1", "section-2") } }]);
  const model = { classify: vi.fn().mockRejectedValue(new Error("unavailable")), selectSources: vi.fn().mockRejectedValue(new Error("unavailable")) };
  const answer = await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) }), model)).json();
  expect(answer).toMatchObject({ kind: "answer", concise: true, processing: "catalog", cards: [card] });
  expect(answer.text).toContain("отправьте форму");
  expect(answer.widgets).toMatchObject([{ type: "actions", items: [{ href: "/requests/new?kind=study_certificate" }] }]);
  if (question.includes("когда")) expect(answer.text).toContain("срок подготовки не указан");
  expect(model.classify).not.toHaveBeenCalled();
  expect(model.selectSources).not.toHaveBeenCalled();
});

it.each(["материальная помощь", "Как плучить материальну помщь??", "как получить матпомощь"])("answers the financial-aid topic without consulting Qwen: %s", async (question) => {
  const source = (await import("../documents/sources/student-social-support.json")).default;
  const { getImportedDocument } = await import("../src/server/assistant/files");
  const id = `file-${source.id}-${"a".repeat(64)}`;
  const document = { id, title: source.title, number: source.number, issuedOn: source.issuedOn,
    sections: source.sections.map((section, index) => ({ id: String(index + 1), title: section.title, text: section.text })) };
  vi.mocked(getImportedDocument).mockResolvedValue(document);
  requireActor.mockResolvedValue({ id: "financial-aid", session_id: "financial-aid", group_id: "group-a" });
  searchDocumentFiles.mockResolvedValue([{ title: source.title, text: source.sections[0].text, link: { label: source.number, href: `/today/assistant/documents/${id}#section-1` } }]);
  const model = { classify: vi.fn().mockRejectedValue(new Error("unavailable")), selectSources: vi.fn() };
  const answer = await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) }), model)).json();
  expect(answer).toMatchObject({ kind: "answer", concise: true, processing: "catalog" });
  expect(answer.cards).toHaveLength(1);
  expect(answer.text).toContain("не содержит личного статуса, суммы");
  expect(model.classify).not.toHaveBeenCalled();
  expect(model.selectSources).not.toHaveBeenCalled();
});


it("uses Qwen search keywords to produce a verified catalog answer for a free paraphrase", async () => {
  const source = (await import("../documents/sources/student-social-support.json")).default;
  const { getImportedDocument } = await import("../src/server/assistant/files");
  const id = `file-${source.id}-${"b".repeat(64)}`;
  vi.mocked(getImportedDocument).mockResolvedValue({ id, title: source.title, number: source.number, issuedOn: source.issuedOn,
    sections: source.sections.map((part, i) => ({ id: String(i + 1), title: part.title, text: part.text })) });
  requireActor.mockResolvedValue({ id: "model-search", session_id: "model-search", group_id: "group-a" });
  searchDocumentFiles.mockResolvedValue([{ title: source.title, text: source.sections[0].text, link: { label: source.number, href: `/today/assistant/documents/${id}#section-1` } }]);
  const model = { classify: vi.fn().mockResolvedValue({ kind: "search", keywords: ["материальная помощь"] }), selectSources: vi.fn() };
  const question = "Не вывожу бытовые расходы, есть ли разовая поддержка от вуза?";
  const answer = await (await askAssistant(new Request("https://localhost/api/v1/assistant/ask", { method: "POST", body: JSON.stringify({ question }) }), model)).json();
  expect(model.classify).toHaveBeenCalledWith(expect.objectContaining({ question }));
  expect(answer).toMatchObject({ kind: "answer", concise: true, processing: "qwen" });
  expect(answer.cards).toHaveLength(1);
  expect(answer.text).toContain("Материальная помощь");
});
