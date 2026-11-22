import "server-only";
import type { Actor } from "@/server/auth/service";
import { HttpError } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { addDays, dateInMoscow, mondayOf } from "@/contracts/calendar";
import { atlasSharedScheduleGroup, lessonResponse, scheduleResponse, todayLesson } from "@/contracts/academics";

const revisionFields = `r.version, r.starts_at AS "startsAt", r.ends_at AS "endsAt",
  r.room, r.building, r.format, r.teacher_name AS teacher, r.kind, r.status, r.reason, r.published_at AS "publishedAt",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'fullName', t.full_name) ORDER BY t.full_name, t.id)
    FROM lesson_teachers lt JOIN teachers t ON t.id=lt.teacher_id WHERE lt.lesson_id=r.lesson_id AND lt.version=r.version), '[]'::jsonb) AS teachers`;
const previousRoomFields = `
  CASE WHEN previous.version IS NOT NULL
    AND (previous.room, previous.building) IS DISTINCT FROM (r.room, r.building)
    THEN jsonb_build_object('room', previous.room, 'building', previous.building)
    ELSE NULL END AS "previousRoom"`;

function previousRoomJoin(clock: "$2" | "$3") {
  return `LEFT JOIN LATERAL (
    SELECT earlier.version, earlier.room, earlier.building FROM lesson_revisions earlier
    WHERE earlier.lesson_id = r.lesson_id AND earlier.version < r.version AND earlier.published_at <= ${clock}
    ORDER BY earlier.version DESC LIMIT 1
  ) previous ON true`;
}

const currentLessons = `
  SELECT l.id, d.title, g.code AS "group", l.original_starts_at AS "originalStartsAt", ${revisionFields}, ${previousRoomFields}
  FROM disciplines d JOIN lessons l ON l.discipline_id = d.id
  JOIN groups g ON g.id = d.group_id
  JOIN LATERAL (
    SELECT * FROM lesson_revisions
    WHERE lesson_id = l.id AND published_at <= $2
    ORDER BY version DESC LIMIT 1
  ) r ON true
  ${previousRoomJoin("$2")}
  WHERE d.group_id = $1
`;

async function attachAssignments(actor: Actor, items: Record<string, unknown>[], now: Date) {
  if (!items.length) return items;
  const { rows } = await getPool().query(`SELECT la.lesson_id AS "lessonId", a.id, a.title, a.kind, a.number
    FROM lesson_assignments la JOIN lessons l ON l.id=la.lesson_id
    JOIN assignments a ON a.id=la.assignment_id AND a.discipline_id=l.discipline_id
    JOIN study_plan_items p ON p.discipline_id=a.discipline_id AND p.student_id=$1
    WHERE la.lesson_id=ANY($3::uuid[]) AND a.published_at <= $4 AND (a.student_id=$1 OR a.group_id=$2)
    ORDER BY a.title, a.id`, [actor.id, actor.group_id, items.map(item => item.id), now]);
  return items.map(item => ({ ...item, assignments: rows.filter(row => row.lessonId === item.id)
    .map(({ id, title, kind, number }) => ({ id, title, kind, number })) }));
}

async function listScheduleRules(groupId: string, monday: string) {
  const { rows } = await getPool().query(`
    SELECT sr.id, d.title, sr.weekday, sr.start_minutes AS "startMinutes",
      sr.end_minutes AS "endMinutes", sr.recurrence
    FROM schedule_rules sr
    JOIN disciplines d ON d.id = sr.discipline_id
    JOIN semesters s ON s.id = d.semester_id
    CROSS JOIN LATERAL (SELECT $2::date + (sr.weekday::integer - 1) AS occurrence) day
    WHERE d.group_id = $1
      AND day.occurrence BETWEEN sr.starts_on AND sr.ends_on
      AND day.occurrence BETWEEN s.starts_on AND s.ends_on
      AND (sr.recurrence = 'weekly' OR sr.recurrence =
        CASE WHEN (($2::date - date_trunc('week', s.starts_on::timestamp)::date) / 7) % 2 = 0
          THEN 'numerator' ELSE 'denominator' END)
    ORDER BY sr.weekday, sr.start_minutes, d.title, sr.id
  `, [groupId, monday]);
  return rows;
}

