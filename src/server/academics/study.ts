import "server-only";
import { HttpError, type Actor } from "@/server/auth/service";
import { visibleAcademicDeadlines, visibleDeadlineTargets } from "./deadlines";
import { getPool } from "@/server/db";
import { disciplineResponse, studyCardsResponse, studyResponse, todayDeadline, todayStudy } from "@/contracts/academics";

import { dateInMoscow, mondayOf } from "@/contracts/calendar";
import { listPublishedAssignments } from "@/server/assignments/http";
import { sportsTermRows } from "@/server/sports/http";

const planItems = `
  SELECT p.id, d.title, d.assessment, d.semester_id AS "semesterId",
    CASE
      WHEN EXISTS (SELECT FROM grades g WHERE g.plan_item_id = p.id AND g.published_at <= $3
          AND g.kind IN ('final', 'credit') AND g.outcome = 'pass') THEN 'closed'
      WHEN EXISTS (SELECT FROM grades g WHERE g.plan_item_id = p.id AND g.published_at <= $3
          AND g.kind IN ('final', 'credit') AND g.outcome = 'fail')
        OR EXISTS (SELECT FROM visible_deadlines dl WHERE dl."planId" = p.id AND dl.required AND dl.state = 'overdue')
        THEN 'attention'
      ELSE 'awaiting'
    END AS status,
    EXISTS (SELECT FROM grades g WHERE g.plan_item_id = p.id AND g.published_at <= $3) AS "hasGrades"
  FROM study_plan_items p JOIN disciplines d ON d.id = p.discipline_id
  WHERE p.student_id = $1
    AND (d.group_id = $2 OR NOT EXISTS (
      SELECT FROM semesters s WHERE s.id = d.semester_id AND s.is_current
    ))
`;
const visibleExams = `
  SELECT e.id, p.id AS "planId", d.title, e.kind, e.starts_at AS "startsAt", e.room, e.building, e.format,
    CASE WHEN adm.status IS NULL THEN NULL ELSE jsonb_build_object('status', adm.status, 'reason', adm.reason) END AS admission,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'fullName', t.full_name) ORDER BY t.full_name, t.id)
      FROM exam_teachers et JOIN teachers t ON t.id=et.teacher_id WHERE et.exam_id=e.id), '[]'::jsonb) AS teachers
  FROM study_plan_items p JOIN disciplines d ON d.id = p.discipline_id
  JOIN exam_events e ON e.discipline_id = d.id
  LEFT JOIN exam_admissions adm ON adm.exam_id=e.id AND adm.student_id=$1
  WHERE p.student_id = $1 AND d.group_id = $2 AND e.published_at <= $3
`;

function args(actor: Actor, now: Date) {
  return [actor.id, actor.group_id, now];
}

async function semestersFor(actor: Actor) {
  const { rows } = await getPool().query<{ id: string; label: string; isCurrent: boolean }>(`
    SELECT s.id, s.label, s.is_current AS "isCurrent" FROM semesters s
    WHERE s.is_current OR EXISTS (
      SELECT FROM study_plan_items p JOIN disciplines d ON d.id = p.discipline_id
      WHERE p.student_id = $1 AND d.semester_id = s.id
    ) ORDER BY s.is_current DESC, s.starts_on DESC, s.id
  `, [actor.id]);
  return rows;
}

async function nextDeadline(actor: Actor, now: Date, semester?: string) {
  const scoped = semester ? "AND d.semester_id = $4" : "";
  const { rows } = await getPool().query(`
    SELECT * FROM (${visibleAcademicDeadlines} ${scoped}) dl
    WHERE dl.required AND dl.state <> 'completed'
    ORDER BY (dl.state = 'upcoming') DESC,
      CASE WHEN dl.state = 'upcoming' THEN dl."dueAt" END ASC,
      CASE WHEN dl.state = 'overdue' THEN dl."dueAt" END DESC, dl.id
    LIMIT 1
  `, semester ? [...args(actor, now), semester] : args(actor, now));
  return rows[0] ?? null;
}

