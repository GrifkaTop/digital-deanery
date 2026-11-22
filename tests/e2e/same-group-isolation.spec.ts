import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const origin = process.env.SAME_GROUP_TEST_ORIGIN ?? "https://localhost";
test.skip(!process.env.SAME_GROUP_TEST_ORIGIN, "Use a disposable stand with B assigned to A's group.");

async function headers(context: APIRequestContext) {
  const { token } = await (await context.get("/api/v1/csrf")).json();
  return { Origin: origin, "X-CSRF-Token": token };
}

async function login(context: APIRequestContext, account: "A" | "B") {
  const response = await context.post("/api/v1/session/login", {
    headers: await headers(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}

test("group lessons and notifications are shared while personal state remains separate", async () => {
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await login(a, "A");
    await login(b, "B");
    const aLessons = await (await a.get("/api/v1/lessons?date=2026-11-17")).json();
    const bLessons = await (await b.get("/api/v1/lessons?date=2026-11-17")).json();
    expect(aLessons.items.length).toBeGreaterThan(0);
    expect(bLessons.items.map((item: { id: string }) => item.id)).toEqual(aLessons.items.map((item: { id: string }) => item.id));
    const aStudy = await (await a.get("/api/v1/study")).json();
    expect(aStudy.items.length).toBeGreaterThan(0);
    const foreign = await b.get(`/api/v1/study/${aStudy.items[0].id}`);
    const missing = await b.get("/api/v1/study/ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(foreign.status()).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    const bStudy = await (await b.get("/api/v1/study")).json();
    const assignmentId = "e0000000-0000-4000-8000-000000000001";
    const aAssignment = await (await a.get(`/api/v1/assignments/${assignmentId}`)).json();
    const bAssignment = await (await b.get(`/api/v1/assignments/${assignmentId}`)).json();
    expect(aAssignment.id).toBe(assignmentId);
    expect(bAssignment.id).toBe(assignmentId);
    expect(aAssignment.planId).not.toBe(bAssignment.planId);
    expect(aAssignment.result).toBeNull();
    expect(bAssignment.result).toMatchObject({ stage: "issued", score: null });
    const aDiscipline = await (await a.get(`/api/v1/study/${aAssignment.planId}`)).json();
    const bDiscipline = await (await b.get(`/api/v1/study/${bAssignment.planId}`)).json();
    expect(bDiscipline.grades).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Оценка студента B", value: 2 })]));
    expect(aDiscipline.grades.some((grade: { label: string }) => grade.label === "Оценка студента B")).toBe(false);
    expect(aDiscipline.deadlines).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Личный срок A" })]));
    expect(bDiscipline.deadlines).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Личный срок B" })]));
    expect(JSON.stringify(aDiscipline.deadlines)).not.toContain("Личный срок B");
    expect(JSON.stringify(bDiscipline.deadlines)).not.toContain("Личный срок A");
    const groupDeadline = "f0000000-0000-4000-8000-000000000001";
    expect(aDiscipline.deadlines.find((deadline: { id: string }) => deadline.id === groupDeadline).state).toBe("completed");
    expect(bDiscipline.deadlines.find((deadline: { id: string }) => deadline.id === groupDeadline).state).toBe("upcoming");
    expect((await a.get(`/api/v1/study/${bAssignment.planId}`)).status()).toBe(404);
    expect((await b.get(`/api/v1/study/${aAssignment.planId}`)).status()).toBe(404);
    const sharedExam = aStudy.exams.find((exam: { id: string }) => bStudy.exams.some((other: { id: string }) => other.id === exam.id));
    expect(sharedExam).toBeTruthy();
    const bExam = bStudy.exams.find((exam: { id: string }) => exam.id === sharedExam.id);
    expect(bExam.admission).toEqual({ status: "pending", reason: "Синтетическое уточнение" });
    expect(sharedExam.admission).not.toEqual(bExam.admission);
    const aFeed = await (await a.get("/api/v1/inbox")).json();
    const bFeed = await (await b.get("/api/v1/inbox")).json();
    const shared = aFeed.items.find((item: { kind: string; id: string }) =>
      item.kind === "schedule_change" && bFeed.items.some((other: { id: string }) => other.id === item.id));
    expect(shared).toBeTruthy();
    const url = `/api/v1/inbox/${shared.id}`;
    expect((await (await a.get(url)).json()).readAt).toBeNull();
    expect((await (await b.get(url)).json()).readAt).toBeNull();
    expect((await a.post(`${url}/read`, { headers: await headers(a) })).status()).toBe(204);
    expect((await (await a.get(url)).json()).readAt).not.toBeNull();
    expect((await (await b.get(url)).json()).readAt).toBeNull();
    const ownRequest = "/api/v1/requests/30000000-0000-4000-8000-000000000001";
    expect((await a.get(ownRequest)).status()).toBe(200);
    expect((await b.get(ownRequest)).status()).toBe(404);
    const aSports = await (await a.get("/api/v1/sports")).json();
    const bSports = await (await b.get("/api/v1/sports")).json();
    expect(aSports.passport).toEqual({ validUntil: "2027-06-30", admitted: true });
    expect(bSports.passport).toEqual({ validUntil: "2027-05-31", admitted: false });
    expect(aSports.results[0].score).toBe(8);
    expect(bSports.results[0].score).toBe(3);
    const sportsSession = "c0000000-0000-4000-8000-000000000001";
    expect(aSports.items).toContainEqual(expect.objectContaining({ id: sportsSession, attended: true, booking: "active" }));
    expect(bSports.items).toContainEqual(expect.objectContaining({ id: sportsSession, attended: false, booking: null }));
    expect((await a.post("/api/v1/session/logout", { headers: await headers(a) })).status()).toBe(204);
    for (const path of [ownRequest, `${ownRequest}/document`, url, `/api/v1/study/${aStudy.items[0].id}`]) {
      expect((await a.get(path)).status()).toBe(401);
    }
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});