async function listGroupLessons(
  groupId: string, date: string, view: "day" | "week", now: Date,
  { actor, includeRules = false }: { actor?: Actor; includeRules?: boolean } = {},
) {
  const start = view === "week" ? mondayOf(date) : date;
  const end = addDays(start, view === "week" ? 7 : 1);
  const { rows: items } = await getPool().query(`
    WITH current AS (${currentLessons}), bounds AS (
      SELECT $3::date::timestamp AT TIME ZONE 'Europe/Moscow' AS lo,
             $4::date::timestamp AT TIME ZONE 'Europe/Moscow' AS hi
    )
    SELECT current.* FROM current CROSS JOIN bounds
    WHERE ("startsAt" >= lo AND "startsAt" < hi)
       OR ("originalStartsAt" >= lo AND "originalStartsAt" < hi)
    ORDER BY "startsAt", id
  `, [groupId, now, start, end]);

  const nearest = view === "day" && items.length === 0
    ? (await getPool().query(`
        WITH current AS (${currentLessons})
        SELECT * FROM current WHERE status <> 'cancelled'
          AND "startsAt" >= ($3::date::timestamp AT TIME ZONE 'Europe/Moscow')
        ORDER BY "startsAt", id LIMIT 1
      `, [groupId, now, end])).rows[0] ?? null
    : null;
  const semester = await getPool().query(`SELECT s.starts_on::text AS "startsOn" FROM semesters s
    WHERE $2::date BETWEEN s.starts_on AND s.ends_on AND EXISTS (
      SELECT FROM disciplines d WHERE d.semester_id=s.id AND d.group_id=$1)
    ORDER BY s.starts_on DESC, s.id LIMIT 1`, [groupId, date]);
  const epoch = (day: string) => Date.parse(`${day}T00:00:00Z`);
  const number = semester.rowCount ? Math.floor((epoch(mondayOf(date)) - epoch(mondayOf(semester.rows[0].startsOn))) / 604800000) + 1 : null;
  const academicWeek = number ? { number, parity: number % 2 ? "numerator" : "denominator" } : null;
  const [scheduledItems, rules] = await Promise.all([
    actor ? attachAssignments(actor, items, now) : items,
    includeRules ? listScheduleRules(groupId, mondayOf(date)) : undefined,
  ]);
  return scheduleResponse.parse({
    today: dateInMoscow(now), date, start, end, academicWeek, items: scheduledItems, nearest, rules,
  });
}

export async function listLessons(
  actor: Actor, date: string, view: "day" | "week", now: Date,
  { includeRules = false }: { includeRules?: boolean } = {},
) {
  const schedule = await listGroupLessons(actor.group_id, date, view, now, { actor, includeRules });
  if (!includeRules) return schedule;
  const { rows: teacherDirectory } = await getPool().query(`
    SELECT DISTINCT t.id, t.full_name AS "fullName"
    FROM teachers t JOIN lesson_teachers lt ON lt.teacher_id = t.id
    JOIN lesson_revisions r ON r.lesson_id=lt.lesson_id AND r.version=lt.version
    JOIN lessons l ON l.id=lt.lesson_id JOIN disciplines d ON d.id=l.discipline_id
    WHERE r.published_at <= $3 AND d.group_id IN ($1,$2)
    ORDER BY "fullName", t.id
  `, [actor.group_id, atlasSharedScheduleGroup.id, now]);
  return scheduleResponse.parse({ ...schedule, teacherDirectory });
}

export function listAtlasSharedLessons(date: string, view: "day" | "week", now: Date) {
  return listGroupLessons(atlasSharedScheduleGroup.id, date, view, now);
}

