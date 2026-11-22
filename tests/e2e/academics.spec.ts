import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";
const day = "/api/v1/lessons?date=2026-11-17";
const unknown = "ffffffff-ffff-4fff-8fff-ffffffffffff";

async function signIn(context: APIRequestContext, account: "A" | "B") {
  const csrf = await context.get("/api/v1/csrf");
  const { token } = await csrf.json();
  const response = await context.post("/api/v1/session/login", {
    headers: { Origin: origin, "X-CSRF-Token": token },
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}

test("schedule revisions and study results respect both account audiences", async () => {
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    expect((await a.get(day)).status()).toBe(401);
    await signIn(a, "A");
    await signIn(b, "B");
    expect((await a.get("/api/v1/lessons?date=2026-02-31")).status()).toBe(422);
    expect((await a.get(day + "&group_id=other")).status()).toBe(422);

    const aDay = await (await a.get(day)).json();
    expect(aDay.today).toBe("2026-11-17");
    expect(aDay.items[0]).toMatchObject({ room: "408", status: "moved" });
    const aLesson = `/api/v1/lessons/${aDay.items[0].id}`;
    const detail = await a.get(aLesson);
    expect(detail.headers()["cache-control"]).toBe("no-store, private");
    expect((await detail.json()).history.map((revision: { room: string }) => revision.room)).toEqual(["408", "214"]);

    const week = await (await a.get(day + "&view=week")).json();
    expect(week.start).toBe("2026-11-16");
    const move = week.items.find((item: { title: string }) => item.title === "Академическое письмо");
    expect(move.originalStartsAt).toBe("2026-11-18T06:00:00.000Z");
    expect(move.startsAt).toBe("2026-11-19T09:10:00.000Z");
    expect(week.items.some((item: { status: string }) => item.status === "replaced")).toBe(true);

    const bDay = await (await b.get(day)).json();
    expect(bDay.items).toEqual([]);
    expect(bDay.nearest).toMatchObject({ room: "307" });
    const bWeek = await (await b.get(day + "&view=week")).json();
    expect(bWeek.items.some((item: { status: string }) => item.status === "cancelled")).toBe(true);
    expect((await b.get("/api/v1/today?block=lesson").then((response) => response.json())).nearest.id).toBe(bDay.nearest.id);

    const studyA = await (await a.get("/api/v1/study")).json();
    const studyB = await (await b.get("/api/v1/study?view=session")).json();
    expect(studyA.progress).toEqual({ closed: 4, total: 6 });
    expect(studyB.progress).toEqual({ closed: 5, total: 5 });
    expect(studyA.action.title).toBe("Сдать черновик проекта");
    const zero = studyA.items.find((item: { title: string }) => item.title === "Академическое письмо");
    const aPlan = `/api/v1/study/${zero.id}`;
    expect(await a.get(aPlan).then((response) => response.json())).toMatchObject({
      status: "awaiting", grades: expect.arrayContaining([expect.objectContaining({ value: 0, scale: "hundred" })]),
    });
    const data = studyA.items.find((item: { title: string }) => item.title === "Анализ данных");
    expect(await a.get(`/api/v1/study/${data.id}`).then((response) => response.json())).toMatchObject({
      status: "attention", deadlines: expect.arrayContaining([expect.objectContaining({ state: "overdue" }), expect.objectContaining({ state: "upcoming" })]),
      exams: [{ startsAt: "2026-11-24T07:00:00.000Z" }],
    });

    for (const [context, route, missing] of [
      [b, aLesson, `/api/v1/lessons/${unknown}`],
      [a, `/api/v1/lessons/${bDay.nearest.id}`, `/api/v1/lessons/${unknown}`],
      [b, aPlan, `/api/v1/study/${unknown}`],
      [a, `/api/v1/study/${studyB.items[0].id}`, `/api/v1/study/${unknown}`],
    ] as const) {
      const foreign = await context.get(route);
      const absent = await context.get(missing);
      expect(foreign.status()).toBe(404);
      expect(foreign.status()).toBe(absent.status());
      expect(await foreign.json()).toEqual(await absent.json());
      expect(foreign.headers()["cache-control"]).toBe(absent.headers()["cache-control"]);
    }

    const { token } = await (await a.get("/api/v1/csrf")).json();
    expect((await a.post("/api/v1/session/logout", { headers: { Origin: origin, "X-CSRF-Token": token } })).status()).toBe(204);
    expect((await a.get(aLesson)).status()).toBe(401);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("mobile navigation opens a moved class, its history and the original day", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/schedule?date=2026-11-18");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("link", { name: /Академическое письмо.*Перенесено/ }).click();
  await expect(page.getByRole("heading", { name: "Было / Стало" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История изменений" })).toBeVisible();
  await page.getByRole("link", { name: "К расписанию" }).click();
  await expect(page).toHaveURL(/date=2026-11-18/);
  await page.getByRole("link", { name: "Учёба", exact: true }).click();
  await expect(page.getByText("Закрыто 4 из 6")).toBeVisible();
  await page.getByRole("link", { name: /Академическое письмо/ }).click();
  await expect(page.getByText("0 / 100", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("switching weeks keeps the document, cabinet and previous schedule until the response", async ({ page }) => {
  await page.goto("/schedule?date=2026-11-17&view=week");
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const period = page.locator(".period-bar strong");
  await expect(period).toBeVisible();
  const previous = await period.innerText();
  const shell = await page.locator(".cabinet-header").elementHandle();
  const documentId = await page.evaluate(() => performance.timeOrigin);
  const next = page.getByRole("link", { name: "Следующий период" });
  const nextUrl = await next.getAttribute("href");
  let release = () => {};
  const pause = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/api/v1/lessons" && url.searchParams.get("date") === "2026-11-24", async (route) => {
    await pause;
    await route.continue();
  }, { times: 1 });
  try {
    await next.click();
    await expect(page).toHaveURL(nextUrl!);
    await expect(period).toHaveText(previous);
    expect(await shell?.evaluate((element) => element.isConnected)).toBe(true);
  } finally {
    release();
  }
  await expect(period).not.toHaveText(previous);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  await page.goBack();
  await expect(period).toHaveText(previous);
  await page.getByRole("link", { name: "Учёба", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Учёба" })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  expect(await shell?.evaluate((element) => element.isConnected)).toBe(true);
});
