import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../src/app/api/v1/session/demo/route";
import { issueCsrf, randomToken, sessionDigest } from "../src/server/auth/crypto";

const fake = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), release: vi.fn(), cookies: new Map<string, string>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => fake.cookies.has(name) ? { value: fake.cookies.get(name) } : undefined,
}) }));
vi.mock("../src/server/db", () => ({ getPool: () => ({
  query: fake.query,
  connect: async () => ({ query: fake.transaction, release: fake.release }),
}) }));

const origin = "https://demo.example.invalid";
const testSecret = "s".repeat(64);
const accountId = "10000000-0000-4000-8000-000000000003";

function request(body: unknown = {}, requestOrigin = origin) {
  const session = fake.cookies.get("__Host-session");
  const token = issueCsrf(session ? sessionDigest(session).toString("hex") : "prelogin", testSecret);
  fake.cookies.set("__Host-csrf", token);
  return new Request(`${origin}/api/v1/session/demo`, {
    method: "POST", headers: { origin: requestOrigin, "x-csrf-token": token, "x-real-ip": "192.0.2.1" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("AUTH_SECRET", testSecret);
  vi.stubEnv("ENABLE_DEMO_LOGIN", "true");
  vi.stubEnv("DEMO_MOBILE_LOGIN", "");
  fake.query.mockReset().mockResolvedValue({ rows: [{ id: accountId, is_active: true }] });
  fake.transaction.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO login_rate_limits")) return { rows: [{ count: 1 }] };
    return { rowCount: 1, rows: [] };
  });
  fake.cookies.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("demo login", () => {
  it("is disabled unless configured and hides the action when the seeded profile is unavailable", async () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", "false");
    expect(await (await GET()).json()).toEqual({ enabled: false, profiles: [] });
    expect((await POST(request())).status).toBe(404);
    expect(fake.query).not.toHaveBeenCalled();

    vi.stubEnv("ENABLE_DEMO_LOGIN", "true");
    fake.query.mockResolvedValue({ rows: [] });
    expect(await (await GET()).json()).toEqual({ enabled: false, profiles: [] });
    expect((await POST(request())).status).toBe(401);
    expect(fake.query).toHaveBeenLastCalledWith(expect.any(String), [accountId, "test3", "DEMO-3"]);
  });

  it("rejects a foreign origin, missing CSRF and client-selected accounts before any lookup", async () => {
    expect((await POST(request({}, "https://foreign.example.invalid"))).status).toBe(403);
    const withoutToken = request();
    withoutToken.headers.delete("x-csrf-token");
    expect((await POST(withoutToken)).status).toBe(403);
    for (const profile of ["test3", "c", 1]) expect((await POST(request({ profile }))).status).toBe(422);
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it("applies attempt limiting before looking up the dedicated demo profile", async () => {
    fake.transaction.mockImplementation(async (sql: string) => ({ rows: sql.includes("INSERT INTO login_rate_limits") ? [{ count: 21 }] : [] }));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(fake.query).not.toHaveBeenCalled();
  });

  it("rotates the real protected session and makes no credentials part of the response", async () => {
    vi.stubEnv("DEMO_MOBILE_LOGIN", " Stand-Demo ");
    expect(await (await GET()).json()).toEqual({ enabled: true, profiles: ["a", "b"] });
    const old = randomToken();
    fake.cookies.set("__Host-session", old);
    const response = await POST(request());
    const cookie = response.cookies.get("__Host-session");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 43200 });
    expect(Boolean(cookie?.value && cookie.value !== old)).toBe(true);
    expect(fake.query).toHaveBeenLastCalledWith(expect.stringContaining("st.student_number=$3 AND a.is_active"), [accountId, "stand-demo", "DEMO-3"]);
    expect(fake.transaction).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM sessions"), [sessionDigest(old)]);
    expect(fake.transaction).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO sessions"), [accountId, sessionDigest(cookie!.value)]);
  });

  it.each([ ["a", 1], ["b", 2] ] as const)("allows only the fixed synthetic profile %s", async (profile, number) => {
    expect((await POST(request({ profile }))).status).toBe(200);
    expect(fake.query).toHaveBeenLastCalledWith(expect.any(String), [`10000000-0000-4000-8000-00000000000${number}`, null, `DEMO-${number}`]);
  });
});
