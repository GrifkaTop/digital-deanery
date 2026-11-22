import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/v1/assistant/warmup/route";

const { session, requestBridge } = vi.hoisted(() => ({ session: { valid: true }, requestBridge: vi.fn() }));
vi.mock("node:http", () => ({ request: requestBridge }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => session.valid ? { value: "s".repeat(43) } : undefined,
}) }));
vi.mock("../src/server/db", () => ({ getPool: () => ({
  query: async () => ({ rows: [{ id: "synthetic-student" }] }),
}) }));

const origin = "https://demo.example.invalid";

function warmup(init: RequestInit = {}) {
  return POST(new Request(`${origin}/api/v1/assistant/warmup`, {
    method: "POST", headers: { origin, "x-qwen-warmup": "1" }, ...init,
  }));
}

beforeEach(() => {
  session.valid = true;
  requestBridge.mockReset().mockImplementation((_options, callback) => {
    const request = new EventEmitter();
    return Object.assign(request, { end: () => callback({ statusCode: 202, resume: () => {} }) });
  });
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("ASSISTANT_QWEN_SOCKET", "");
  vi.stubEnv("ASSISTANT_QWEN_MODEL", "test-model");
});
afterEach(() => vi.unstubAllEnvs());

it("requires a same-origin signal and a current session before using the bridge", async () => {
  vi.stubEnv("ASSISTANT_QWEN_SOCKET", "/missing-bridge.sock");
  expect((await warmup({ headers: { origin } })).status).toBe(403);
  expect((await warmup({ headers: { origin: "https://foreign.example.invalid", "x-qwen-warmup": "1" } })).status).toBe(403);
  expect((await warmup({ body: '{"model":"another-model"}' })).status).toBe(422);
  session.valid = false;
  expect((await warmup()).status).toBe(401);
  expect(requestBridge).not.toHaveBeenCalled();
});

it("sends an empty bridge request and reports only whether it was accepted", async () => {
  vi.stubEnv("ASSISTANT_QWEN_SOCKET", "/run/qwen/bridge.sock");
  const response = await warmup({ body: new Blob([]) });
  expect(response.status).toBe(204);
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect(requestBridge).toHaveBeenCalledExactlyOnceWith({
    socketPath: "/run/qwen/bridge.sock", path: "/warmup", method: "POST", signal: expect.any(AbortSignal),
  }, expect.any(Function));
});

it("keeps the route optional and handles an unavailable bridge", async () => {
  expect((await warmup()).status).toBe(204);
  expect(requestBridge).not.toHaveBeenCalled();
  vi.stubEnv("ASSISTANT_QWEN_SOCKET", "/missing-bridge.sock");
  requestBridge.mockImplementationOnce(() => {
    const request = new EventEmitter();
    return Object.assign(request, { end: () => request.emit("error", new Error("Bridge unavailable")) });
  });
  expect((await warmup()).status).toBe(503);
});
