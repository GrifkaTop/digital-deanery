import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/prototype/schedule/export/route";
import { HttpError } from "@/server/auth/service";

const { requireActor } = vi.hoisted(() => ({ requireActor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/service")>();
  return { ...original, requireActor };
});

const exportSchedule = (query: string) => GET(new Request("https://example.test/prototype/schedule/export?" + query));

describe("Atlas calendar compatibility route", () => {
  beforeEach(() => {
    requireActor.mockReset().mockResolvedValue({ id: "synthetic-profile" });
  });

  it("requires authorization before interpreting query parameters", async () => {
    requireActor.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED"));
    const response = await exportSchedule("scope=unknown");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Location")).toBeNull();
  });

  it("hands the week and known scopes to the canonical calendar", async () => {
    const teacher = "20000000-0000-4000-8000-090000000302";
    for (const [suffix, expected] of [
      ["scope=own", ""],
      ["scope=group&id=is-32", "&group=is-32"],
      ["scope=teacher&id=" + teacher, "&teacher=" + teacher],
    ]) {
      const response = await exportSchedule("week=2026-11-16&" + suffix);
      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe("/api/v1/lessons/calendar?date=2026-11-16" + expected);
      expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    }
  });

  it("rejects repeated fields, invalid date anchors and fixture-only identifiers", async () => {
    for (const parameters of [
      "scope=own&scope=group&week=2026-11-16",
      "scope=own&week=2026-11-17",
      "scope=group&id=another&week=2026-11-16",
      "scope=teacher&id=severova&week=2026-11-16",
    ]) expect((await exportSchedule(parameters)).status).toBe(400);
  });
});