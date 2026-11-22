import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { documentManifest } from "../../src/contracts/assistant-files";

const env = parseEnv(readFileSync(".env", "utf8"));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";
const origin = process.env.PLAYWRIGHT_ORIGIN ?? baseURL;
const endpoint = "/api/v1/assistant/ask";

async function headers(context: APIRequestContext) {
  const { token } = await (await context.get("/api/v1/csrf")).json();
  return { Origin: origin, "X-CSRF-Token": token };
}

async function signIn(context: APIRequestContext, account: "A" | "B") {
  const response = await context.post("/api/v1/session/login", {
    headers: await headers(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}

test("assistant cites shared documents and rejects former personal commands", async ({ playwright, request }) => {
  const calendar = "/api/v1/assistant/documents/academic-calendar-2026-27";
  const question = { question: "Когда зимняя сессия и каникулы?" };
  expect((await request.post(endpoint, { data: question })).status()).toBe(401);
  expect((await request.get(calendar)).status()).toBe(401);
  const a = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await signIn(a, "A");
    await signIn(b, "B");
    const ask = async (context: APIRequestContext, data: unknown, requestOrigin = origin) => context.post(endpoint, {
      headers: { ...await headers(context), Origin: requestOrigin }, data,
    });
    expect((await a.post(endpoint, { headers: { Origin: origin }, data: question })).status()).toBe(403);
    expect((await ask(a, question, "https://other.example")).status()).toBe(403);
    expect((await ask(a, { ...question, actor: "B" })).status()).toBe(422);
    expect((await ask(a, { command: "next_lesson", args: {} })).status()).toBe(422);
    const answer = await ask(a, question);
    expect(answer.headers()["cache-control"]).toBe("no-store, private");
    const result = await answer.json();
    expect(result).toMatchObject({ kind: "answer", cards: [
      { title: "Зимние каникулы", link: { href: expect.stringContaining("#section-2") } },
    ] });
    expect(result.text).toContain("Зимняя сессия");
    expect(result.text).toContain("Зимние каникулы");
    expect(await ask(b, question).then((response) => response.json())).toEqual(result);
    expect(await ask(a, { question: "Когда стипендия за декабрь 2026?" }).then((response) => response.json()))
      .toMatchObject({ kind: "answer", cards: [{ text: expect.stringContaining("24 декабря 2026"),
        link: { href: expect.stringMatching(/^\/today\/assistant\/documents\/file-scholarship-payments-2026-27-[a-f0-9]{64}#section-1$/u) } }] });
    const first = await ask(a, { question: "Когда стипендия?" }).then((response) => response.json());
    expect(first.context).toEqual({ topics: ["scholarship_payment"] });
    expect(await ask(a, { question: "А за декабрь?", context: first.context }).then((response) => response.json()))
      .toMatchObject({ kind: "answer", cards: [{ text: expect.stringContaining("24 декабря 2026") }] });
    expect(await ask(a, { question: "А за декабрь?" }).then((response) => response.json()))
      .toMatchObject({ kind: "clarify", cards: [] });
    expect(await ask(a, { question: "Когда зимние каникулы в 2028 году?" }).then((response) => response.json()))
      .toMatchObject({ kind: "empty", cards: [] });
    expect(await ask(a, { question: "Где ближайшая пара?" }).then((response) => response.json()))
      .toMatchObject({ kind: "answer", widgets: expect.arrayContaining([expect.objectContaining({ type: "lesson", href: expect.stringContaining("/schedule/") })]) });
    const publication = await a.get(calendar);
    expect(publication.status()).toBe(200);
    expect(publication.headers()["cache-control"]).toBe("no-store, private");
    expect((await publication.json()).sections).toEqual(expect.arrayContaining([
      { id: "2", title: result.cards[0].title, text: result.cards[0].text },
    ]));
    expect((await a.get(`${calendar}-absent`)).status()).toBe(404);
    expect((await b.post("/api/v1/session/logout", { headers: await headers(b) })).status()).toBe(204);
    expect((await b.get(calendar)).status()).toBe(401);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("serves published document PDFs to a student and closes access after logout", async ({ playwright }) => {
  const ids = ["library-service-rules", "study-certificates", "consultation-rescheduling"];
  const context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await signIn(context, "A");
    const publishedLinks: string[] = [];
    for (const id of ids) {
      const root = `documents/generated/${id}`;
      const manifest = documentManifest.parse(JSON.parse(readFileSync(`${root}/manifest.json`, "utf8")));
      const revision = createHash("sha256").update("deanery-pdf-v2").update("\0").update(JSON.stringify(manifest)).update("\0")
        .update(readFileSync(`${root}/original.pdf`)).digest("hex");
      const documentResponse = await context.get(`/api/v1/assistant/documents/file-${id}-${revision}`);
      expect(documentResponse.status(), id).toBe(200);
      expect(documentResponse.headers()["cache-control"]).toBe("no-store, private");
      const document = await documentResponse.json();
      expect(document).toMatchObject({ title: manifest.title, number: manifest.number, pdfHref: `/api/v1/assistant/documents/file-${id}-${revision}/pdf` });
      expect(document.sections.length, id).toBeGreaterThan(0);
      const pdfResponse = await context.get(document.pdfHref);
      expect(pdfResponse.status(), id).toBe(200);
      expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
      expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
      publishedLinks.push(document.pdfHref);
    }
    // The payment order can be replaced independently of the generated packet.
    const answer = await context.post(endpoint, { headers: await headers(context), data: { question: "Когда стипендия за декабрь 2026?" } });
    const payment = await answer.json();
    const paymentId = payment.cards[0].link.href.match(/\/documents\/([^#]+)/u)?.[1];
    expect(paymentId).toMatch(/^file-scholarship-payments-2026-27-[a-f0-9]{64}$/u);
    const paymentDocument = await context.get(`/api/v1/assistant/documents/${paymentId}`);
    expect(paymentDocument.status()).toBe(200);
    expect((await paymentDocument.json()).sections.length).toBeGreaterThan(0);
    expect(publishedLinks).toHaveLength(3);
    expect((await context.post("/api/v1/session/logout", { headers: await headers(context) })).status()).toBe(204);
    expect((await context.get(publishedLinks[0])).status()).toBe(401);
  } finally {
    await context.dispose();
  }
});

test("rejects a non-active document revision and its PDF", async ({ playwright }) => {
  const context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await signIn(context, "A");
    const path = `/api/v1/assistant/documents/file-scholarship-payments-2026-27-${"0".repeat(64)}`;
    expect((await context.get(path)).status()).toBe(404);
    expect((await context.get(`${path}/pdf`)).status()).toBe(404);
    expect((await context.post("/api/v1/session/logout", { headers: await headers(context) })).status()).toBe(204);
    expect((await context.get(path)).status()).toBe(401);
  } finally {
    await context.dispose();
  }
});

test("mobile assistant returns to Today and exposes the same answer on the desktop panel", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page.request, "A");
  await page.goto("/today");
  const entry = page.getByRole("link", { name: "Спросить помощника" });
  await entry.click();
  await expect(page).toHaveURL(/\/today\/assistant$/);
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await page.getByLabel("Ваш вопрос").fill("Как назначают академическую стипендию?");
  await page.getByLabel("Ваш вопрос").press("Enter");
  const scholarshipAnswer = page.locator(".chat-answer-text").filter({
    hasText: "Государственная академическая стипендия из федерального бюджета назначается",
  });
  await expect(scholarshipAnswer).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /Положение об академической стипендии/ }).click();
  await expect(page.getByRole("heading", { name: "Положение об академической стипендии" })).toBeVisible();
  await expect(page.locator("#section-2")).toBeFocused();
  await page.getByRole("link", { name: "К помощнику" }).click();
  await expect(scholarshipAnswer).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Ваш вопрос").fill("Когда стипендия?");
  await page.getByLabel("Ваш вопрос").press("Enter");
  await expect(page.getByText(/25 ноября 2026/)).toBeVisible();
  await page.getByLabel("Ваш вопрос").fill("А за декабрь?");
  await page.getByLabel("Ваш вопрос").press("Enter");
  await expect(page.getByText(/24 декабря 2026/)).toBeVisible();
  await expect(page.getByText("Когда стипендия?", { exact: true })).toBeVisible();
  const received = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route(`**${endpoint}`, async (route) => {
    received.resolve();
    await release.promise;
    await route.fulfill({ json: { kind: "answer", text: "Запоздалый ответ", cards: [] } }).catch(() => {});
  }, { times: 1 });
  await page.getByLabel("Ваш вопрос").fill("Когда стипендия?");
  await page.getByRole("button", { name: "Спросить" }).click();
  await received.promise;
  await page.getByRole("button", { name: "Отменить" }).click();
  release.resolve();
  await expect(page.getByText("Запоздалый ответ")).toBeHidden();
  await expect(scholarshipAnswer).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.getByRole("link", { name: "Назад" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(entry).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 800 });
  const assistant = page.getByRole("region", { name: "Вопросы помощнику" });
  await expect(entry).toBeHidden();
  await expect(assistant.getByText(/Государственная академическая стипендия из федерального бюджета назначается/)).toBeVisible();
  await page.getByRole("button", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  await assistant.getByRole("link", { name: /Положение об академической стипендии/ }).click();
  await expect(page.getByRole("heading", { name: "Положение об академической стипендии" })).toBeVisible();
});
