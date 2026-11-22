import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";

const env = parseEnv(readFileSync(".env", "utf8"));
const origin = process.env.REQUESTS_TEST_ORIGIN ?? "https://localhost";
const base = "/api/v1/requests";
const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const aReady = "30000000-0000-4000-8000-000000000001";
const bReady = "30000000-0000-4000-8000-000000000002";
const bReply = "30000000-0000-4000-8000-000000000003";
test.use({ baseURL: origin });
test.skip(!process.env.REQUESTS_TEST_ORIGIN, "Run against a disposable stand with the request fixtures.");

async function csrf(context: APIRequestContext) {
  const response = await context.get("/api/v1/csrf");
  expect(response.status()).toBe(200);
  const { token } = await response.json();
  return { Origin: origin, "X-CSRF-Token": token };
}
async function login(context: APIRequestContext, account: "A" | "B") {
  const response = await context.post("/api/v1/session/login", {
    headers: await csrf(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}
async function sameMissing(context: APIRequestContext, id: string, suffix = "") {
  const [forbidden, absent] = await Promise.all([
    context.get(`${base}/${id}${suffix}`), context.get(`${base}/${missing}${suffix}`),
  ]);
  expect(forbidden.status()).toBe(404);
  expect(absent.status()).toBe(404);
  expect(await forbidden.json()).toEqual(await absent.json());
  expect(forbidden.headers()["cache-control"]).toBe(absent.headers()["cache-control"]);
}

test("private requests, stable retries, two worker instances and PDF attachments", async () => {
  test.setTimeout(110_000);
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const second = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await login(a, "A");
    await login(second, "A");
    await login(b, "B");
    await sameMissing(a, bReady);
    await sameMissing(b, aReady);
    await sameMissing(a, bReady, "/document");
    await sameMissing(b, aReady, "/document");
    await sameMissing(b, bReply, "/document");
    for (const [context, id] of [[a, aReady], [b, bReady]] as const) {
      const pdf = await context.get(`${base}/${id}/document`);
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-disposition"]).toMatch(/^attachment/);
      expect(pdf.headers()["cache-control"]).toBe("no-store, private");
      const bytes = await pdf.body();
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.toString("latin1")).toContain("/ToUnicode");
    }

    const input = { kind: "study_certificate", payload: { purpose: "on_request" } };
    expect((await a.post(base, { data: input })).status()).toBe(403);
    const key = crypto.randomUUID();
    const submit = async (context: APIRequestContext, data = input) => context.post(base, {
      headers: { ...await csrf(context), "Idempotency-Key": key }, data,
    });
    const responses = await Promise.all([submit(a), submit(second)]);
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 201]);
    const result = await responses[0].json();
    expect(await responses[1].json()).toEqual(result);
    expect((await submit(a, { ...input, payload: { purpose: "study_contest" } })).status()).toBe(409);
    await sameMissing(a, result.id, "/document");

    const clarification = { expectedVersion: 3, choice: "alternative_slot" };
    const beforeForeignClarification = await (await b.get(`${base}/${bReply}`)).json();
    const beforeForeignInbox = await (await b.get('/api/v1/inbox')).json();
    const foreign = await a.post(`${base}/${bReply}/clarification`, {
      headers: { ...await csrf(a), "Idempotency-Key": crypto.randomUUID() }, data: clarification,
    });
    expect(foreign.status()).toBe(404);
    expect(await (await b.get(`${base}/${bReply}`)).json()).toEqual(beforeForeignClarification);
    expect(await (await b.get('/api/v1/inbox')).json()).toEqual(beforeForeignInbox);
    const clarifyKey = crypto.randomUUID();
    const reply = async (data = clarification) => b.post(`${base}/${bReply}/clarification`, {
      headers: { ...await csrf(b), "Idempotency-Key": clarifyKey }, data,
    });
    expect((await reply()).status()).toBe(200);
    expect((await reply()).status()).toBe(200);
    expect((await reply({ ...clarification, choice: "keep_original" })).status()).toBe(409);

    expect((await a.post("/api/v1/session/logout", { headers: await csrf(a) })).status()).toBe(204);
    expect((await a.get(`${base}/${result.id}`)).status()).toBe(401);
    await login(a, "A");
    const detail = async (context: APIRequestContext, id: string) => (await context.get(`${base}/${id}`)).json();
    expect((await detail(a, result.id)).publicNo).toBe(result.publicNo);
    await expect.poll(async () => (await detail(b, bReply)).status, { timeout: 35_000 }).toBe("approved");
    await expect.poll(async () => (await detail(a, result.id)).status, { timeout: 70_000 }).toBe("ready");
    expect((await detail(a, result.id)).history.map((entry: { toStatus: string }) => entry.toStatus))
      .toEqual(["submitted", "in_progress", "ready"]);
    expect((await detail(b, bReply)).history.map((entry: { toStatus: string }) => entry.toStatus))
      .toEqual(["submitted", "in_progress", "needs_clarification", "in_progress", "approved"]);
    expect((await a.get(`${base}/${result.id}/document`)).status()).toBe(200);
    expect(await (await submit(a)).json()).toEqual(result);
    await sameMissing(b, result.id);
  } finally {
    await Promise.all([a.dispose(), second.dispose(), b.dispose()]);
  }
});

