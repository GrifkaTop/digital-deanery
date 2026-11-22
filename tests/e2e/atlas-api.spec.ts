import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";

const dotenv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const isolatedEnvPath = process.env.ATLAS_TEST_ENV_FILE;
const isolatedEnv = isolatedEnvPath && existsSync(isolatedEnvPath) ? parseEnv(readFileSync(isolatedEnvPath, "utf8")) : {};
const value = (name: string) => process.env[name] ?? isolatedEnv[name] ?? dotenv[name];
const baseURL = value("ATLAS_TEST_BASE_URL");
const databaseUrl = value("ATLAS_TEST_DATABASE_URL") ?? value("INTERFACE_TEST_DATABASE_URL");
const appOrigin = value("APP_ORIGIN") ?? "";
const configuredAcademicNow = value("DEMO_ACADEMIC_NOW");
const academicNow = configuredAcademicNow && /^https:\/\/localhost(?::[0-9]{1,5})?$/.test(appOrigin)
  ? new Date(configuredAcademicNow)
  : new Date();

test.skip(!baseURL || !databaseUrl, "Requires an explicitly configured isolated Atlas Compose stand (ATLAS_TEST_BASE_URL and ATLAS_TEST_DATABASE_URL).");

function assertIsolatedDatabase() {
  const target = new URL(databaseUrl!);
  for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
    const configured = value(name);
    if (!configured) continue;
    const primary = new URL(configured);
    if (target.hostname === primary.hostname && target.port === primary.port && target.pathname === primary.pathname) {
      throw new Error(`ATLAS_TEST_DATABASE_URL points at ${name}; refusing to run fixture mutations.`);
    }
  }
}

async function login(context: APIRequestContext, account: "A" | "B") {
  const csrf = await context.get("/api/v1/csrf");
  const { token } = await csrf.json();
  const response = await context.post("/api/v1/session/login", {
    headers: { Origin: baseURL!, "X-CSRF-Token": token },
    data: { login: value(`DEMO_${account}_LOGIN`), password: value(`DEMO_${account}_PASSWORD`) },
  });
  expect(response.status(), `login ${account}`).toBe(200);
}

async function csrf(context: APIRequestContext) {
  return (await context.get("/api/v1/csrf")).json().then(({ token }: { token: string }) => token);
}

function equivalentHiddenResponse(foreign: { status(): number; json(): Promise<unknown>; headers(): Record<string, string> }, missing: { status(): number; json(): Promise<unknown>; headers(): Record<string, string> }) {
  return Promise.all([foreign.json(), missing.json()]).then(([foreignBody, missingBody]) => {
    expect(foreign.status()).toBe(404);
    expect(missing.status()).toBe(404);
    expect(foreignBody).toEqual(missingBody);
    expect(foreign.headers()["cache-control"]).toBe(missing.headers()["cache-control"]);
  });
}

