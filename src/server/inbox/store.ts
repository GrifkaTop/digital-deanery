import "server-only";
import { HttpError, lockSession, type Actor } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { transaction } from "@/server/db/transaction";
import { visibleDeadlineTargets } from "@/server/academics/deadlines";
import { inboxCursor, inboxDetail, inboxList, type inboxFilter } from "@/contracts/inbox";
import type { z } from "zod";

// $1 student, $2 current group, $3 publication clock.
type NoticeAlias = "n" | "page";

function publishedResult(alias: NoticeAlias) {
  return `
    FROM student_assignment_results result
    JOIN assignments a ON a.id = result.assignment_id
    JOIN disciplines d ON d.id = a.discipline_id AND d.group_id = $2
    JOIN study_plan_items p ON p.discipline_id = d.id AND p.student_id = $1
    WHERE result.student_id = $1 AND ${alias}.student_id = $1 AND a.id = ${alias}.assignment_id
      AND result.score IS NOT NULL AND result.published_at <= $3 AND a.published_at <= $3
      AND (a.student_id = $1 OR a.group_id = $2)`;
}

const audience = `n.published_at <= $3 AND (n.student_id = $1 OR n.group_id = $2)
  AND (n.kind::text <> 'assignment_result' OR EXISTS (SELECT 1 ${publishedResult("n")}))`;
const summary = `n.id, n.kind, n.important, n.title, n.published_at AS "publishedAt", state.read_at AS "readAt"`;

function noticeContexts(alias: NoticeAlias) {
  // A room notice describes the revision published with it, including its predecessor.
  const publication = alias === "page" ? 'page."publishedAt"' : "n.published_at";
  const deadlineAssignment = alias === "page" ? 'page."deadlineAssignmentId"' : 'dl."assignmentId"';
  return `
    LEFT JOIN LATERAL (
      SELECT a.id, jsonb_build_object(
        'type', 'grade', 'subject', d.title, 'title', a.title, 'workKind', a.kind, 'number', a.number,
        'points', result.score, 'maxPoints', a.max_score
      ) AS context
      ${publishedResult(alias)}
    ) grade ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'type', 'room_change', 'title', d.title, 'kind', current.kind,
        'startsAt', current.starts_at, 'endsAt', current.ends_at,
        'room', current.room, 'building', current.building,
        'previousRoom', previous.room, 'previousBuilding', previous.building
      ) AS context
      FROM lessons l JOIN disciplines d ON d.id = l.discipline_id AND d.group_id = $2
      JOIN LATERAL (
        SELECT v.version, v.starts_at, v.ends_at, v.kind, v.status, v.room, v.building
        FROM lesson_revisions v WHERE v.lesson_id = l.id AND v.published_at <= ${publication}
        ORDER BY v.version DESC LIMIT 1
      ) current ON true
      JOIN LATERAL (
        SELECT v.room, v.building FROM lesson_revisions v
        WHERE v.lesson_id = l.id AND v.version < current.version AND v.published_at <= ${publication}
        ORDER BY v.version DESC LIMIT 1
      ) previous ON true
      WHERE l.id = ${alias}.lesson_id AND current.status <> 'cancelled'
        AND (current.room, current.building) IS DISTINCT FROM (previous.room, previous.building)
    ) move ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('type', 'work_deadline', 'workKind', a.kind) AS context
      FROM assignments a WHERE a.id = ${deadlineAssignment}
    ) deadline_work ON true`;
}

