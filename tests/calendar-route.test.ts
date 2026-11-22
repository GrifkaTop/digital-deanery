import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), listLessons: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/academics/schedule", () => ({ listLessons: mocks.listLessons, lessonDetail: vi.fn(), lessonToday: vi.fn() }));
vi.mock("@/server/auth/service", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/auth/service")>();
  return { ...original, requireActor: mocks.requireActor };
});
import { getCalendar } from "../src/server/academics/http";
import { HttpError } from "../src/server/auth/service";

beforeEach(() => { vi.clearAllMocks(); });
it("uses the session actor and returns a private calendar", async () => {
  const actor = { id: "student-a", group_id: "group-a" };
  mocks.requireActor.mockResolvedValue(actor);
  mocks.listLessons.mockResolvedValue({ start: "2026-11-16", end: "2026-11-23", items: [] });
  const response = await getCalendar(new Request("https://example.test/api/v1/lessons/calendar?date=2026-11-18"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect(response.headers.get("content-type")).toContain("text/calendar");
  expect(mocks.listLessons).toHaveBeenCalledWith(actor, "2026-11-18", "week", expect.any(Date));
});
it("rejects anonymous and malformed requests without reading lessons", async () => {
  mocks.requireActor.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED"));
  expect((await getCalendar(new Request("https://example.test/api/v1/lessons/calendar"))).status).toBe(401);
  mocks.requireActor.mockResolvedValueOnce({ id: "student-a" });
  expect((await getCalendar(new Request("https://example.test/api/v1/lessons/calendar?date=2026-02-31"))).status).toBe(422);
  expect(mocks.listLessons).not.toHaveBeenCalled();
});
