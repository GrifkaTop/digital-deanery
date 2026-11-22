import "server-only";
import { deadlinesResponse } from "@/contracts/academics";
import { dateInMoscow } from "@/contracts/calendar";
import type { Actor } from "@/server/auth/service";
import { getPool } from "@/server/db";

// $1 student, $2 current group, $3 visibility clock, used consistently by study and inbox.
export const visibleAcademicDeadlines = `
  SELECT dl.id, p.id AS "planId", dl.assignment_id AS "assignmentId", dl.title, dl.due_at AS "dueAt", dl.required,
    CASE WHEN dc.completed_at <= $3 OR ar.completed_at <= $3 THEN 'completed'
         WHEN dl.due_at < $3 THEN 'overdue' ELSE 'upcoming' END AS state
  FROM study_plan_items p JOIN deadlines dl ON dl.discipline_id = p.discipline_id OR EXISTS (
    SELECT FROM assignments a WHERE a.id=dl.assignment_id AND a.discipline_id=p.discipline_id
      AND a.published_at <= $3 AND (a.student_id=$1 OR a.group_id=$2)
      AND a.student_id IS NOT DISTINCT FROM dl.student_id AND a.group_id IS NOT DISTINCT FROM dl.group_id
  )
  JOIN disciplines d ON d.id = p.discipline_id
  LEFT JOIN deadline_completions dc ON dc.deadline_id = dl.id AND dc.student_id = $1
  LEFT JOIN student_assignment_results ar ON ar.assignment_id=dl.assignment_id AND ar.student_id=$1 AND ar.published_at <= $3
  WHERE p.student_id = $1 AND dl.published_at <= $3
    AND (dl.student_id = $1 OR (dl.group_id = $2 AND d.group_id = $2))
`;
export const visibleDeadlineTargets = `
      SELECT id, "planId", "assignmentId", NULL::uuid AS "requestId", title, "dueAt", required, state
      FROM (${visibleAcademicDeadlines}) AS academic
      UNION ALL
      SELECT dl.id, NULL::uuid, NULL::uuid, r.id, dl.title, dl.due_at, dl.required,
        CASE WHEN dc.completed_at <= $3 THEN 'completed'
             WHEN dl.due_at < $3 THEN 'overdue' ELSE 'upcoming' END
      FROM deadlines dl JOIN requests r ON r.id = dl.request_id AND r.student_id = dl.student_id
      LEFT JOIN deadline_completions dc ON dc.deadline_id = dl.id AND dc.student_id = $1
      WHERE dl.student_id = $1 AND dl.published_at <= $3
`;

export async function listDeadlines(actor: Actor, now: Date) {
  const { rows } = await getPool().query(`
    WITH candidates AS (${visibleDeadlineTargets})
    SELECT c.*, d.title AS "subjectTitle", a.title AS "workTitle", a.kind AS "workKind", a.number AS "workNumber"
    FROM candidates c
    LEFT JOIN study_plan_items p ON p.id = c."planId" AND p.student_id = $1
    LEFT JOIN disciplines d ON d.id = p.discipline_id
    LEFT JOIN semesters s ON s.id = d.semester_id
    LEFT JOIN assignments a ON a.id = c."assignmentId"
    WHERE c.state <> 'completed' AND a.kind IS DISTINCT FROM 'seminar'
      AND (c."requestId" IS NOT NULL OR s.is_current)
    ORDER BY c."dueAt", c.id
  `, [actor.id, actor.group_id, now]);

  return deadlinesResponse.parse({
    today: dateInMoscow(now),
    items: rows.map(row => ({
      id: row.id,
      title: row.workTitle ?? row.title,
      subjectTitle: row.subjectTitle ?? null,
      dueAt: row.dueAt,
      required: row.required,
      target: row.requestId
        ? { kind: "request", id: row.requestId }
        : row.assignmentId
          ? { kind: "assignment", id: row.assignmentId, workKind: row.workKind, number: row.workNumber }
          : { kind: "discipline", id: row.planId },
    })),
  });
}
