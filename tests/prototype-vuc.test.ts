import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Vuc, type VucChecklistItem } from "@/components/prototype/vuc";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVuc, getVucStudy, postVuc, presentVucApplication } from "@/server/vuc/http";

vi.mock("server-only", () => ({}));

const backend = vi.hoisted(() => ({
  requireActor: vi.fn(), checkCsrf: vi.fn(), query: vi.fn(), view: { value: null as unknown, requested: [] as string[] },
}));
vi.mock("@/server/auth/service", async importOriginal => ({
  ...(await importOriginal<typeof import("@/server/auth/service")>()),
  requireActor: backend.requireActor,
  checkCsrf: backend.checkCsrf,
}));
vi.mock("@/components/account", () => ({ useAtlasSession: () => ({ onUnauthorized: () => {} }) }));
vi.mock("@/components/resource", () => ({
  Resource: ({ url, children }: { url: string; children: (data: unknown) => ReactNode }) => {
    backend.view.requested.push(url);
    return children(url.endsWith("/study") ? { schedule: [], requirements: ["Проверка доступа"] } : backend.view.value);
  },
}));
vi.mock("@/server/db", () => ({ getPool: () => ({ query: backend.query }) }));
vi.mock("@/server/clock", () => ({ visibilityNow: () => new Date("2026-11-21T12:00:00Z") }));

const actorId = "11000000-0000-4000-8000-000000000001";
const slotId = "71000000-0000-4000-8000-000000000001";
const URL = "https://localhost/api/v1/vuc";
const submittedAt = new Date("2026-11-01T08:30:00Z");
const now = new Date("2026-11-21T12:00:00Z");
const defaults = {
  submittedAt, slotId: null, startsAt: null, endsAt: null, place: null,
  physicalScore: null, academicScore: null, exercises: null, resultsPublishedAt: null,
  decision: null, decidedAt: null,
};
const booked = {
  ...defaults, slotId, startsAt: new Date("2026-11-20T07:00:00Z"),
  endsAt: new Date("2026-11-20T08:30:00Z"), place: "Синтетический зал",
};
const result = {
  ...booked, physicalScore: 0, academicScore: 80,
  exercises: { pullUps: 0, sprintSeconds: 15.5, distanceSeconds: 287 },
  resultsPublishedAt: new Date("2026-11-21T11:00:00Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  backend.view.requested.length = 0;
  backend.requireActor.mockResolvedValue({ id: actorId });
});

describe("VUC published states", () => {
  it("only displays booking choices after the current actor applies", () => {
    const slots = [{ id: slotId, startsAt: new Date("2027-03-22T07:00:00Z"), endsAt: new Date("2027-03-22T08:30:00Z"), place: "Синтетический зал" }];
    expect(presentVucApplication(defaults, slots, now)).toMatchObject({ status: "submitted", availableSlots: [{ id: slotId }] });
    expect(presentVucApplication({ ...booked, startsAt: slots[0].startsAt, endsAt: slots[0].endsAt }, slots, now))
      .toMatchObject({ status: "scheduled", availableSlots: [], appointment: { id: slotId } });
  });

  it("distinguishes elapsed tests, published zero and a future decision", () => {
    expect(presentVucApplication(booked, [], now)).toMatchObject({ status: "awaiting_results", results: null });
    expect(presentVucApplication({ ...result, resultsPublishedAt: new Date("2026-11-21T13:00:00Z") }, [], now))
      .toMatchObject({ status: "awaiting_results", results: null });
    expect(presentVucApplication({ ...result, decision: "not_admitted", decidedAt: new Date("2026-11-21T13:00:00Z") }, [], now))
      .toMatchObject({ status: "results_published", results: { physicalScore: 0, academicScore: 80, total: 80 }, decidedAt: null });
    expect(presentVucApplication({ ...result, decision: "not_admitted", decidedAt: now }, [], now))
      .toMatchObject({ status: "not_admitted", results: { total: 80 }, decidedAt: now.toISOString() });
  });

  it("loads no applicant record or private schedule without the actor's published data", async () => {
    backend.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const overview = await getVuc(new Request(URL));
    expect(overview.headers.get("cache-control")).toBe("no-store, private");
    expect(await overview.json()).toEqual({
      status: "not_applied", submittedAt: null, appointment: null, availableSlots: [], results: null, decidedAt: null,
    });
    expect(backend.query).toHaveBeenLastCalledWith(expect.stringContaining("WHERE a.student_id=$1"), [actorId]);
    const study = await getVucStudy(new Request(URL + "/study"));
    expect(study.status).toBe(404);
    expect(await study.json()).toEqual({ code: "NOT_FOUND" });
    expect(backend.query).toHaveBeenLastCalledWith(expect.stringContaining("decision='admitted'"), [actorId, now]);
  });

  it("returns owner-admitted study only as a private response", async () => {
    backend.query.mockResolvedValue({ rowCount: 1 });
    const response = await getVucStudy(new Request(URL + "/study"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({
      schedule: [expect.objectContaining({ title: "Организационная встреча" }), expect.any(Object)],
      requirements: [expect.any(String), expect.any(String)],
    });
  });

  it("rejects student-selected owner, score, arbitrary decision and private query parameters", async () => {
    const wrongCommands = [
      { action: "apply", studentId: actorId },
      { action: "book", slotId, physicalScore: 100, decision: "admitted" },
      { action: "publish_results" },
    ];
    for (const body of wrongCommands) {
      const request = new Request(URL, { method: "POST", body: JSON.stringify(body) });
      const response = await postVuc(request);
      expect(backend.checkCsrf).toHaveBeenCalledWith(request);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ code: "INVALID_FIELDS" });
    }
    expect((await getVucStudy(new Request(URL + "/study?studentId=" + actorId))).status).toBe(422);
    expect(backend.query).not.toHaveBeenCalled();
  });
});

describe("Atlas VUC view", () => {
  it("renders the demo application and does not request the gated study panel", () => {
    backend.view.value = {
      status: "not_applied", submittedAt: null, appointment: null, availableSlots: [], results: null, decidedAt: null,
    };
    const markup = renderToStaticMarkup(createElement(Vuc, { checked: new Set<VucChecklistItem>(), toggle: () => {} }));
    expect(markup).toContain("Подать демозаявление");
    expect(markup).toContain("Бег на 100 м");
    expect(markup).toContain("Бег на 1 км");
    expect(markup).toContain("Выполнено 0 из 4");
    expect(backend.view.requested).toEqual(["/api/v1/vuc"]);
    expect(markup).not.toContain("Расписание и требования");
  });

  it("renders published score parts before showing study only to the admitted owner", () => {
    backend.view.value = presentVucApplication({ ...result, decision: "not_admitted", decidedAt: now }, [], now);
    const render = () => renderToStaticMarkup(createElement(Vuc, { checked: new Set<VucChecklistItem>(), toggle: () => {} }));
    const denied = render();
    expect(denied).toContain("В допуске отказано");
    expect(denied).toContain("Физподготовка");
    expect(denied).toContain("Успеваемость");
    expect(denied).toContain("из 200");
    expect(backend.view.requested).not.toContain("/api/v1/vuc/study");

    backend.view.value = presentVucApplication({ ...result, decision: "admitted", decidedAt: now }, [], now);
    const admitted = render();
    expect(admitted).toContain("Допущены к обучению");
    expect(admitted).toContain("Расписание и требования");
    expect(admitted).toContain("Проверка доступа");
    expect(backend.view.requested).toContain("/api/v1/vuc/study");
  });
});
