import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), csrf: vi.fn(), lock: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/service", async original => ({ ...await original<typeof import("@/server/auth/service")>(), requireActor: mocks.actor, checkCsrf: mocks.csrf, lockSession: mocks.lock }));
vi.mock("@/server/db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("@/server/db/transaction", () => ({ transaction: mocks.transaction }));
import { changeLibraryBooking, getLibrary, readBook, downloadBook, getLibraryBookings } from "../src/server/library/http";
import { HttpError } from "../src/server/auth/service";
const id = "f2000000-0000-4000-8000-000000000001";
const subject = "f1000000-0000-4000-8000-000000000001";
const request = (path: string) => new Request(`https://example.test/api/v1/library${path}`);
beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({ id: "student-a" }); mocks.transaction.mockImplementation(async fn => fn({ query: mocks.query })); });
it("filters the catalog using the authenticated student and validates parameters", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
  const response = await getLibrary(request(`?subjectId=${subject}`));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect(mocks.query.mock.calls[1][1]).toEqual(["student-a", subject]);
  expect((await getLibrary(request("?subjectId=wrong"))).status).toBe(422);
});
it("requires a session and hides unavailable reading content", async () => {
  mocks.actor.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED"));
  expect((await readBook(request(`/${id}/read`), id)).status).toBe(401);
  mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
  expect((await readBook(request(`/${id}/read`), id)).status).toBe(404);
});
it("locks the book before testing capacity and rejects a full book", async () => {
  mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ copies: 1 }] }).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
  expect((await changeLibraryBooking(request(`/${id}/booking`), id, true)).status).toBe(409);
  expect(mocks.csrf).toHaveBeenCalled(); expect(mocks.lock).toHaveBeenCalled();
  expect(mocks.query.mock.calls[0][0]).toContain("FOR UPDATE");
  expect(mocks.query.mock.calls[1][1]).toEqual([id, "student-a"]);
});
it("cancelling a missing booking is idempotent", async () => {
  mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ copies: 1 }] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
  expect(await (await changeLibraryBooking(request(`/${id}/booking`), id, false)).json()).toEqual({ booked: false });
  expect(mocks.query).toHaveBeenCalledTimes(2);
});

it("downloads only published electronic content as a private UTF-8 attachment", async () => {
  mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id, title: "Учебная книга", author: "Редакция", content: "Синтетический текст" }] });
  const response = await downloadBook(request(`/${id}/download`), id);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect(await response.text()).toContain("Синтетический текст");
  mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
  expect((await downloadBook(request(`/${id}/download`), id)).status).toBe(404);
  mocks.actor.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED"));
  expect((await downloadBook(request(`/${id}/download`), id)).status).toBe(401);
});
it("reads booking history only for the verified actor", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] });
  const response = await getLibraryBookings(request("/bookings"));
  expect(await response.json()).toEqual({ items: [] });
  expect(mocks.query.mock.calls[0][1]).toEqual(["student-a"]);
  expect(mocks.query.mock.calls[0][0]).toContain("x.student_id=$1");
  expect(response.headers.get("cache-control")).toBe("no-store, private");
});