test("news and events use the same published, time, and group rules in lists and direct GETs", async () => {
  assertIsolatedDatabase();
  const pool = new Pool({ connectionString: databaseUrl });
  const a = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const tag = randomUUID();
  const ids = {
    events: Object.fromEntries(["public", "draft", "future", "aOnly", "bOnly"].map((key) => [key, randomUUID()])),
    news: Object.fromEntries(["public", "draft", "future", "aOnly", "bOnly"].map((key) => [key, randomUUID()])),
  } as { events: Record<string, string>; news: Record<string, string> };
  try {
    const { rows: accounts } = await pool.query(
      `SELECT a.login, s.group_id AS "groupId" FROM accounts a JOIN students s ON s.account_id=a.id
       WHERE a.login = ANY($1::text[])`,
      [[value("DEMO_A_LOGIN"), value("DEMO_B_LOGIN")]],
    );
    const groupA = accounts.find((row) => row.login === value("DEMO_A_LOGIN"))?.groupId;
    const groupB = accounts.find((row) => row.login === value("DEMO_B_LOGIN"))?.groupId;
    expect(groupA).toBeTruthy();
    expect(groupB).toBeTruthy();
    expect(groupA).not.toBe(groupB);

    const future = new Date(academicNow.getTime() + 10 * 60_000).toISOString();
    for (const [kind, table, audienceTable, idColumn] of [
      ["events", "extracurricular_events", "event_audiences", "event_id"],
      ["news", "news_posts", "news_audiences", "news_id"],
    ] as const) {
      for (const key of Object.keys(ids[kind])) {
        const publishedAt = key === "future" ? future : "2020-01-01T00:00:00.000Z";
        const status = key === "draft" ? "draft" : "published";
        if (kind === "events") {
          await pool.query(
            `INSERT INTO ${table}(id,title,starts_on,ends_on,kind,place,summary,body,participation,status,published_at)
             VALUES($1,$2,current_date,current_date,'test','Test','Summary','Body','Open',$3,$4)`,
            [ids[kind][key], `Atlas ${tag} ${key}`, status, status === "published" ? publishedAt : null],
          );
        } else {
          await pool.query(
            `INSERT INTO ${table}(id,title,summary,body,category,pinned,status,published_at,author)
             VALUES($1,$2,'Summary','Body','Test',false,$3,$4,'Synthetic test')`,
            [ids[kind][key], `Atlas ${tag} ${key}`, status, status === "published" ? publishedAt : null],
          );
        }
        if (key === "aOnly" || key === "bOnly") {
          await pool.query(`INSERT INTO ${audienceTable}(${idColumn},group_id) VALUES($1,$2)`, [ids[kind][key], key === "aOnly" ? groupA : groupB]);
        }
      }
    }

    await Promise.all([login(a, "A"), login(b, "B")]);
    const missingId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    for (const kind of ["events", "news"] as const) {
      const aListResponse = await a.get(`/api/v1/${kind}`);
      const bListResponse = await b.get(`/api/v1/${kind}`);
      expect(aListResponse.status()).toBe(200);
      expect(bListResponse.status()).toBe(200);
      expect(aListResponse.headers()["cache-control"]).toContain("no-store");
      const aList = await aListResponse.json();
      const bList = await bListResponse.json();
      const idsIn = (body: { items: { id: string }[] }) => body.items.map((item) => item.id);
      expect(idsIn(aList)).toContain(ids[kind].public);
      expect(idsIn(bList)).toContain(ids[kind].public);
      for (const hidden of ["draft", "future", "bOnly"]) expect(idsIn(aList)).not.toContain(ids[kind][hidden]);
      for (const hidden of ["draft", "future", "aOnly"]) expect(idsIn(bList)).not.toContain(ids[kind][hidden]);
      expect(idsIn(aList)).toContain(ids[kind].aOnly);
      expect(idsIn(bList)).toContain(ids[kind].bOnly);

      for (const [context, hiddenKeys] of [[a, ["draft", "future", "bOnly"]], [b, ["draft", "future", "aOnly"]]] as const) {
        for (const hiddenKey of hiddenKeys) {
          await equivalentHiddenResponse(
            await context.get(`/api/v1/${kind}/${ids[kind][hiddenKey]}`),
            await context.get(`/api/v1/${kind}/${missingId}`),
          );
        }
      }
    }
  } finally {
    await pool.query("DELETE FROM news_audiences WHERE news_id = ANY($1::uuid[])", [Object.values(ids.news)]).catch(() => {});
    await pool.query("DELETE FROM event_audiences WHERE event_id = ANY($1::uuid[])", [Object.values(ids.events)]).catch(() => {});
    await pool.query("DELETE FROM news_posts WHERE id = ANY($1::uuid[])", [Object.values(ids.news)]).catch(() => {});
    await pool.query("DELETE FROM extracurricular_events WHERE id = ANY($1::uuid[])", [Object.values(ids.events)]).catch(() => {});
    await Promise.all([a.dispose(), b.dispose(), pool.end()]);
  }
});