export async function studyList(actor: Actor, requested: string | undefined, now: Date) {
  const semesters = await semestersFor(actor);
  if (requested && !semesters.some((item) => item.id === requested)) throw new HttpError(404, "NOT_FOUND");
  const semesterId = requested ?? semesters[0]?.id ?? null;
  if (!semesterId) return studyResponse.parse({
    semesterId, semesters, progress: { closed: 0, total: 0 }, items: [], exams: [], action: null,
  });
  const values = [...args(actor, now), semesterId];
  const [plan, exams, action] = await Promise.all([
    getPool().query(`
      WITH visible_deadlines AS (${visibleAcademicDeadlines})
      ${planItems} AND d.semester_id = $4 ORDER BY d.title, p.id
    `, values),
    getPool().query(`${visibleExams} AND d.semester_id = $4 ORDER BY e.starts_at, e.id`, values),
    nextDeadline(actor, now, semesterId),
  ]);
  const progress = { closed: plan.rows.filter((row) => row.status === "closed").length, total: plan.rows.length };
  return studyResponse.parse({ semesterId, semesters, progress, items: plan.rows, exams: exams.rows, action });
}

export async function disciplineDetail(actor: Actor, id: string, now: Date) {
  const values = [...args(actor, now), id];
  const { rows } = await getPool().query(`
    WITH visible_deadlines AS (${visibleAcademicDeadlines} AND p.id = $4)
    ${planItems} AND p.id = $4
  `, values);
  if (!rows[0]) throw new HttpError(404, "NOT_FOUND");
  const [grades, exams, deadlines] = await Promise.all([
    getPool().query(`
      SELECT g.id, g.kind, g.label, g.value::float8 AS value, g.scale, g.outcome,
        g.published_at AS "publishedAt"
      FROM grades g JOIN study_plan_items p ON p.id = g.plan_item_id
      WHERE p.student_id = $1 AND g.published_at <= $2 AND p.id = $3
      ORDER BY g.published_at, g.id
    `, [actor.id, now, id]),
    getPool().query(`${visibleExams} AND p.id = $4 ORDER BY e.starts_at, e.id`, values),
    getPool().query(`${visibleAcademicDeadlines} AND p.id = $4 ORDER BY dl.due_at, dl.id`, values),
  ]);
  const [modules, attendance, scores, teachers] = await Promise.all([
    getPool().query(`SELECT m.id,m.title,m.position FROM discipline_modules m JOIN study_plan_items p ON p.discipline_id=m.discipline_id WHERE p.id=$1 AND p.student_id=$2 ORDER BY m.position,m.id`, [id,actor.id]),
    getPool().query(`SELECT l.id AS "lessonId", r.starts_at AS "startsAt", r.kind, a.status FROM study_plan_items p
      JOIN disciplines d ON d.id=p.discipline_id AND d.group_id=$3 JOIN lessons l ON l.discipline_id=d.id
      JOIN LATERAL (SELECT starts_at,status,kind FROM lesson_revisions WHERE lesson_id=l.id AND published_at <= $4 ORDER BY version DESC LIMIT 1) r ON true
      LEFT JOIN lesson_attendance a ON a.lesson_id=l.id AND a.student_id=$2 AND a.published_at <= $4
      WHERE p.id=$1 AND p.student_id=$2 AND r.starts_at <= $4 AND r.status <> 'cancelled' ORDER BY r.starts_at,l.id`, [id,actor.id,actor.group_id,now]),
    getPool().query(`SELECT b.semester_score::float8 AS "semesterScore",b.semester_max::float8 AS "semesterMax",b.exam_score::float8 AS "examScore",b.exam_max::float8 AS "examMax" FROM study_score_breakdowns b JOIN study_plan_items p ON p.id=b.plan_item_id WHERE p.id=$1 AND p.student_id=$2 AND b.published_at <= $3`, [id,actor.id,now]),
    getPool().query(`
      SELECT t.id, t.full_name AS "fullName"
      FROM study_plan_items p
      JOIN discipline_teachers dt ON dt.discipline_id = p.discipline_id
      JOIN teachers t ON t.id = dt.teacher_id
      WHERE p.id = $1 AND p.student_id = $2
      ORDER BY t.full_name, t.id
    `, [id, actor.id]),
  ]);
  return disciplineResponse.parse({ ...rows[0], grades: grades.rows, exams: exams.rows, deadlines: deadlines.rows,
    modules: modules.rows, attendance: attendance.rows, scores: scores.rows[0] ?? null, teachers: teachers.rows });
}

