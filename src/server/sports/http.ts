import "server-only";
import { visibilityNow } from "@/server/clock";
import { z } from "zod";
import { sportsList } from "@/contracts/sports";
import { checkCsrf, handle, HttpError, json, lockSession, requireActor } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { transaction } from "@/server/db/transaction";
import type { Actor } from "@/server/auth/service";

export async function healthPassport(actor: Actor) {
  const { rows } = await getPool().query<{ validUntil: string; admitted: boolean; medicalGroup: string | null }>(
    'SELECT valid_until::text AS "validUntil", admitted, medical_group AS "medicalGroup" FROM health_passports WHERE student_id=$1',
    [actor.id],
  );
  return rows[0] ?? null;
}

export async function sportsAttendance(actor: Actor, now: Date) {
  const { rows } = await getPool().query<{ title: string; startsAt: Date; attended: boolean }>(
    `SELECT s.title, s.starts_at AS "startsAt", a.attended
     FROM sports_attendance a JOIN sports_sessions s ON s.id=a.session_id
     WHERE a.student_id=$1 AND s.ends_at <= $2
     ORDER BY s.starts_at DESC, s.id DESC LIMIT 10`,
    [actor.id, now],
  );
  return rows;
}

export function sportsTermRows(actor: Actor, now: Date) {
  return getPool().query(`SELECT sm.id AS "semesterId", sm.label, sm.is_current AS "isCurrent",
      sm.starts_on::text AS "startsOn", sm.ends_on::text AS "endsOn",
      r.score::float8 AS score, r.result, r.target_attendance AS "targetAttendance", marks.attendance,
      r.minimum_points AS "minimumPoints", r.prior_semester_id AS "priorSemesterId",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.code,'title',n.title,'unit',n.unit,'direction',n.direction,'status',n.status,'result',n.result) ORDER BY n.position,n.code)
        FROM sports_norm_results n WHERE n.student_id=$1 AND n.semester_id=sm.id), '[]'::jsonb) AS norms
      FROM semesters sm
      LEFT JOIN sports_semester_results r ON r.semester_id=sm.id AND r.student_id=$1
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE a.attended)::int AS attendance, count(*) AS recorded
        FROM sports_attendance a JOIN sports_sessions ss ON ss.id=a.session_id
        WHERE a.student_id=$1 AND ss.ends_at <= $2
          AND (ss.starts_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN sm.starts_on AND sm.ends_on
      ) marks
      WHERE sm.is_current OR r.student_id IS NOT NULL OR marks.recorded > 0 OR EXISTS (
        SELECT FROM sports_bookings b JOIN sports_sessions ss ON ss.id=b.session_id
        WHERE b.student_id=$1 AND b.status='active' AND ss.ends_at <= $2
          AND (ss.starts_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN sm.starts_on AND sm.ends_on
      )
      ORDER BY sm.starts_on DESC, sm.id`, [actor.id, now]);
}

export const getSports = (request: Request) => handle(async () => {
  const actor = await requireActor();
  if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
  const now = visibilityNow();
  const [sessions, passport, results] = await Promise.all([
    getPool().query(`SELECT s.id, s.kind, s.title, s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.place,
      s.teacher_id AS "teacherId", t.full_name AS "teacherName", s.capacity, s.booking_open AS "bookingOpen", b.status AS booking, a.attended,
      (s.capacity - (SELECT count(*) FROM sports_bookings x WHERE x.session_id=s.id AND x.status='active'))::int AS available
      FROM sports_sessions s LEFT JOIN teachers t ON t.id=s.teacher_id LEFT JOIN sports_bookings b ON b.session_id=s.id AND b.student_id=$1
      LEFT JOIN sports_attendance a ON a.session_id=s.id AND a.student_id=$1 AND s.ends_at <= $2
      ORDER BY s.starts_at, s.id`, [actor.id, now]),
    healthPassport(actor),
    sportsTermRows(actor, now),
  ]);
  return json(sportsList.parse({ now, items: sessions.rows, passport, results: results.rows }));
});

export const changeBooking = (request: Request, id: string, action: "active" | "cancelled") => handle(async () => {
  const actor = await requireActor();
  await checkCsrf(request);
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
  await transaction(async client => {
    await lockSession(client, actor);
    await client.query("SELECT id FROM students WHERE id=$1 FOR UPDATE", [actor.id]);
    const session = await client.query("SELECT booking_open, starts_at FROM sports_sessions WHERE id=$1 FOR UPDATE", [id]);
    if (!session.rowCount) throw new HttpError(404, "NOT_FOUND");
    const previous = await client.query("SELECT status FROM sports_bookings WHERE session_id=$1 AND student_id=$2", [id, actor.id]);
    if (previous.rows[0]?.status === action || (action === "cancelled" && !previous.rowCount)) return;
    if (action === "active") {
      const now = visibilityNow();
      if (!session.rows[0].booking_open || session.rows[0].starts_at <= now) throw new HttpError(409, "BOOKING_CLOSED");
      const active = await client.query("SELECT count(*)::int AS count FROM sports_bookings b JOIN sports_sessions s ON s.id=b.session_id WHERE b.student_id=$1 AND b.status='active' AND s.starts_at > $2", [actor.id, now]);
      if (active.rows[0].count >= 2) throw new HttpError(409, "BOOKING_LIMIT");
      const seats = await client.query("SELECT s.capacity > count(b.student_id) AS available FROM sports_sessions s LEFT JOIN sports_bookings b ON b.session_id=s.id AND b.status='active' WHERE s.id=$1 GROUP BY s.capacity", [id]);
      if (!seats.rows[0].available) throw new HttpError(409, "FULL");
    }
    await client.query(`INSERT INTO sports_bookings(session_id,student_id,status,updated_at) VALUES($1,$2,$3,now())
      ON CONFLICT (session_id,student_id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`, [id, actor.id, action]);
  });
  return json({ status: action });
});
