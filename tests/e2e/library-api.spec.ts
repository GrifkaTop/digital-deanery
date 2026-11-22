import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { Pool } from "pg";
import { libraryBookDetail, libraryCatalog, libraryReading } from "../../src/contracts/library";

function readEnv(path: string | undefined) {
  return path && existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

const localEnv = readEnv(".env");
const standEnv = readEnv(process.env.ATLAS_TEST_ENV_FILE);
const value = (name: string) => process.env[name] ?? standEnv[name] ?? localEnv[name];
const baseURL = value("ATLAS_TEST_BASE_URL");
const databaseURL = value("ATLAS_TEST_DATABASE_URL");
const catalogPath = "/api/v1/library";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

test.skip(!baseURL || !databaseURL, "Requires an isolated Atlas stand with ATLAS_TEST_BASE_URL and ATLAS_TEST_DATABASE_URL.");

function assertIsolatedStand(stand: URL, database: URL) {
  if (stand.protocol !== "https:" || !loopbackHosts.has(stand.hostname) || !loopbackHosts.has(database.hostname)) {
    throw new Error("Library API tests require loopback access to both HTTPS and PostgreSQL.");
  }
}

async function csrfHeaders(context: APIRequestContext, origin: string) {
  const response = await context.get("/api/v1/csrf");
  expect(response.status()).toBe(200);
  const { token } = await response.json();
  return { Origin: origin, "X-CSRF-Token": token };
}

async function login(context: APIRequestContext, origin: string, account: "A" | "B") {
  const loginName = value(`DEMO_${account}_LOGIN`);
  const password = value(`DEMO_${account}_PASSWORD`);
  if (!loginName || !password) throw new Error(`Missing credentials for demo account ${account}.`);
  const response = await context.post("/api/v1/session/login", {
    headers: await csrfHeaders(context, origin),
    data: { login: loginName, password },
  });
  expect(response.status(), `login ${account}`).toBe(200);
}

function expectPrivate(response: APIResponse, status: number) {
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store, private");
}

test("library filters published books, reads online text and preserves a private booking across sessions", async () => {
  const stand = new URL(baseURL!);
  assertIsolatedStand(stand, new URL(databaseURL!));
  const pool = new Pool({ connectionString: databaseURL });
  const [a, b] = await Promise.all([request.newContext({ baseURL, ignoreHTTPSErrors: true }), request.newContext({ baseURL, ignoreHTTPSErrors: true })]);
  const [subject, otherSubject, online, printOnly, draft, missing] = Array.from({ length: 6 }, () => randomUUID());
  const fixtureBooks = [online, printOnly, draft];
  const fixtureSubjects = [subject, otherSubject];
  const text = "Синтетический текст для проверки читалки.";
  const detailPath = `${catalogPath}/${online}`;
  const readingPath = `${detailPath}/read`;
  const bookingPath = `${detailPath}/booking`;
  const filteredPath = `${catalogPath}?subjectId=${subject}`;

  async function expectBookState(context: APIRequestContext, booked: boolean, available: number) {
    const [detailResponse, catalogResponse] = await Promise.all([context.get(detailPath), context.get(filteredPath)]);
    expectPrivate(detailResponse, 200);
    expectPrivate(catalogResponse, 200);
    expect(libraryBookDetail.parse(await detailResponse.json())).toMatchObject({ id: online, booked, available });
    expect(libraryCatalog.parse(await catalogResponse.json()).items).toEqual([expect.objectContaining({ id: online, booked, available })]);
  }

  try {
    await pool.query("INSERT INTO library_subjects(id,title) VALUES ($1,$2),($3,$4)", [subject, `Тестовый предмет ${subject}`, otherSubject, `Тестовый предмет ${otherSubject}`]);
    await pool.query(
      `INSERT INTO library_books(id,title,author,description,content,copies,published) VALUES
       ($1,'Синтетическое онлайн-издание','Учебная редакция','Тестовое описание',$4,1,true),
       ($2,'Синтетическое печатное издание','Учебная редакция','Тестовое описание',NULL,0,true),
       ($3,'Синтетический черновик издания','Учебная редакция','Тестовое описание',$4,1,false)`,
      [online, printOnly, draft, text],
    );
    await pool.query("INSERT INTO library_book_subjects(book_id,subject_id) VALUES ($1,$4),($2,$5),($3,$4)", [online, printOnly, draft, subject, otherSubject]);

    expectPrivate(await a.get(filteredPath), 401);
    await Promise.all([login(a, stand.origin, "A"), login(b, stand.origin, "B")]);
    const catalogResponse = await a.get(catalogPath);
    expectPrivate(catalogResponse, 200);
    const catalog = libraryCatalog.parse(await catalogResponse.json());
    expect(catalog.subjects.map(({ id }) => id)).toEqual(expect.arrayContaining(fixtureSubjects));
    expect(catalog.items.map(({ id }) => id)).toEqual(expect.arrayContaining([online, printOnly]));
    expect(catalog.items.map(({ id }) => id)).not.toContain(draft);
    await expectBookState(a, false, 1);

    const reading = await a.get(readingPath);
    expectPrivate(reading, 200);
    expect(libraryReading.parse(await reading.json())).toMatchObject({ id: online, content: text });
    const missingBook = await a.get(`${catalogPath}/${missing}/read`);
    expectPrivate(missingBook, 404);
    for (const id of [printOnly, draft]) {
      const unavailable = await a.get(`${catalogPath}/${id}/read`);
      expectPrivate(unavailable, 404);
      expect(await unavailable.json()).toEqual(await missingBook.json());
    }

    expectPrivate(await a.post(bookingPath), 403);
    const [headersA, headersB] = await Promise.all([csrfHeaders(a, stand.origin), csrfHeaders(b, stand.origin)]);
    const [bookingA, bookingB] = await Promise.all([a.post(bookingPath, { headers: headersA }), b.post(bookingPath, { headers: headersB })]);
    expect([bookingA.status(), bookingB.status()].sort()).toEqual([200, 409]);
    const aWon = bookingA.status() === 200;
    const [winner, winnerAccount, winnerHeaders] = aWon ? [a, "A", headersA] as const : [b, "B", headersB] as const;
    const [other, otherHeaders] = aWon ? [b, headersB] as const : [a, headersA] as const;
    const [booked, full] = aWon ? [bookingA, bookingB] : [bookingB, bookingA];
    expectPrivate(booked, 200);
    expect(await booked.json()).toEqual({ booked: true });
    expectPrivate(full, 409);
    expect(await full.json()).toEqual({ code: "FULL" });

    const repeated = await winner.post(bookingPath, { headers: winnerHeaders });
    expectPrivate(repeated, 200);
    expect(await repeated.json()).toEqual({ booked: true });
    expectPrivate(await other.delete(bookingPath), 403);
    const emptyCancel = await other.delete(bookingPath, { headers: otherHeaders });
    expectPrivate(emptyCancel, 200);
    expect(await emptyCancel.json()).toEqual({ booked: false });
    await Promise.all([expectBookState(winner, true, 0), expectBookState(other, false, 0)]);

    const logout = await winner.post("/api/v1/session/logout", { headers: winnerHeaders });
    expect(logout.status()).toBe(204);
    for (const path of [filteredPath, detailPath, readingPath]) expectPrivate(await winner.get(path), 401);
    expectPrivate(await winner.post(bookingPath), 401);
    expectPrivate(await winner.delete(bookingPath), 401);
    await login(winner, stand.origin, winnerAccount);
    await expectBookState(winner, true, 0);

    const cancellationHeaders = await csrfHeaders(winner, stand.origin);
    for (let attempt = 0; attempt < 2; attempt++) {
      const cancelled = await winner.delete(bookingPath, { headers: cancellationHeaders });
      expectPrivate(cancelled, 200);
      expect(await cancelled.json()).toEqual({ booked: false });
    }
    await Promise.all([expectBookState(winner, false, 1), expectBookState(other, false, 1)]);
  } finally {
    try {
      await pool.query("DELETE FROM library_bookings WHERE book_id = ANY($1::uuid[])", [fixtureBooks]);
      await pool.query("DELETE FROM library_book_subjects WHERE book_id = ANY($1::uuid[])", [fixtureBooks]);
      await pool.query("DELETE FROM library_books WHERE id = ANY($1::uuid[])", [fixtureBooks]);
      await pool.query("DELETE FROM library_subjects WHERE id = ANY($1::uuid[])", [fixtureSubjects]);
    } finally {
      await Promise.all([a.dispose(), b.dispose(), pool.end()]);
    }
  }
});
