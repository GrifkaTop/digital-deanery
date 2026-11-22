import { expect, it, vi } from "vitest";
import { assistantResponse, scheduleIntent } from "../src/contracts/assistant";
import { localSchedule, answerSchedule } from "../src/server/assistant/schedule";
import { listLessons, lessonToday } from "../src/server/academics/schedule";
import type { Actor } from "../src/server/auth/service";
vi.mock("server-only", () => ({}));
vi.mock("../src/server/academics/schedule", () => ({ listLessons: vi.fn(), lessonToday: vi.fn() }));
const today = "2026-11-18";
it("resolves relative dates across week and year boundaries, leaving ambiguous dates to Qwen", () => {
  expect(localSchedule("Какие пары завтра?", "2026-12-31")?.date).toBe("2027-01-01");
  expect(localSchedule("Расписание на следующей неделе", today)).toMatchObject({ date: "2026-11-23", view: "week" });
  expect(localSchedule("Пары в пятницу", today)).toBeUndefined();
  expect(localSchedule("Какая погода завтра?", today)).toBeUndefined();
  expect(localSchedule("а завтра?", today, localSchedule("Расписание", today))?.date).toBe("2026-11-19");
  expect(localSchedule("а завтра?", today, localSchedule("Какие пары отменены?", today))).toMatchObject({ date: "2026-11-19", mode: "cancelled" });
  expect(localSchedule("а завтра?", today, localSchedule("Где ближайшая пара?", today))).toMatchObject({ date: "2026-11-19", mode: "list" });
  expect(localSchedule("а после завтра", "2026-12-31", localSchedule("Какие пары завтра?", today))?.date).toBe("2027-01-02");
  expect(localSchedule("Какие пары после завтра?", today)?.date).toBe("2026-11-20");
  expect(localSchedule("а после завтра", today)).toBeUndefined();
});

it("does not select a lesson moved out of the current week as the nearest filtered lesson", async () => {
  const actor = { group_id: "group-a" } as Actor;
  const lesson = { id: "20000000-0000-4000-8000-070000000101", title: "Анализ данных", originalStartsAt: "2026-11-18T06:00:00.000Z", startsAt: "2026-11-30T09:10:00.000Z", endsAt: "2026-11-30T10:40:00.000Z", room: "215", teacher: "Лира", kind: "seminar" as const, status: "moved" as const, reason: "Перенос", version: 2, publishedAt: "2026-11-17T06:00:00.000Z" };
  const earlier = { ...lesson, id: "20000000-0000-4000-8000-070000000102", originalStartsAt: "2026-11-24T09:10:00.000Z", startsAt: "2026-11-24T09:10:00.000Z", endsAt: "2026-11-24T10:40:00.000Z", status: "planned" as const, reason: null };
  vi.mocked(listLessons).mockResolvedValueOnce({ today, date: today, start: "2026-11-16", end: "2026-11-23", items: [lesson], nearest: null })
    .mockResolvedValueOnce({ today, date: "2026-11-25", start: "2026-11-23", end: "2026-11-30", items: [earlier], nearest: null });
  const answer = await answerSchedule(actor, { kind: "schedule", date: today, view: "day", mode: "nearest", filter: "Анализ данных" }, new Date("2026-11-18T10:00:00Z"), "catalog");
  expect(answer).toMatchObject({ category: "quick", text: "Ближайшая пара", cards: [],
    widgets: [{ type: "lesson", title: "Анализ данных", room: "215", teacher: "Лира",
      timeRange: "12:10–13:40", href: `/schedule/${earlier.id}` }] });
});
it("rejects model supplied ownership, invalid dates and untrusted response links", () => {
  const intent = localSchedule("Расписание", today)!;
  expect(scheduleIntent.safeParse({ ...intent, group_id: "other" }).success).toBe(false);
  expect(scheduleIntent.safeParse({ ...intent, date: "2026-02-30" }).success).toBe(false);
  expect(assistantResponse.safeParse({ kind: "answer", text: "", cards: [{ title: "", text: "", link: { label: "", href: "https://example.com" } }] }).success).toBe(false);
});
it("passes the server actor to the existing isolated schedule service and handles an empty day", async () => {
  const actor = { group_id: "group-a" } as Actor;
  vi.mocked(listLessons).mockResolvedValueOnce({ today, date: today, start: today, end: "2026-11-19", items: [], nearest: null });
  const now = new Date("2026-11-18T10:00:00Z");
  const answer = await answerSchedule(actor, localSchedule("Расписание", today)!, now, "catalog");
  expect(listLessons).toHaveBeenCalledWith(actor, today, "day", now);
  expect(answer.kind).toBe("empty");
  expect(assistantResponse.safeParse(answer).success).toBe(true);
});
it("uses the nearest service that excludes cancelled lessons", async () => {
  vi.mocked(lessonToday).mockResolvedValueOnce({ date: today, nearest: null, change: null });
  const actor = { group_id: "group-b" } as Actor;
  const now = new Date("2026-11-18T10:00:00Z");
  await answerSchedule(actor, localSchedule("Где ближайшая пара?", today)!, now, "qwen");
  expect(lessonToday).toHaveBeenCalledWith(actor, now);
});

it("filters cancellations without returning moved lessons", async () => {
  const actor = { group_id: "group-a" } as Actor;
  const lesson = { id: "20000000-0000-4000-8000-070000000101", title: "Письмо", originalStartsAt: "2026-11-18T06:00:00.000Z", startsAt: "2026-11-19T09:10:00.000Z", endsAt: "2026-11-19T10:40:00.000Z", room: "215", teacher: "Лира", kind: "seminar" as const, status: "moved" as const, reason: "Перенос", version: 2, publishedAt: "2026-11-17T06:00:00.000Z" };
  vi.mocked(listLessons).mockResolvedValueOnce({ today, date: today, start: today, end: "2026-11-19", items: [lesson], nearest: null });
  const intent = localSchedule("Какие занятия отменены?", today)!;
  expect(intent.mode).toBe("cancelled");
  const result = await answerSchedule(actor, intent, new Date("2026-11-18T10:00:00Z"), "catalog");
  expect(result.kind).toBe("empty");
  expect(result.cards).toEqual([]);
  expect(result.text).toContain("18 ноя");
});

it("recognizes personal nearest lessons and continues tomorrow only with schedule context", () => {
  const intent = localSchedule("Какая у меня ближайшая пара?", "2026-11-21");
  expect(intent?.mode).toBe("nearest");
  expect(localSchedule("Что у меня завтра?", "2026-11-21")).toBeUndefined();
  expect(localSchedule("Что у меня завтра?", "2026-11-21", intent)?.date).toBe("2026-11-22");
});

it.each([
  ["Какие у меня пары?", "2026-11-21"],
  ["У меня сегодня занятия", "2026-11-21"],
  ["Какие у меня завтра пары?", "2026-11-22"],
  ["У меня послезавтра занятия?", "2026-11-23"],
])("recognizes personal schedule phrasing: %s", (question, date) => {
  expect(localSchedule(question, "2026-11-21")).toMatchObject({ kind: "schedule", date, mode: "list" });
});