test("study, attendance, nullable scores, and assignments remain scoped to the signed-in student", async () => {
  assertIsolatedDatabase();
  const pool = new Pool({ connectionString: databaseUrl });
  const a = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
  let adjustedAttendance: { studentId: string; lessonId: string; publishedAt: Date } | undefined;
  try {
    await Promise.all([login(a, "A"), login(b, "B")]);
    const attendanceFixture = await pool.query(
      `SELECT p.id AS "planId", la.student_id AS "studentId", la.lesson_id AS "lessonId", la.published_at AS "publishedAt"
       FROM accounts ac JOIN students st ON st.account_id=ac.id
       JOIN study_plan_items p ON p.student_id=st.id
       JOIN disciplines d ON d.id=p.discipline_id AND d.group_id=st.group_id
       JOIN lessons l ON l.discipline_id=d.id
       JOIN LATERAL (SELECT r.starts_at,r.status FROM lesson_revisions r WHERE r.lesson_id=l.id AND r.published_at <= $2 ORDER BY r.version DESC LIMIT 1) lr ON true
       JOIN lesson_attendance la ON la.student_id=st.id AND la.lesson_id=l.id
       WHERE ac.login=$1 AND lr.starts_at < $2 AND lr.status <> 'cancelled'
       ORDER BY lr.starts_at,l.id LIMIT 1`,
      [value("DEMO_A_LOGIN"), academicNow],
    );
    const fixture = attendanceFixture.rows[0];
    if (!fixture) throw new Error("The isolated Atlas fixture needs one published past attendance row for account A.");
    adjustedAttendance = fixture;
    await pool.query("UPDATE lesson_attendance SET published_at=$3 WHERE student_id=$1 AND lesson_id=$2", [fixture.studentId, fixture.lessonId, new Date(academicNow.getTime() + 100 * 365 * 24 * 60 * 60_000)]);
    const [studyA, studyB, assignmentsA, assignmentsB] = await Promise.all([
      a.get("/api/v1/study").then((response) => response.json()),
      b.get("/api/v1/study").then((response) => response.json()),
      a.get("/api/v1/assignments").then((response) => response.json()),
      b.get("/api/v1/assignments").then((response) => response.json()),
    ]);
    const detailAResponse = await a.get(`/api/v1/study/${fixture.planId}`);
    expect(detailAResponse.status()).toBe(200);
    const detailA = await detailAResponse.json();
    expect(detailA.attendance.length).toBeGreaterThan(0);
    expect(detailA.attendance.some((row: { status: string | null }) => row.status === null)).toBe(true);

    const detailsA = await Promise.all(studyA.items.map((item: { id: string }) => a.get(`/api/v1/study/${item.id}`).then((response) => response.json())));
    const detailsB = await Promise.all(studyB.items.map((item: { id: string }) => b.get(`/api/v1/study/${item.id}`).then((response) => response.json())));
    expect(detailsA.some((detail: { scores: { semesterScore: number | null } | null }) => detail.scores?.semesterScore === 0)).toBe(true);
    expect(detailsB.some((detail: { scores: { semesterScore: number | null } | null }) => detail.scores?.semesterScore === null)).toBe(true);
    const assignmentA = assignmentsA.items.find((item: { id: string }) => item.id === "e0000000-0000-4000-8000-000000000001");
    const assignmentB = assignmentsB.items.find((item: { id: string }) => item.id === "e0000000-0000-4000-8000-000000000002");
    expect(assignmentA?.moduleId).toBeTruthy();
    expect(assignmentB?.moduleId).toBeTruthy();
    const moduleDetail = await a.get(`/api/v1/study/${assignmentA.planId}`).then((response) => response.json());
    expect(moduleDetail.modules.length).toBeGreaterThan(0);
    const noId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await equivalentHiddenResponse(await b.get(`/api/v1/study/${fixture.planId}`), await b.get(`/api/v1/study/${noId}`));
    await equivalentHiddenResponse(await b.get(`/api/v1/assignments/${assignmentA.id}`), await b.get(`/api/v1/assignments/${noId}`));
    await equivalentHiddenResponse(await a.get(`/api/v1/assignments/${assignmentB.id}`), await a.get(`/api/v1/assignments/${noId}`));
    expect((await a.get(`/api/v1/assignments/${assignmentA.id}`)).status()).toBe(200);
    expect((await b.get(`/api/v1/assignments/${assignmentB.id}`)).status()).toBe(200);
  } finally {
    if (adjustedAttendance) await pool.query("UPDATE lesson_attendance SET published_at=$3 WHERE student_id=$1 AND lesson_id=$2", [adjustedAttendance.studentId, adjustedAttendance.lessonId, adjustedAttendance.publishedAt]).catch(() => {});
    await Promise.all([a.dispose(), b.dispose(), pool.end()]);
  }
});