function decodeCursor(value: string | undefined) {
  if (!value) return null;
  try { return inboxCursor.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { throw new HttpError(422, "INVALID_FIELDS"); }
}

export async function listInbox(actor: Actor, now: Date, filter: z.infer<typeof inboxFilter>, after?: string) {
  const cursor = decodeCursor(after);
  const { rows } = await getPool().query(`
    WITH visible AS (
      SELECT ${summary}, n.deadline_id, n.lesson_id, n.assignment_id, n.student_id
      FROM notifications n
      LEFT JOIN notification_states state ON state.student_id = $1 AND state.notification_id = n.id
      WHERE ${audience}
    ), ranked AS (
      SELECT visible.*, dl."dueAt", dl."assignmentId" AS "deadlineAssignmentId",
        CASE WHEN dl.id IS NOT NULL AND dl.state <> 'completed' THEN 1 ELSE 0 END AS priority,
        CASE WHEN dl.id IS NOT NULL AND dl.state <> 'completed'
          THEN -extract(epoch FROM dl."dueAt") ELSE extract(epoch FROM "publishedAt") END AS "orderValue"
      FROM visible LEFT JOIN (${visibleDeadlineTargets}) dl ON dl.id = visible.deadline_id
      WHERE $4 = 'all' OR ($4 = 'important' AND important) OR ($4 = 'deadlines' AND kind = 'deadline')
    )
    SELECT page.*, totals."unreadCount", coalesce(grade.context, move.context, deadline_work.context) AS context
    FROM (SELECT count(*)::int AS "unreadCount" FROM visible WHERE "readAt" IS NULL) totals
    LEFT JOIN LATERAL (
      SELECT ranked.*,
        to_char("publishedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedCursor"
      FROM ranked
      WHERE $5::int IS NULL OR (priority, "orderValue", "publishedAt", id) < ($5::int, $6::numeric, $7::timestamptz, $8::uuid)
      ORDER BY priority DESC, "orderValue" DESC, "publishedAt" DESC, id DESC LIMIT 21
    ) page ON true
    ${noticeContexts("page")}
    ORDER BY page.priority DESC, page."orderValue" DESC, page."publishedAt" DESC, page.id DESC
  `, [actor.id, actor.group_id, now, filter, cursor?.priority, cursor?.orderValue, cursor?.publishedAt, cursor?.id]);

  const items = rows[0].id ? rows.slice(0, 20) : [];
  const last = items.at(-1);
  const nextCursor = rows.length > 20 && last ? Buffer.from(JSON.stringify(inboxCursor.parse({
    priority: last.priority, orderValue: last.orderValue, publishedAt: last.publishedCursor, id: last.id,
  }))).toString("base64url") : null;
  return inboxList.parse({ items, unreadCount: rows[0].unreadCount, nextCursor });
}

export async function getInboxItem(actor: Actor, now: Date, id: string) {
  const { rows: [row] } = await getPool().query(`
    SELECT ${summary}, n.body, dl."dueAt", coalesce(grade.context, move.context, deadline_work.context) AS context,
      CASE
        WHEN grade.id IS NOT NULL THEN jsonb_build_object('kind', 'assignment', 'id', grade.id)
        WHEN l.id IS NOT NULL THEN jsonb_build_object('kind', 'lesson', 'id', l.id)
        WHEN dl."assignmentId" IS NOT NULL THEN jsonb_build_object('kind', 'assignment', 'id', dl."assignmentId")
        WHEN dl."planId" IS NOT NULL THEN jsonb_build_object('kind', 'discipline', 'id', dl."planId")
        WHEN coalesce(r.id, dl."requestId") IS NOT NULL THEN jsonb_build_object('kind', 'request', 'id', coalesce(r.id, dl."requestId"))
      END AS target
    FROM notifications n
    LEFT JOIN notification_states state ON state.student_id = $1 AND state.notification_id = n.id
    LEFT JOIN (${visibleDeadlineTargets}) dl ON dl.id = n.deadline_id
    LEFT JOIN requests r ON r.id = n.request_id AND r.student_id = $1
    LEFT JOIN lessons l ON l.id = n.lesson_id AND EXISTS (
      SELECT FROM disciplines d JOIN lesson_revisions v ON v.lesson_id = l.id
      WHERE d.id = l.discipline_id AND d.group_id = $2 AND v.published_at <= $3
    )
    ${noticeContexts("n")}
    WHERE ${audience} AND n.id = $4
  `, [actor.id, actor.group_id, now, id]);
  if (!row) throw new HttpError(404, "NOT_FOUND");
  return inboxDetail.parse(row);
}

export async function markInboxRead(actor: Actor, now: Date, id: string | null) {
  await transaction(async (client) => {
    await lockSession(client, actor);
    const result = await client.query(`
      INSERT INTO notification_states(student_id, notification_id, read_at)
      SELECT $1, n.id, $3 FROM notifications n
      WHERE ${audience} AND ($4::uuid IS NULL OR n.id = $4)
      ON CONFLICT (student_id, notification_id)
      DO UPDATE SET read_at = coalesce(notification_states.read_at, EXCLUDED.read_at)
    `, [actor.id, actor.group_id, now, id]);
    if (id && !result.rowCount) throw new HttpError(404, "NOT_FOUND");
  });
}
