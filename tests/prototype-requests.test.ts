import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AtlasRequestConfirmation } from "@/components/request-views";

import { describe, expect, it } from "vitest";
import {
  createDemoRequest,
  filterDemoRequests,
  initialDemoRequests,
  replyToDemoRequest,
} from "@/components/prototype/request-demo";

const now = "2026-11-21T09:30:00.000Z";

describe("Atlas demo requests", () => {
  it("provides chronological histories that match each fixture's current status", () => {
    expect(initialDemoRequests.map(request => request.status)).toEqual(["ready", "needs-answer", "in-progress"]);
    for (const { createdAt, history, status } of initialDemoRequests) {
      expect(history[0]).toMatchObject({ at: createdAt, status: "accepted" });
      expect(history.at(-1)?.status).toBe(status);
      expect(history.map(entry => entry.at)).toEqual(history.map(entry => entry.at).sort());
    }
  });

  it("filters all, active, and ready requests from the same records", () => {
    expect(filterDemoRequests(initialDemoRequests, "all")).toEqual(initialDemoRequests);
    expect(filterDemoRequests(initialDemoRequests, "active").map(request => request.status)).toEqual(["needs-answer", "in-progress"]);
    expect(filterDemoRequests(initialDemoRequests, "ready").map(request => request.status)).toEqual(["ready"]);
    expect(filterDemoRequests([], "active")).toEqual([]);
  });

  it("creates an accepted request with a unique reference even at the same timestamp", () => {
    const draft = { name: "Справка о стипендии", purpose: "  По месту требования  ", details: "  За ноябрь  " };
    const first = createDemoRequest(initialDemoRequests, draft, now);
    const second = createDemoRequest([first, ...initialDemoRequests], draft, now);

    expect(first).toMatchObject({
      name: draft.name,
      purpose: "По месту требования",
      details: "За ноябрь",
      status: "accepted",
      createdAt: now,
      history: [{ status: "accepted", at: now }],
    });
    expect(second.id).toBeGreaterThan(first.id);
    expect(new Set([first, second, ...initialDemoRequests].map(request => request.publicNo)).size).toBe(initialDemoRequests.length + 2);
    expect(filterDemoRequests([first, ...initialDemoRequests], "active")).toContain(first);
  });

  it("returns a clarification for review and appends the response exactly once", () => {
    const pending = initialDemoRequests.find(request => request.status === "needs-answer");
    if (!pending) throw new Error("Missing clarification fixture");
    const reply = "Могу 24 ноября в 15:00.\nСпасибо!";
    const revised = replyToDemoRequest(initialDemoRequests, pending.id, reply, now);
    const updated = revised.find(request => request.id === pending.id);

    expect(updated).toMatchObject({ status: "in-progress", clarification: undefined });
    expect(updated?.history).toEqual([...pending.history, { status: "in-progress", at: now, note: reply }]);
    expect(pending.status).toBe("needs-answer");
    expect(revised[0]).toBe(initialDemoRequests[0]);
    expect(replyToDemoRequest(revised, pending.id, reply, now)).toBe(revised);
  });

  it("ignores blank replies, unknown numbers, and requests without a current clarification", () => {
    const pending = initialDemoRequests.find(request => request.status === "needs-answer");
    const ready = initialDemoRequests.find(request => request.status === "ready");
    if (!pending || !ready) throw new Error("Missing request fixtures");

    expect(replyToDemoRequest(initialDemoRequests, pending.id, "  ", now)).toBe(initialDemoRequests);
    expect(replyToDemoRequest(initialDemoRequests, 999, "Готово", now)).toBe(initialDemoRequests);
    expect(replyToDemoRequest(initialDemoRequests, ready.id, "Готово", now)).toBe(initialDemoRequests);
  });
});

it("shows the original Atlas confirmation with the server request number and no submit control", () => {
  const html = renderToStaticMarkup(createElement(AtlasRequestConfirmation, { publicNo: "З-2026-0012", id: "request-12" }));
  expect(html).toContain("ss-form ss-panel");
  expect(html).toContain("ss-success-icon");
  expect(html).toContain("Заявка принята");
  expect(html).toContain("З-2026-0012");
  expect(html).toContain('href="#services"');
  expect(html).toContain('href="#requests/request-12">Открыть заявку');
  expect(html).not.toContain("<form");
});
