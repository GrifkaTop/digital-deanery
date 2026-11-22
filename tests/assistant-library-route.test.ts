import { expect, it, vi } from "vitest";
const { requireActor, answerLibrary } = vi.hoisted(() => ({ requireActor: vi.fn(), answerLibrary: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/service", () => ({
  requireActor, checkCsrf: vi.fn(), json: (data: unknown) => Response.json(data),
  handle: (action: () => Promise<Response>) => action(), HttpError: class extends Error {},
}));
vi.mock("../src/server/assistant/library", async importOriginal => ({
  ...await importOriginal<typeof import("../src/server/assistant/library")>(), answerLibrary,
}));
import { askAssistant } from "../src/server/assistant/http";
const empty = { kind: "empty", category: "quick", processing: "catalog", text: "Нет книг", cards: [] };
const found = { ...empty, kind: "answer", text: "Нашёл книги", widgets: [{ type: "actions", items: [{ label: "Экономика", description: "Редакция", href: "/prototype#library/f2000000-0000-4000-8000-000000000002" }] }] };
it.each(["success", "failure", "invalid", "absent", "still-empty"])("handles library correction: %s", async mode => {
  vi.clearAllMocks();
  answerLibrary.mockReset();
  const actor = {id: "student-a", session_id: `library-${mode}`, group_id: "group-a"};
  requireActor.mockResolvedValue(actor);
  answerLibrary.mockResolvedValueOnce(empty).mockResolvedValueOnce(mode === "still-empty" ? empty : found);
  const classify = vi.fn();
  if (mode === "failure") classify.mockRejectedValue(new Error("unavailable"));
  else classify.mockResolvedValue(mode === "invalid" ? { kind: "search", keywords: [] } : {kind: "search", keywords: ["экономика"]});
  const model = mode === "absent" ? undefined : {classify, selectSources: vi.fn()};
  const response = await askAssistant(new Request("https://localhost/api/v1/assistant/ask", {method:"POST", body:JSON.stringify({question:"ученбик по экомноике"})}), model);
  const result = await response.json();
  const accepted = mode === "success" || mode === "still-empty";
  expect(answerLibrary).toHaveBeenNthCalledWith(1, actor, "экомноике");
  expect(answerLibrary).toHaveBeenCalledTimes(accepted ? 2 : 1);
  expect(result.kind).toBe(mode === "success" ? "answer" : "empty");
  expect(result.processing).toBe(accepted ? "qwen" : "catalog");
  if (accepted) expect(answerLibrary).toHaveBeenNthCalledWith(2, actor, "экономика");
  if (mode !== "absent") expect(classify.mock.calls[0][0].question).toBe("ученбик по экомноике");
});
