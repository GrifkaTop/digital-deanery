import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrototypePage from "@/app/atlas-page";
import { loginDestination } from "@/components/login-destination";

const { sessionCookie, query, redirect } = vi.hoisted(() => ({
  sessionCookie: vi.fn(), query: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(href); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: sessionCookie }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/db", () => ({ getPool: () => ({ query }) }));
vi.mock("@/components/prototype/interface", () => ({ default: () => "Atlas content" }));

const origin = "https://example.test";
const destination = (next: string, hash = "") => loginDestination({ origin, hash, search: `?next=${encodeURIComponent(next)}` });

describe("Atlas session entry", () => {
  beforeEach(() => {
    sessionCookie.mockReset();
    query.mockReset();
    redirect.mockClear();
  });

  it("does not render Atlas without a checked session and preserves a fragment-free HTTP location", async () => {
    await expect(PrototypePage()).rejects.toThrow("/login?next=%2F");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2F");
    expect(query).not.toHaveBeenCalled();
    sessionCookie.mockReturnValue({ value: "a".repeat(43) });
    query.mockResolvedValue({ rows: [] });
    await expect(PrototypePage()).rejects.toThrow("/login?next=%2F");
  });

  it("renders Atlas only after the server accepts the session", async () => {
    sessionCookie.mockReturnValue({ value: "a".repeat(43) });
    query.mockResolvedValue({ rows: [{ id: "student-demo" }] });
    expect(renderToStaticMarkup(await PrototypePage())).toBe("Atlas content");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("recovers allowed direct and inherited Atlas fragments and existing cabinet links", () => {
    expect(destination("/prototype", "#assistant")).toBe("/#assistant");
    expect(destination("/prototype", "#work/lesson/2026-11-17/2-1-both/control")).toBe("/#work/lesson/2026-11-17/2-1-both/control");
    expect(destination("/prototype#group/is-32", "#assistant")).toBe("/#group/is-32");
    expect(destination("/today/assistant/documents/sample#section-3", "#assistant")).toBe("/today/assistant/documents/sample#section-3");
  });

  it("preserves typed Atlas query options and drops ambiguous or unsupported values", () => {
    const subject = "20000000-0000-4000-8000-000000000123";
    expect(destination("/prototype#library/" + subject + "/read?subjectId=" + subject)).toBe(
      "/#library/" + subject + "/read?subjectId=" + subject,
    );
    expect(destination("/prototype", "#requests/new?kind=study_certificate")).toBe("/#requests/new?kind=study_certificate");
    expect(destination("/prototype#schedule?view=week&date=2026-11-23")).toBe("/#schedule?date=2026-11-23&view=week");
    expect(destination("/prototype#schedule?view=week&view=day&date=2026-02-30&next=%2Funexpected.test")).toBe("/#schedule");
    expect(destination("/prototype#library?subjectId=not-a-uuid")).toBe("/#library");
    expect(destination("/prototype#assistant?kind=study_certificate")).toBe("/#assistant");
  });

  it("rejects external next URLs and treats unrecognized Atlas fragments as a plain entry", () => {
    for (const next of ["//external.test/prototype", "https://external.test/prototype", "/\\external.test/prototype", "/prototype/schedule/export"]) {
      expect(destination(next, "#assistant")).toBe("/");
    }
    expect(destination("/prototype", "#//external.test")).toBe("/");
    expect(destination("/prototype#unknown", "#assistant")).toBe("/");
  });
});
