import "server-only";
import { z } from "zod";
import { assignmentItem, assignmentList } from "@/contracts/assignments";
import { handle, HttpError, json, requireActor, type Actor } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { visibilityNow } from "@/server/clock";

const query = `SELECT a.module_id AS "moduleId", a.id, p.id AS "planId", a.discipline_id AS "disciplineId", a.teacher_id AS "teacherId",
 t.full_name AS "teacherName", a.kind, a.number, a.title, a.description, a.actions, a.requirements,
 a.issued_at AS "issuedAt", a.published_at AS "publishedAt", a.max_score::float8 AS "maxScore",
 dl.id AS "deadlineId", dl.due_at AS "dueAt", dl.required,
 CASE WHEN result.student_id IS NULL THEN NULL ELSE json_build_object('stage', result.stage,
   'score', result.score::float8, 'completedAt', result.completed_at, 'defendedAt', result.defended_at,
   'onTime', CASE WHEN result.completed_at IS NULL OR dl.id IS NULL THEN NULL ELSE result.completed_at <= dl.due_at END) END AS result
 FROM assignments a JOIN study_plan_items p ON p.discipline_id=a.discipline_id AND p.student_id=$1
 JOIN disciplines d ON d.id=a.discipline_id AND d.group_id=$2 JOIN teachers t ON t.id=a.teacher_id
 LEFT JOIN deadlines dl ON dl.assignment_id=a.id AND dl.published_at <= $3
   AND dl.student_id IS NOT DISTINCT FROM a.student_id AND dl.group_id IS NOT DISTINCT FROM a.group_id
 LEFT JOIN student_assignment_results result ON result.assignment_id=a.id AND result.student_id=$1 AND result.published_at <= $3
 WHERE a.published_at <= $3 AND (a.student_id=$1 OR a.group_id=$2)`;
function normalize(row: Record<string, unknown>) {
  const result = row.result as { completedAt: string | null; defendedAt: string | null } | null;
  if (result) for (const key of ["completedAt", "defendedAt"] as const) if (result[key]) result[key] = new Date(result[key]).toISOString();
  return row;
}
async function visible(actor: Actor, id?: string, now = visibilityNow()) {
  const values = [actor.id, actor.group_id, now];
  const rows = id
    ? (await getPool().query(`${query} AND a.id=$4`, [...values, id])).rows
    : (await getPool().query(`${query} ORDER BY dl.due_at NULLS LAST, a.id`, values)).rows;
  return rows.map(normalize);
}
export async function listPublishedAssignments(actor: Actor, now: Date) {
  return assignmentList.parse({ items: await visible(actor, undefined, now) }).items;
}
export const getAssignments = (request: Request) => handle(async () => {
  const actor = await requireActor();
  if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
  return json(assignmentList.parse({ items: await visible(actor) }));
});
export const getAssignment = (id: string) => handle(async () => {
  const actor = await requireActor();
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
  const [row] = await visible(actor, id);
  if (!row) throw new HttpError(404, "NOT_FOUND");
  return json(assignmentItem.parse(row));
});