export async function listTeacherLessons(actor: Actor, teacherId: string, date: string, view: "day" | "week", now: Date) {
  const { rows: [teacher] } = await getPool().query(`
    SELECT t.id, t.full_name AS "fullName" FROM teachers t WHERE t.id=$1 AND EXISTS (
      SELECT FROM lesson_teachers lt JOIN lessons l ON l.id=lt.lesson_id JOIN disciplines d ON d.id=l.discipline_id
      JOIN lesson_revisions r ON r.lesson_id=lt.lesson_id AND r.version=lt.version
      WHERE lt.teacher_id=t.id AND d.group_id IN ($2,$3) AND r.published_at <= $4
    )
  `, [teacherId, actor.group_id, atlasSharedScheduleGroup.id, now]);
  if (!teacher) throw new HttpError(404, "NOT_FOUND");
  const [own, shared] = await Promise.all([
    listGroupLessons(actor.group_id, date, view, now, { actor }),
    listAtlasSharedLessons(date, view, now),
  ]);
  const distinct = new Map([...own.items, ...shared.items].map(item => [item.id, item]));
  const items = [...distinct.values()].filter(item => item.teachers?.some(person => person.id === teacherId))
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt) || first.id.localeCompare(second.id));
  return scheduleResponse.parse({ ...own, items, nearest: null, teacher });
}

export async function lessonDetail(actor: Actor, id: string, now: Date) {
  const { rows } = await getPool().query(`
    SELECT l.id, d.title, g.code AS "group", l.original_starts_at AS "originalStartsAt", ${revisionFields}, ${previousRoomFields}
    FROM lessons l JOIN disciplines d ON d.id = l.discipline_id
    JOIN groups g ON g.id = d.group_id
    JOIN lesson_revisions r ON r.lesson_id = l.id AND r.published_at <= $3
    ${previousRoomJoin("$3")}
    WHERE l.id = $1 AND d.group_id = $2 ORDER BY r.version DESC
  `, [id, actor.group_id, now]);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND");
  const [current] = await attachAssignments(actor, [rows[0]], now);
  return lessonResponse.parse({ ...current, history: rows });
}

export async function lessonToday(actor: Actor, now: Date) {
  const date = dateInMoscow(now);
  const { rows } = await getPool().query(`
    WITH current AS (${currentLessons})
    SELECT
      (SELECT to_jsonb(c) FROM current c WHERE status <> 'cancelled' AND "endsAt" > $2
         ORDER BY "startsAt", id LIMIT 1) AS nearest,
      (SELECT to_jsonb(c) FROM current c WHERE status <> 'cancelled' AND "startsAt" >= $2
         AND ("startsAt" AT TIME ZONE 'Europe/Moscow')::date = $3::date
         ORDER BY "startsAt", id LIMIT 1) AS upcoming_today,
      EXISTS (SELECT FROM current WHERE status <> 'cancelled'
        AND ("startsAt" AT TIME ZONE 'Europe/Moscow')::date = $3::date) AS has_lessons_today,
      (SELECT id FROM current WHERE status <> 'planned'
          AND (($2::timestamptz AT TIME ZONE 'Europe/Moscow')::date =
                ("startsAt" AT TIME ZONE 'Europe/Moscow')::date
            OR ($2::timestamptz AT TIME ZONE 'Europe/Moscow')::date =
                ("originalStartsAt" AT TIME ZONE 'Europe/Moscow')::date)
         ORDER BY "publishedAt" DESC, id LIMIT 1) AS change_id
  `, [actor.group_id, now, date]);
  const { nearest, upcoming_today: upcoming, has_lessons_today: hasLessonsToday, change_id: changeId } = rows[0];
  // PostgreSQL serializes timestamptz inside JSON using an offset. Parse through Date for the API.
  const normalize = (item: Record<string, string> | null) => item && {
    ...item, startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt),
    originalStartsAt: new Date(item.originalStartsAt), publishedAt: new Date(item.publishedAt),
  };
  const change = changeId && changeId !== upcoming?.id ? await lessonDetail(actor, changeId, now) : null;
  return todayLesson.parse({ date, nearest: normalize(nearest), upcomingToday: normalize(upcoming), hasLessonsToday, change });
}
