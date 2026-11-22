import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { dateInMoscow } from "../../src/contracts/calendar";
import { deadlinesResponse, disciplineResponse, scheduleResponse } from "../../src/contracts/academics";

function envFile(path: string | undefined) {
  return path && existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

const local = envFile(".env");
const isolated = envFile(process.env.ATLAS_TEST_ENV_FILE);
const value = (name: string) => process.env[name] ?? isolated[name] ?? local[name];
const baseURL = value("ATLAS_TEST_BASE_URL");
const databaseURL = value("ATLAS_TEST_DATABASE_URL") ?? value("INTERFACE_TEST_DATABASE_URL");

function assertIsolatedDatabase() {
  const target = new URL(databaseURL!);
  for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
    const configured = value(name);
    if (!configured) continue;
    const primary = new URL(configured);
    if (target.hostname === primary.hostname && target.port === primary.port && target.pathname === primary.pathname) {
      throw new Error(`Test database coincides with ${name}`);
    }
  }
}

async function login(context: APIRequestContext, account: "A" | "B") {
  const token = (await (await context.get("/api/v1/csrf")).json()).token;
  const response = await context.post("/api/v1/session/login", {
    headers: { Origin: new URL(baseURL!).origin, "X-CSRF-Token": token },
    data: { login: value(`DEMO_${account}_LOGIN`), password: value(`DEMO_${account}_PASSWORD`) },
  });
  expect(response.status()).toBe(200);
}

test("Atlas uses schedule rules, teacher records and the complete personal deadline list", async ({ page }) => {
  test.skip(!baseURL || !databaseURL, "Requires an isolated Atlas database and app.");
  assertIsolatedDatabase();
  await page.setViewportSize({ width: 360, height: 800 });
  const pool = new Pool({ connectionString: databaseURL });
  const a = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const ids: Record<"academic" | "request" | "completed", string> = {
    academic: randomUUID(), request: randomUUID(), completed: randomUUID(),
  };

  try {
    expect((await a.get("/api/v1/deadlines")).status()).toBe(401);
    await Promise.all([login(a, "A"), login(b, "B")]);
    const week = "/api/v1/lessons?date=2026-11-17&view=week";
    const [scheduleA, scheduleB] = await Promise.all([a, b].map(async context =>
      scheduleResponse.parse(await (await context.get(week)).json())));
    const ruleA = "a1000000-0000-4000-8000-000000000001";
    const ruleB = "a1000000-0000-4000-8000-000000000002";
    expect(scheduleA.rules?.map(item => item.id)).toContain(ruleA);
    expect(scheduleA.rules?.map(item => item.id)).not.toContain(ruleB);
    expect(scheduleB.rules?.map(item => item.id)).toContain(ruleB);
    const replacement = scheduleA.items.find(item => item.status === "replaced" && item.teacher === "Арина Макетова");
    expect(replacement?.teachers).toContainEqual({
      id: "d0000000-0000-4000-8000-000000000003", fullName: "Арина Макетова",
    });
    expect(scheduleA.items.map(item => item.id)).not.toContain(ruleA);

    const { rows: [owner] } = await pool.query(`
      SELECT st.id, st.group_id AS "groupId", p.id AS "planId", d.id AS "disciplineId", req.id AS "requestId"
      FROM students st JOIN accounts ac ON ac.id = st.account_id
      JOIN study_plan_items p ON p.student_id = st.id
      JOIN disciplines d ON d.id = p.discipline_id
      JOIN schedule_rules sr ON sr.discipline_id = d.id AND sr.id = $2
      JOIN semesters se ON se.id = d.semester_id AND se.is_current
      JOIN requests req ON req.student_id = st.id
      WHERE ac.login = $1 ORDER BY req.id LIMIT 1
    `, [value("DEMO_A_LOGIN"), ruleA]);
    expect(owner).toBeTruthy();
    const discipline = disciplineResponse.parse(await (await a.get(`/api/v1/study/${owner.planId}`)).json());
    expect(discipline.teachers).toEqual(expect.arrayContaining([expect.objectContaining({ fullName: "Лира Маячная" })]));
    expect((await b.get(`/api/v1/study/${owner.planId}`)).status()).toBe(404);

    const baseline = await a.get("/api/v1/deadlines");
    const clock = new Date(baseline.headers()["x-academic-now"]);
    const dueAt = new Date(clock.getTime() + 14 * 86400000);
    const publishedAt = new Date(clock.getTime() - 86400000);
    await pool.query(`
      INSERT INTO deadlines (id, group_id, discipline_id, title, due_at, required, published_at)
      VALUES ($1, $3, $4, 'Дальний учебный срок', $5, true, $6),
        ($2, $3, $4, 'Выполненный учебный срок', $5, true, $6)
    `, [ids.academic, ids.completed, owner.groupId, owner.disciplineId, dueAt, publishedAt]);
    await pool.query(`
      INSERT INTO deadlines (id, student_id, request_id, title, due_at, required, published_at)
      VALUES ($1, $2, $3, 'Личный срок заявки', $4, true, $5)
    `, [ids.request, owner.id, owner.requestId, dueAt, publishedAt]);
    await pool.query(`
      INSERT INTO deadline_completions (deadline_id, student_id, completed_at) VALUES ($1, $2, $3)
    `, [ids.completed, owner.id, publishedAt]);

    const response = await a.get("/api/v1/deadlines");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store, private");
    const deadlines = deadlinesResponse.parse(await response.json());
    expect(deadlines.today).toBe(dateInMoscow(response.headers()["x-academic-now"]));
    expect(deadlines.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ids.academic, subjectTitle: discipline.title, target: { kind: "discipline", id: owner.planId } }),
      expect.objectContaining({ id: ids.request, subjectTitle: null, target: { kind: "request", id: owner.requestId } }),
    ]));
    expect(deadlines.items.map(item => item.id)).not.toContain(ids.completed);
    const foreign = deadlinesResponse.parse(await (await b.get("/api/v1/deadlines")).json());
    expect(foreign.items.some(item => Object.values(ids).includes(item.id))).toBe(false);

    await page.context().addCookies((await a.storageState()).cookies);
    await page.goto(`${baseURL}/prototype#deadlines`);
    await expect(page.getByRole("link", { name: "Личный срок заявки" })).toHaveAttribute("href", `#requests/${owner.requestId}`);
    await expect(page.getByRole("link", { name: "Дальний учебный срок" })).toBeVisible();
    await expect(page.getByText("Выполненный учебный срок")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  } finally {
    await pool.query("DELETE FROM deadline_completions WHERE deadline_id = $1", [ids.completed]);
    await pool.query("DELETE FROM deadlines WHERE id = ANY($1::uuid[])", [Object.values(ids)]);
    await Promise.all([a.dispose(), b.dispose(), pool.end()]);
  }
});