test("foreign and absent requests show the same page to either student", async ({ browser }) => {
  for (const [account, own, foreign] of [["A", aReady, bReady], ["B", bReady, aReady]] as const) {
    const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
    try {
      await login(context.request, account);
      const page = await context.newPage();
      await page.goto(`/requests/${own}`);
      await expect(page.getByRole("heading", { name: "История заявки" })).toBeVisible();
      for (const id of [foreign, missing]) {
        await page.goto(`/requests/${id}`);
        await expect(page.getByRole("status").filter({ hasText: "Страница недоступна" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "История заявки" })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
});

test("mobile certificate form recovers after the response is lost", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/requests/new?kind=study_certificate");
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Новая заявка" })).toBeVisible();
  await page.getByLabel("Назначение").selectOption("study_contest");
  let createdId: string | undefined;
  await page.route(`**${base}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const committed = await route.fetch({ headers: { ...await route.request().allHeaders(), origin } });
    expect(committed.status()).toBe(201);
    createdId = (await committed.json()).id;
    await route.abort();
  }, { times: 1 });
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Отправку не удалось подтвердить" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Повторить отправку" }).click();
  expect(createdId).toBeTruthy();
  await expect(page).toHaveURL(`/requests/${createdId}`);
  await expect(page.getByRole("heading", { name: "История заявки" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "История заявки" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("structured services register applications and issue private accrual certificates", async () => {
  test.setTimeout(110_000);
  const a = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    await Promise.all([login(a, "A"), login(b, "B")]);
    const catalog = await (await a.get("/api/v1/services")).json();
    expect(catalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scholarship_certificate", contractVersion: 2 }),
      expect.objectContaining({ code: "dormitory", contractVersion: 3, category: "Общежитие" }),
      expect.objectContaining({ code: "material_aid", category: "Финансы" }),
      expect.objectContaining({ code: "academic_leave", category: "Учёба" }),
      expect.objectContaining({ code: "travel_compensation", category: "Финансы" }),
    ]));
    expect(catalog.items).not.toContainEqual(expect.objectContaining({ code: "individual_schedule" }));
    const headers = new Map([[a, await csrf(a)], [b, await csrf(b)]]);
    const submit = async (context: APIRequestContext, data: object) => context.post(base, {
      headers: { ...headers.get(context), "Idempotency-Key": crypto.randomUUID() }, data,
    });
    const form = {
      kind: "scholarship_certificate",
      payload: { schemaVersion: 2, scholarshipKind: "academic", fromMonth: "2026-09", toMonth: "2026-10", purpose: "on_request" },
    };
    const pass = { kind: "campus_pass", payload: { schemaVersion: 2, action: "lost" } };
    const aStudy = await (await a.get("/api/v1/study")).json();
    const consultation = { kind: "consultation_reschedule", payload: {
      schemaVersion: 2, planId: aStudy.items[0].id, reason: "preparation", slot: "option_a",
    } };
    const [foreignPlan, missingPlan] = await Promise.all([
      submit(b, consultation), submit(b, { ...consultation, payload: { ...consultation.payload, planId: missing } }),
    ]);
    expect(foreignPlan.status()).toBe(404);
    expect(missingPlan.status()).toBe(404);
    expect(await foreignPlan.json()).toEqual(await missingPlan.json());
    const results = await Promise.all([submit(a, form), submit(b, form), submit(a, pass), submit(a, consultation)]);
    for (const result of results) expect(result.status()).toBe(201);
    const [own, missingAccrual, application, reschedule] = await Promise.all(results.map((result) => result.json()));
    const detail = async (context: APIRequestContext, id: string) => (await context.get(`${base}/${id}`)).json();
    expect((await detail(a, reschedule.id)).payload.discipline).toBe(aStudy.items[0].title);
    expect((await a.get(`${base}/${own.id}/document`)).status()).toBe(404);
    await Promise.all([
      expect.poll(async () => (await detail(a, own.id)).status, { timeout: 75_000 }).toBe("ready"),
      expect.poll(async () => (await detail(b, missingAccrual.id)).status, { timeout: 75_000 }).toBe("rejected"),
      expect.poll(async () => (await detail(a, application.id)).status, { timeout: 75_000 }).toBe("registered"),
    ]);
    expect((await detail(b, missingAccrual.id)).history.at(-1).reason).toContain("нет сведений о начислениях");
    expect((await detail(a, application.id)).payload).toEqual(pass.payload);
    const closed = await (await a.get(`${base}?filter=closed`)).json();
    expect(closed.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: application.id })]));
    const pdf = await a.get(`${base}/${own.id}/document`);
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()["content-disposition"]).toContain("scholarship-certificate.pdf");
    expect(pdf.headers()["cache-control"]).toBe("no-store, private");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await a.get(`${base}/${application.id}/document`)).status()).toBe(404);
    await sameMissing(b, own.id, "/document");
    expect((await a.post("/api/v1/session/logout", { headers: await csrf(a) })).status()).toBe(204);
    expect((await a.get(`${base}/${own.id}/document`)).status()).toBe(401);
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});

test("mobile catalogue and dormitory form show field errors and submitted details", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.setFixedTime(new Date("2026-11-17T06:00:00Z"));
  await login(page.request, "A");
  await page.goto("/requests/new");
  await expect(page.getByRole("heading", { name: "Справки" })).toBeVisible();
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: /Предоставление места в общежитии/ }).click();
  const start = page.getByLabel("Желаемая дата заселения");
  await start.fill("2026-11-16");
  await page.getByLabel("Основание обращения").selectOption("nonresident");
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(start).toBeFocused();
  await expect(start).toHaveAccessibleDescription("Дата должна быть не раньше сегодняшнего дня.");
  await start.fill("2026-11-25");
  await page.getByLabel(/Комментарий/).fill("Период участия в учебном обмене.");
  await expect(page.getByText("Период участия в учебном обмене.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Данные заявки" })).toBeVisible();
  await expect(page.getByText("25.11.2026")).toBeVisible();
  await expect(page.getByText("Период участия в учебном обмене.", { exact: true })).toBeVisible();
});

test("catalog metadata, service version and deactivation come from PostgreSQL", async ({ page }) => {
  const databaseUrl = process.env.ATLAS_TEST_DATABASE_URL;
  test.skip(!databaseUrl, "Use a disposable catalog database via ATLAS_TEST_DATABASE_URL.");
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  expect(localHosts).toContain(new URL(databaseUrl!).hostname);
  expect(localHosts).toContain(new URL(origin).hostname);
  await login(page.request, "A");
  const pool = new Pool({ connectionString: databaseUrl });
  const kind = "campus_pass";
  const title = "Синтетическая услуга пропуска";
  const description = "Текст описания из тестового каталога";
  const category = "Синтетическая категория услуг";
  const browserPath = "/prototype#requests/new?kind=" + kind;
  const key = crypto.randomUUID();
  const data = { kind, payload: { schemaVersion: 2, action: "lost" } };
  const submit = async (operationKey = key) => page.request.post(base, {
    headers: { ...await csrf(page.request), "Idempotency-Key": operationKey }, data,
  });
  type CatalogRow = { title: string; description: string; category: string; active: boolean; contract_version: number };
  let original: CatalogRow | undefined;
  try {
    const snapshot = await pool.query<CatalogRow>(
      "SELECT title, description, category, active, contract_version FROM service_catalog WHERE code=$1", [kind],
    );
    original = snapshot.rows[0];
    expect(original).toBeDefined();
    await pool.query(
      "UPDATE service_catalog SET title=$2, description=$3, category=$4, active=true, contract_version=2 WHERE code=$1",
      [kind, title, description, category],
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/prototype#requests/new");
    await expect(page.getByRole("heading", { name: category })).toBeVisible();
    const service = page.getByRole("link", { name: new RegExp(title) });
    await expect(service).toContainText(description);
    await service.click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    const created = await submit();
    expect(created.status()).toBe(201);
    const result = await created.json();

    await pool.query("UPDATE service_catalog SET contract_version=3 WHERE code=$1", [kind]);
    const stale = await submit(crypto.randomUUID());
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toEqual({ code: "SERVICE_VERSION_CONFLICT" });
    await page.getByLabel("Цель обращения").selectOption("lost");
    const send = page.getByRole("button", { name: "Отправить заявку" });
    await send.click();
    await expect(page.getByRole("alert").filter({ hasText: "Форма услуги обновилась." })).toBeVisible();
    await expect(send).toBeDisabled();
    await page.reload();
    await expect(page.getByText("Форма услуги обновляется.", { exact: true })).toBeVisible();
    await expect(send).toHaveCount(0);

    await pool.query("UPDATE service_catalog SET active=false WHERE code=$1", [kind]);
    const blocked = await submit(crypto.randomUUID());
    expect(blocked.status()).toBe(409);
    expect(await blocked.json()).toEqual({ code: "SERVICE_UNAVAILABLE" });
    const replay = await submit();
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(result);
    await page.goto("/prototype#requests/new");
    await expect(page.getByRole("heading", { name: "Справки" })).toBeVisible();
    await expect(service).toHaveCount(0);
    await page.goto(browserPath);
    await expect(page.getByRole("status").filter({ hasText: "Выбранная услуга сейчас недоступна" })).toBeVisible();
    await expect(send).toHaveCount(0);
  } finally {
    try {
      if (original) await pool.query(
        "UPDATE service_catalog SET title=$2, description=$3, category=$4, active=$5, contract_version=$6 WHERE code=$1",
        [kind, original.title, original.description, original.category, original.active, original.contract_version],
      );
    } finally {
      await pool.end();
    }
  }
});