export async function studyCards(actor: Actor, requested: string | undefined, subject: string | undefined, now: Date) {
  const target = subject ? await disciplineDetail(actor, subject, now) : null;
  const study = await studyList(actor, requested ?? target?.semesterId, now);
  if (target && target.semesterId !== study.semesterId) throw new HttpError(404, "NOT_FOUND");
  const date = dateInMoscow(now);
  const semester = study.semesters.find((item) => item.id === study.semesterId);
  const [cards, assignments, term, sports] = await Promise.all([
    Promise.all(study.items.map((item) => target?.id === item.id ? target : disciplineDetail(actor, item.id, now))),
    listPublishedAssignments(actor, now),
    study.semesterId ? getPool().query<{ start: string; end: string }>(
      'SELECT starts_on::text AS "start", ends_on::text AS "end" FROM semesters WHERE id=$1', [study.semesterId],
    ) : null,
    sportsTermRows(actor, now),
  ]);
  const span = term?.rows[0];
  const week = span && date >= span.start && date <= span.end
    ? Math.round((Date.parse(mondayOf(date)) - Date.parse(mondayOf(span.start))) / 604_800_000) + 1
    : null;
  const ownedIds = new Set(study.items.map((item) => item.id));
  return studyCardsResponse.parse({
    date, semesterLabel: semester?.label ?? null, week, cards,
    sports: sports.rows.find((term) => term.semesterId === study.semesterId) ?? null,
    assignments: assignments.filter((item) => ownedIds.has(item.planId)),
  });
}

export async function studyToday(actor: Actor, now: Date) {
  const { semesterId, progress, items } = await studyList(actor, undefined, now);
  return todayStudy.parse({ semesterId, ...progress, statuses: items.map((item) => item.status) });
}
export async function deadlineToday(actor: Actor, now: Date) {
  const { rows } = await getPool().query(`
    WITH candidates AS (${visibleDeadlineTargets})
    SELECT * FROM candidates WHERE required AND state <> 'completed'
    ORDER BY (state = 'upcoming') DESC,
      CASE WHEN state = 'upcoming' THEN "dueAt" END ASC,
      CASE WHEN state = 'overdue' THEN "dueAt" END DESC, id
    LIMIT 1
  `, args(actor, now));
  return todayDeadline.parse(rows[0] ?? null);
}

export async function assistantDeadlines(actor: Actor, now: Date, discipline?: string, excludeIds: string[] = []) {
  const { rows } = await getPool().query(`
    WITH candidates AS (${visibleDeadlineTargets})
    SELECT c.* FROM candidates c
    LEFT JOIN study_plan_items p ON p.id = c."planId" AND p.student_id = $1
    LEFT JOIN disciplines d ON d.id = p.discipline_id
    WHERE c.required AND c.state <> 'completed'
      AND ($4::text IS NULL OR replace(lower(d.title), 'ё', 'е') = $4)
      AND NOT (c.id = ANY($5::uuid[]))
    ORDER BY (c.state = 'upcoming') DESC,
      CASE WHEN c.state = 'upcoming' THEN c."dueAt" END ASC,
      CASE WHEN c.state = 'overdue' THEN c."dueAt" END DESC, c.id
    LIMIT 5
  `, [...args(actor, now), discipline ?? null, excludeIds]);
  return todayDeadline.unwrap().array().parse(rows);
}
