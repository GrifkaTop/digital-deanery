import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const origin = process.env.ATLAS_UI_ORIGIN;
test.skip(!origin, "Requires an isolated, seeded Atlas stand.");

test("Atlas request confirmation links to the persisted private request", async ({ browser }) => {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const a = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true, viewport: { width: 360, height: 800 } });
  const b = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });

  async function login(context: BrowserContext, account: "A" | "B") {
    const csrf = await (await context.request.get("/api/v1/csrf")).json();
    const response = await context.request.post("/api/v1/session/login", {
      headers: { Origin: origin!, "X-CSRF-Token": csrf.token },
      data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
    });
    expect(response.status()).toBe(200);
  }

  try {
    await login(a, "A");
    const page = await a.newPage();
    await page.goto("/prototype#requests/new?kind=study_certificate");
    await expect(page.getByRole("heading", { name: "Справка об обучении" })).toBeVisible();
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByText("Заполните поле.")).toBeVisible();
    await expect(page.getByLabel("Назначение")).toBeFocused();
    await page.getByLabel("Назначение").selectOption("study_contest");
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByText("Услуга: Справка об обучении")).toBeVisible();
    await page.getByRole("button", { name: "Отправить заявку" }).click();

    const link = page.getByRole("link", { name: "Открыть заявку" });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^#requests\/[0-9a-f-]+$/i);
    const id = href.split("/").pop()!;
    await link.click();
    await expect(page.getByRole("heading", { name: "История заявки" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    const csrf = await (await a.request.get("/api/v1/csrf")).json();
    const logout = await a.request.post("/api/v1/session/logout", {
      headers: { Origin: origin!, "X-CSRF-Token": csrf.token },
    });
    expect(logout.status()).toBe(204);
    expect((await a.request.get(`/api/v1/requests/${id}`)).status()).toBe(401);
    await login(a, "A");
    expect((await a.request.get(`/api/v1/requests/${id}`)).status()).toBe(200);
    await login(b, "B");
    expect((await b.request.get(`/api/v1/requests/${id}`)).status()).toBe(404);
  } finally {
    await a.close();
    await b.close();
  }
});
