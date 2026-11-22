import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { eventItem, newsList } from "../../src/contracts/publications";
import { sportsList } from "../../src/contracts/sports";

const origin = process.env.ATLAS_UI_ORIGIN;
test.skip(!origin, "Requires an isolated, seeded Atlas stand.");
test.use({ baseURL: origin, viewport: { width: 360, height: 800 } });

async function signIn(client: APIRequestContext, account: "A" | "B") {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const csrf = await client.get("/api/v1/csrf");
  expect(csrf.status()).toBe(200);
  const { token } = await csrf.json();
  const login = await client.post("/api/v1/session/login", {
    headers: { Origin: origin!, "X-CSRF-Token": token },
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(login.status()).toBe(200);
}

test("news and event details use their own API and opening news updates its read state", async ({ page }) => {
  await signIn(page.request, "A");
  const response = await page.request.get("/api/v1/news");
  expect(response.status()).toBe(200);
  const { items } = newsList.parse(await response.json());
  const news = items.find(item => item.eventId !== null);
  if (!news) throw new Error("Seed a visible news item linked to a visible event.");

  await page.goto("/prototype#news");
  const newsLink = page.locator('#hm-archive-' + news.id);
  const readStatus = newsLink.locator(".hm-news-status");
  await expect(newsLink).toHaveAccessibleName(news.title);
  await expect(readStatus).toHaveAttribute("data-read", "false");

  const newsDetail = page.waitForResponse(response => response.url().endsWith("/api/v1/news/" + news.id));
  await newsLink.click();
  expect((await newsDetail).status()).toBe(200);
  await expect(page.getByRole("heading", { name: news.title, exact: true })).toBeVisible();
  await expect(page.getByText(news.author, { exact: true })).toBeVisible();

  const eventDetail = page.waitForResponse(response => response.url().endsWith("/api/v1/events/" + news.eventId));
  await page.getByRole("link", { name: "Открыть событие" }).click();
  const eventResponse = await eventDetail;
  expect(eventResponse.status()).toBe(200);
  const event = eventItem.parse(await eventResponse.json());
  await expect(page.getByRole("heading", { name: event.title, exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: news.title, exact: true })).toBeVisible();
  await page.goBack();
  await expect(newsLink).toBeFocused();
  await expect(readStatus).toHaveAttribute("data-read", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test("sports changes the selected semester and keeps personal attendance separate", async ({ page }) => {
  await signIn(page.request, "A");
  const a = sportsList.parse(await (await page.request.get("/api/v1/sports")).json());
  const current = a.results.find(semester => semester.isCurrent)!;
  const archive = a.results.find(semester => semester.label === "Осенний семестр 2025/26")!;
  const session = a.items.find(item => item.title === "Тренировка по общей подготовке")!;
  expect(session.attended).toBe(true);
  expect(current.attendance).toBeGreaterThan(0);
  expect(archive.attendance).toBeGreaterThan(0);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/prototype#sports");
  const semester = page.getByRole("combobox", { name: "Семестр" });
  await expect(semester).toHaveValue(current.semesterId);
  const progress = page.getByRole("region", { name: "Условия зачёта" });
  await expect(progress.getByText("Итог по семестру")).toBeVisible();
  await expect(progress.locator(".ss-pass-criteria dd").filter({ hasText: String(current.attendance) }).first()).toBeVisible();
  await semester.selectOption(archive.semesterId);
  await expect(progress.locator(".ss-pass-criteria dd").filter({ hasText: String(archive.attendance) }).first()).toBeVisible();
  expect(a.items.find(item => item.title === "Отработка по физкультуре")?.attended).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", "light");
  await expect(semester).toHaveValue(archive.semesterId);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);

  const other = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await signIn(other, "B");
    const b = sportsList.parse(await (await other.get("/api/v1/sports")).json());
    expect(b.items.find(item => item.id === session.id)?.attended).toBe(false);
    expect(b.results.some(semester => semester.semesterId === archive.semesterId)).toBe(false);
  } finally {
    await other.dispose();
  }
});
