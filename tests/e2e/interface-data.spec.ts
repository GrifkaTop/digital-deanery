import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";

async function signIn(context: APIRequestContext, account: "A" | "B") {
  const { token } = await (await context.get("/api/v1/csrf")).json();
  const response = await context.post("/api/v1/session/login", {
    headers: { Origin: origin, "X-CSRF-Token": token },
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}

test("assignment, calendar and sports use the authenticated audience", async () => {
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await signIn(a, "A");
    await signIn(b, "B");
    const assignments = await (await a.get("/api/v1/assignments")).json();
    expect(assignments.items.length).toBeGreaterThan(0);
    const item = assignments.items[0];
    const own = await a.get(`/api/v1/assignments/${item.id}`);
    expect(own.status()).toBe(200);
    expect((await own.json()).dueAt).toBe(item.dueAt);
    expect(own.headers()["cache-control"]).toBe("no-store, private");
    const foreign = await b.get(`/api/v1/assignments/${item.id}`);
    const missing = await b.get("/api/v1/assignments/ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(foreign.status()).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    const events = await a.get("/api/v1/extracurricular-events?from=2026-11-22&to=2026-11-22");
    expect((await events.json()).items.some((event: { title: string }) => event.title === "Фестиваль студенческих клубов")).toBe(true);
    const week = await (await a.get("/api/v1/lessons?date=2026-11-17&view=week")).json();
    expect(week.academicWeek).toEqual({ number: 12, parity: "denominator" });
    const teacher = await a.get("/api/v1/teachers/d0000000-0000-4000-8000-000000000001/schedule?date=2026-11-17&view=week");
    expect(teacher.status()).toBe(200);
    expect((await b.get("/api/v1/teachers/d0000000-0000-4000-8000-000000000001/schedule?date=2026-11-17&view=week")).status()).toBe(404);
    expect((await a.get("/api/v1/sports")).status()).toBe(200);
    const { token } = await (await a.get("/api/v1/csrf")).json();
    expect((await a.post("/api/v1/session/logout", { headers: { Origin: origin, "X-CSRF-Token": token } })).status()).toBe(204);
    expect((await a.get(`/api/v1/assignments/${item.id}`)).status()).toBe(401);
  } finally { await a.dispose(); await b.dispose(); }
});

test("concurrent sports bookings respect capacity and cancellation", async () => {
  test.skip(!process.env.INTERFACE_TEST_DATABASE_URL, "Use an isolated test database.");
  const { Pool } = await import("pg");
  const { randomUUID } = await import("node:crypto");
  const pool = new Pool({ connectionString: process.env.INTERFACE_TEST_DATABASE_URL });
  const id = randomUUID();
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  async function booking(context: APIRequestContext, method: "POST" | "DELETE") {
    const { token } = await (await context.get("/api/v1/csrf")).json();
    return context.fetch(`/api/v1/sports/${id}/booking`, { method, headers: { Origin: origin, "X-CSRF-Token": token } });
  }
  try {
    await pool.query(`INSERT INTO sports_sessions(id,kind,title,starts_at,ends_at,place,capacity,booking_open)
      VALUES($1,'class','Тестовое занятие',now()+interval '1 day',now()+interval '2 days','Тестовый зал',1,true)`, [id]);
    await signIn(a, "A");
    await signIn(b, "B");
    const responses = await Promise.all([booking(a, "POST"), booking(b, "POST")]);
    expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
    const winner = responses[0].status() === 200 ? a : b;
    const other = winner === a ? b : a;
    expect((await booking(winner, "POST")).status()).toBe(200);
    expect((await booking(winner, "DELETE")).status()).toBe(200);
    expect((await booking(winner, "DELETE")).status()).toBe(200);
    expect((await booking(other, "POST")).status()).toBe(200);
    const count = await pool.query("SELECT count(*)::int AS n FROM sports_bookings WHERE session_id=$1 AND status='active'", [id]);
    expect(count.rows[0].n).toBe(1);
  } finally {
    await pool.query("DELETE FROM sports_bookings WHERE session_id=$1", [id]);
    await pool.query("DELETE FROM sports_sessions WHERE id=$1", [id]);
    await pool.end();
    await a.dispose();
    await b.dispose();
  }
});

test("new service request survives a page reload", async ({ page }) => {
  test.skip(!process.env.INTERFACE_TEST_DATABASE_URL, "Use an isolated test database.");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${origin}/login`);
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/today/);
  await page.goto(`${origin}/requests/new`);
  await page.getByRole("link", { name: /Оформление пропуска в кампус/ }).click();
  await page.getByLabel("Цель обращения").selectOption("lost");
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Оформление пропуска в кампус" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Оформление пропуска в кампус" })).toBeVisible();
  await expect(page.getByText("Замена утраченного", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
