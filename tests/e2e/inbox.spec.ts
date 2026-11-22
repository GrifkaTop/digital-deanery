import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const origin = process.env.INBOX_TEST_ORIGIN ?? "https://localhost";
const endpoint = "/api/v1/inbox";
const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
test.use({ baseURL: origin });
test.skip(!process.env.INBOX_TEST_ORIGIN, "Use a disposable stand with fixed academic time.");

async function csrf(context: APIRequestContext) {
  const response = await context.get("/api/v1/csrf");
  expect(response.status()).toBe(200);
  const { token } = await response.json();
  return { Origin: origin, "X-CSRF-Token": token };
}

async function signIn(context: APIRequestContext, account: "A" | "B") {
  expect((await context.post("/api/v1/session/login", {
    headers: await csrf(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  })).status()).toBe(200);
}

async function feed(context: APIRequestContext, filter = "all") {
  const response = await context.get(`${endpoint}?filter=${filter}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store, private");
  return response.json();
}

test("A and B see only their audience, and read time survives repeats and re-login", async () => {
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    expect((await a.get(endpoint)).status()).toBe(401);
    await signIn(a, "A");
    await signIn(b, "B");
    const aAll = await feed(a);
    const bAll = await feed(b);
    expect(aAll.unreadCount).toBeGreaterThan(0);
    expect(bAll.unreadCount).toBe(0);
    expect(bAll.items.some((entry: { kind: string }) => entry.kind === "announcement")).toBe(true);
    expect(aAll.items.slice(0, 2).map((entry: { kind: string }) => entry.kind)).toEqual(["deadline", "deadline"]);
    const aDeadlines = await feed(a, "deadlines");
    expect(aDeadlines.items.map((entry: { title: string }) => entry.title))
      .toEqual(["Загрузить расчёт к практикуму", "Сдать черновик проекта"]);
    expect(aDeadlines.unreadCount).toBe(aAll.unreadCount);
    expect((await feed(b, "important")).items.every((entry: { important: boolean }) => entry.important)).toBe(true);
    expect((await a.get(endpoint + "?group_id=other")).status()).toBe(422);

    const aMove = aAll.items.find((entry: { title: string }) => entry.title.includes("Анализ данных"));
    const bAnnouncement = bAll.items.find((entry: { kind: string }) => entry.kind === "announcement");
    expect(aMove).toBeTruthy();
    expect(bAnnouncement).toBeTruthy();
    const detailUrl = `${endpoint}/${aMove.id}`;
    const detail = async () => (await a.get(detailUrl)).json();
    const moved = await detail();
    expect(moved).toMatchObject({ readAt: null, target: { kind: "lesson" } });
    const lesson = await (await a.get(`/api/v1/lessons/${moved.target.id}`)).json();
    expect(lesson.room).toBe("408");
    const deadline = await (await a.get(`${endpoint}/${aDeadlines.items[0].id}`)).json();
    expect(deadline.target.kind).toBe("discipline");
    const update = aAll.items.find((entry: { kind: string }) => entry.kind === "request_update");
    expect((await (await a.get(`${endpoint}/${update.id}`)).json()).target.kind).toBe("request");

    for (const [context, other] of [[a, bAnnouncement.id], [b, aMove.id]] as const) {
      const absent = await context.get(`${endpoint}/${missing}`);
      const foreign = await context.get(`${endpoint}/${other}`);
      expect(foreign.status()).toBe(404);
      expect(foreign.status()).toBe(absent.status());
      expect(await foreign.json()).toEqual(await absent.json());
      expect((await context.post(`${endpoint}/${other}/read`, { headers: await csrf(context) })).status()).toBe(404);
    }
    expect((await a.post(detailUrl + "/read")).status()).toBe(403);
    expect((await a.post(detailUrl + "/read", { headers: await csrf(a) })).status()).toBe(204);
    const saved = (await detail()).readAt;
    expect(typeof saved).toBe("string");
    expect((await a.post(detailUrl + "/read", { headers: await csrf(a) })).status()).toBe(204);
    expect((await detail()).readAt).toBe(saved);
    expect((await feed(a, "important")).unreadCount).toBe(aAll.unreadCount - 1);
    expect((await feed(b)).unreadCount).toBe(0);
    expect((await a.post("/api/v1/session/logout", { headers: await csrf(a) })).status()).toBe(204);
    expect((await a.get(detailUrl)).status()).toBe(401);
    await signIn(a, "A");
    expect((await detail()).readAt).toBe(saved);
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});

test("mobile notice restores the count when a read fails, then preserves the filter", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/inbox?filter=deadlines");
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const row = page.getByRole("link", { name: /Сдать черновик проекта/ });
  await expect(row.locator(".unread-dot")).toBeVisible();
  const count = await page.locator(".nav-count").innerText();
  await page.route("**/api/v1/inbox/*/read", (route) => route.fulfill({ status: 503 }), { times: 1 });
  await row.click();
  await expect(page.getByRole("heading", { name: "Сдать черновик проекта" })).toBeVisible();
  await expect(page.getByText("Не удалось отметить сообщение как прочитанное.")).toBeVisible();
  await expect(page.locator(".nav-count")).toHaveText(count);
  await page.getByRole("button", { name: "Повторить отметку" }).click();
  await expect(page.locator(".nav-count")).toHaveText(String(Number(count) - 1));
  await expect(page.getByRole("link", { name: "К дисциплине" })).toHaveAttribute("href", /^\/study\//);
  await page.getByRole("link", { name: "К входящим" }).click();
  await expect(page).toHaveURL(/filter=deadlines/);
  await expect(row).toBeVisible();
  await expect(row.locator(".unread-dot")).toHaveCount(0);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
