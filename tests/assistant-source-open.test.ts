import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), document: vi.fn(), page: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/service", () => ({
  requireActor: mocks.actor, checkCsrf: vi.fn(), json: vi.fn(),
  handle: (action: () => Promise<Response>) => action(),
  HttpError: class extends Error {},
}));
vi.mock("../src/server/assistant/files", () => ({
  getImportedDocument: mocks.document, getSourcePdfPage: mocks.page,
  getPublishedPdfPath: vi.fn(), getPublishedTopicCards: vi.fn(), searchDocumentFiles: vi.fn(),
}));
import { openAssistantSource } from "../src/server/assistant/http";

const request = () => new Request("http://0.0.0.0:3000/api/v1/assistant/documents/example/open?section=2");
beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({}); });

it("opens the published PDF at the fragment page after checking the session", async () => {
  mocks.document.mockResolvedValue({ pdfHref: "/api/v1/assistant/documents/example/pdf", sections: [{ id: "2" }] });
  mocks.page.mockResolvedValue(4);
  const response = await openAssistantSource(request(), "example");
  expect(mocks.actor).toHaveBeenCalledOnce();
  expect(response.headers.get("location")).toBe("/api/v1/assistant/documents/example/pdf#page=4");
  expect(response.headers.get("cache-control")).toBe("no-store, private");
});

it("opens the text when the publication has no PDF and rejects missing sources", async () => {
  mocks.document.mockResolvedValueOnce({ sections: [{ id: "2" }] }).mockResolvedValueOnce(undefined);
  const response = await openAssistantSource(request(), "example");
  expect(response.headers.get("location")).toBe("/today/assistant/documents/example#section-2");
  await expect(openAssistantSource(request(), "example")).rejects.toThrow();
});
