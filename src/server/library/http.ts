import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { libraryBookDetail, libraryCatalog, libraryReading, libraryBookings } from "@/contracts/library";
import { checkCsrf, handle, HttpError, json, lockSession, requireActor } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { transaction } from "@/server/db/transaction";

function bookId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
}
function noQuery(request: Request) {
  if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
}
export const getLibrary = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => k !== "subjectId") || params.getAll("subjectId").length > 1 || (params.has("subjectId") && !z.uuid().safeParse(params.get("subjectId")).success)) throw new HttpError(422, "INVALID_FIELDS");
  const [subjects, books] = await Promise.all([
    getPool().query(`SELECT s.id, s.title FROM library_subjects s WHERE EXISTS (SELECT 1 FROM library_book_subjects bs JOIN library_books b ON b.id=bs.book_id WHERE bs.subject_id=s.id AND b.published) ORDER BY s.title, s.id`),
    getPool().query(`SELECT b.id,b.title,b.author,b.description,(b.content IS NOT NULL) AS online,
      GREATEST(0,b.copies-(SELECT count(*) FROM library_bookings x WHERE x.book_id=b.id AND x.active))::int AS available,
      EXISTS(SELECT 1 FROM library_bookings x WHERE x.book_id=b.id AND x.student_id=$1 AND x.active) AS booked,
      COALESCE((SELECT json_agg(json_build_object('id',s.id,'title',s.title) ORDER BY s.title,s.id) FROM library_book_subjects bs JOIN library_subjects s ON s.id=bs.subject_id WHERE bs.book_id=b.id),'[]'::json) AS subjects
      FROM library_books b WHERE b.published AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM library_book_subjects bs WHERE bs.book_id=b.id AND bs.subject_id=$2)) ORDER BY b.title,b.id`, [actor.id, params.get("subjectId")]),
  ]);
  return json(libraryCatalog.parse({ subjects: subjects.rows, items: books.rows }));
});
export const readBook = (request: Request, id: string) => handle(async () => {
  await requireActor(); noQuery(request); bookId(id);
  const result = await getPool().query(`SELECT id,title,author,content FROM library_books WHERE id=$1 AND published AND content IS NOT NULL`, [id]);
  if (!result.rowCount) throw new HttpError(404, "NOT_FOUND");
  return json(libraryReading.parse(result.rows[0]));
});
export const getLibraryBook = (request: Request, id: string) => handle(async () => {
  const actor = await requireActor(); noQuery(request); bookId(id);
  const result = await getPool().query(`SELECT b.id,b.title,b.author,b.description,b.content,(b.content IS NOT NULL) AS online,
    GREATEST(0,b.copies-(SELECT count(*) FROM library_bookings x WHERE x.book_id=b.id AND x.active))::int AS available,
    EXISTS(SELECT 1 FROM library_bookings x WHERE x.book_id=b.id AND x.student_id=$2 AND x.active) AS booked,
    COALESCE((SELECT json_agg(json_build_object('id',s.id,'title',s.title) ORDER BY s.title,s.id) FROM library_book_subjects bs JOIN library_subjects s ON s.id=bs.subject_id WHERE bs.book_id=b.id),'[]'::json) AS subjects
    FROM library_books b WHERE b.id=$1 AND b.published`, [id, actor.id]);
  if (!result.rowCount) throw new HttpError(404, "NOT_FOUND");
  return json(libraryBookDetail.parse(result.rows[0]));
});
export const changeLibraryBooking = (request: Request, id: string, active: boolean) => handle(async () => {
  const actor = await requireActor(); await checkCsrf(request); noQuery(request); bookId(id);
  await transaction(async client => {
    await lockSession(client, actor);
    const book = await client.query(`SELECT copies FROM library_books WHERE id=$1 AND published FOR UPDATE`, [id]);
    if (!book.rowCount) throw new HttpError(404, "NOT_FOUND");
    const previous = await client.query(`SELECT active FROM library_bookings WHERE book_id=$1 AND student_id=$2`, [id, actor.id]);
    if (previous.rows[0]?.active === active || (!active && !previous.rowCount)) return;
    if (active) {
      const count = await client.query(`SELECT count(*)::int AS count FROM library_bookings WHERE book_id=$1 AND active`, [id]);
      if (count.rows[0].count >= book.rows[0].copies) throw new HttpError(409, "FULL");
    }
    await client.query(`INSERT INTO library_bookings(book_id,student_id,active) VALUES($1,$2,$3) ON CONFLICT(book_id,student_id) DO UPDATE SET active=EXCLUDED.active,updated_at=now()`, [id, actor.id, active]);
  });
  return json({ booked: active });
});

export const downloadBook = (request: Request, id: string) => handle(async () => {
  await requireActor(); noQuery(request); bookId(id);
  const result = await getPool().query(`SELECT id,title,author,content FROM library_books WHERE id=$1 AND published AND content IS NOT NULL`, [id]);
  if (!result.rowCount) throw new HttpError(404, "NOT_FOUND");
  const book = libraryReading.parse(result.rows[0]);
  return new NextResponse(`${book.title}\n${book.author}\n\n${book.content}\n`, { headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="atlas-book-${id}.txt"; filename*=UTF-8''${encodeURIComponent(book.title + ".txt")}`,
    "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
  } });
});
export const getLibraryBookings = (request: Request) => handle(async () => {
  const actor = await requireActor(); noQuery(request);
  const result = await getPool().query(`SELECT b.id,b.title,b.author,(b.content IS NOT NULL) AS online,
    x.active,x.updated_at::text AS "updatedAt" FROM library_bookings x JOIN library_books b ON b.id=x.book_id
    WHERE x.student_id=$1 AND b.published ORDER BY x.active DESC,x.updated_at DESC,b.id`, [actor.id]);
  return json(libraryBookings.parse({ items: result.rows }));
});
