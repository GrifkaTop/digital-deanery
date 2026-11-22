import { expect, test, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";

async function headers(context: BrowserContext) {
  const response = await context.request.get("/api/v1/csrf");
  expect(response.status()).toBe(200);
  const { token } = await response.json();
  return { Origin: origin, "X-CSRF-Token": token };
}

async function login(context: BrowserContext, account: "A" | "B") {
  const response = await context.request.post("/api/v1/session/login", {
    headers: await headers(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}

test("both profiles open their own deadline work and cannot access the other profile", async ({ browser }) => {
  const a = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true, viewport: { width: 360, height: 850 } });
  const b = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true, viewport: { width: 360, height: 850 } });
  try {
    await login(a, "A");
    await login(b, "B");
    const ids: string[] = [];
    for (const context of [a, b]) {
      const response = await context.request.get("/api/v1/deadlines");
      expect(response.status()).toBe(200);
      const data = await response.json();
      const work = data.items.find((item: { target: { kind: string } }) => item.target.kind === "assignment");
      expect(work).toBeTruthy();
      ids.push(work.target.id);
      const page = await context.newPage();
      await page.goto("/prototype#deadlines");
      const link = page.locator(`#deadline-link-${work.id}`);
      await expect(link).toBeVisible();
      const detail = page.waitForResponse(result => new URL(result.url()).pathname === `/api/v1/assignments/${work.target.id}`);
      await link.click();
      expect((await detail).status()).toBe(200);
      await expect(page).toHaveURL(url => url.hash.split("?")[0] === `#work/${work.target.id}`);
      await page.getByRole("link", { name: "Назад", exact: true }).click();
      await expect(page).toHaveURL(/#deadlines$/);
      await expect(link).toBeFocused();
    }
    expect(ids[0]).not.toBe(ids[1]);
    for (const [context, own, foreign] of [[a, ids[0], ids[1]], [b, ids[1], ids[0]]] as const) {
      expect((await context.request.get(`/api/v1/assignments/${own}`)).status()).toBe(200);
      const other = await context.request.get(`/api/v1/assignments/${foreign}`);
      const missing = await context.request.get("/api/v1/assignments/ffffffff-ffff-4fff-8fff-ffffffffffff");
      expect(other.status()).toBe(404);
      expect(await other.json()).toEqual(await missing.json());
      expect((await context.request.post("/api/v1/session/logout", { headers: await headers(context) })).status()).toBe(204);
      expect((await context.request.get(`/api/v1/assignments/${own}`)).status()).toBe(401);
    }
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});