test("three concurrent bookings from separate sessions never exceed the two-booking limit", async () => {
  assertIsolatedDatabase();
  const pool = new Pool({ connectionString: databaseUrl });
  const tag = randomUUID();
  const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
  const [first, second] = await Promise.all([
    request.newContext({ baseURL, ignoreHTTPSErrors: true }),
    request.newContext({ baseURL, ignoreHTTPSErrors: true }),
  ]);
  let previousBookings: { sessionId: string; studentId: string; status: string; updatedAt: Date }[] = [];
  try {
    const student = await pool.query(
      `SELECT st.id FROM students st JOIN accounts a ON a.id=st.account_id WHERE a.login=$1`,
      [value("DEMO_A_LOGIN")],
    );
    const prior = await pool.query(
      `DELETE FROM sports_bookings b USING students st
       WHERE b.student_id=st.id AND st.id=$1 RETURNING b.session_id AS "sessionId",b.student_id AS "studentId",b.status,b.updated_at AS "updatedAt"`,
      [student.rows[0].id],
    );
    previousBookings = prior.rows;
    await pool.query(
      `INSERT INTO sports_sessions(id,kind,title,starts_at,ends_at,place,capacity,booking_open)
       SELECT x,'class',$2,now() + (i * interval '1 day'),now() + (i * interval '1 day') + interval '1 hour','Test gym',10,true
       FROM unnest($1::uuid[]) WITH ORDINALITY AS t(x,i)`,
      [sessionIds, `Atlas concurrency ${tag}`],
    );
    await Promise.all([login(first, "A"), login(second, "A")]);
    const [tokenA, tokenB] = await Promise.all([csrf(first), csrf(second)]);
    const responses = await Promise.all(sessionIds.map((id, index) => {
      const context = index % 2 === 0 ? first : second;
      const token = index % 2 === 0 ? tokenA : tokenB;
      return context.post(`/api/v1/sports/${id}/booking`, { headers: { Origin: baseURL!, "X-CSRF-Token": token } });
    }));
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 200, 409]);
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "active" }),
      expect.objectContaining({ code: "BOOKING_LIMIT" }),
    ]));
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count FROM sports_bookings b JOIN sports_sessions s ON s.id=b.session_id
       JOIN students st ON st.id=b.student_id JOIN accounts a ON a.id=st.account_id
       WHERE a.login=$1 AND s.title=$2 AND b.status='active'`,
      [value("DEMO_A_LOGIN"), `Atlas concurrency ${tag}`],
    );
    expect(rows[0].count).toBe(2);
  } finally {
    await pool.query("DELETE FROM sports_bookings WHERE session_id = ANY($1::uuid[])", [sessionIds]).catch(() => {});
    await pool.query("DELETE FROM sports_sessions WHERE id = ANY($1::uuid[])", [sessionIds]).catch(() => {});
    if (previousBookings.length) await pool.query(
      "INSERT INTO sports_bookings(session_id,student_id,status,updated_at) SELECT * FROM unnest($1::uuid[],$2::uuid[],$3::text[],$4::timestamptz[])",
      [previousBookings.map((row) => row.sessionId), previousBookings.map((row) => row.studentId), previousBookings.map((row) => row.status), previousBookings.map((row) => row.updatedAt)],
    ).catch(() => {});
    await Promise.all([first.dispose(), second.dispose(), pool.end()]);
  }
});
