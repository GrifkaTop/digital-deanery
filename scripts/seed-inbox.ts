import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { notificationKinds } from "../src/contracts/inbox";

const event = z.object({
  studentId: z.uuid().nullable(), groupId: z.uuid().nullable(), kind: z.enum(notificationKinds),
  important: z.boolean(), title: z.string().min(1), body: z.string().min(1), sourceKey: z.string().min(1),
  lessonId: z.uuid().nullable().default(null), deadlineId: z.uuid().nullable().default(null),
  assignmentId: z.uuid().nullable().default(null), publishedAt: z.date(),
});

async function add(client: PoolClient, fixture: z.input<typeof event>, readFor?: string) {
  const row = event.parse(fixture);
  const { rows: [notice] } = await client.query(`
    INSERT INTO notifications (student_id, group_id, kind, important, title, body, lesson_id, deadline_id, assignment_id, source_key, published_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (source_key) DO NOTHING RETURNING id
  `, [row.studentId, row.groupId, row.kind, row.important, row.title, row.body,
    row.lessonId, row.deadlineId, row.assignmentId, row.sourceKey, row.publishedAt]);
  if (notice && readFor) await client.query(`
    INSERT INTO notification_states (student_id, notification_id, read_at) VALUES ($1, $2, $3)
  `, [readFor, notice.id, row.publishedAt]);
}

const lessonStatuses: Record<string, string> = { moved: "Перенос", replaced: "Замена преподавателя", cancelled: "Отмена" };
const dateLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" });

async function seed() {
  const pool = new Pool({ connectionString: z.string().min(1).parse(process.env.MIGRATION_DATABASE_URL) });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112026)");
    const { rows: [b] } = await client.query(`
      SELECT s.id AS "studentId", g.id AS "groupId"
      FROM students s JOIN groups g ON g.code = 'Орбита-11'
      WHERE s.account_id = '10000000-0000-4000-8000-000000000002'
    `);
    if (!b) throw new Error("Missing demo profile");
    const { rows: [membership] } = await client.query("SELECT group_id FROM students WHERE id = $1", [b.studentId]);
    const readBGroup = membership.group_id === b.groupId ? b.studentId : undefined;
    await add(client, {
      studentId: null, groupId: b.groupId, kind: "announcement", important: false,
      title: "Консультация по выбору электива",
      body: "Вопросы о вариантах элективов можно обсудить с преподавателем на ближайшем практикуме.",
      sourceKey: "announcement:orbita-elective-2026", publishedAt: new Date("2026-11-10T05:00:00Z"),
    }, readBGroup);

    const { rows: revisions } = await client.query(`
      SELECT l.id, d.group_id, d.title, v.version, v.status, v.starts_at, v.room, v.teacher_name, v.reason, v.published_at
      FROM lessons l JOIN disciplines d ON d.id = l.discipline_id
      JOIN lesson_revisions v ON v.lesson_id = l.id
      WHERE l.id::text LIKE '20000000-0000-4000-8000-07%' AND v.status <> 'planned'
      ORDER BY l.id, v.version
    `);
    for (const revision of revisions) {
      const details = revision.status === "cancelled" ? "" :
        `\n${dateLabel.format(revision.starts_at)} МСК · аудитория ${revision.room} · ${revision.teacher_name}.`;
      await add(client, {
        studentId: null, groupId: revision.group_id, kind: "schedule_change", important: true,
        title: `${lessonStatuses[revision.status]} · ${revision.title}`,
        body: revision.reason + details, lessonId: revision.id,
        sourceKey: `lesson:${revision.id}:${revision.version}`, publishedAt: revision.published_at,
      }, revision.group_id === b.groupId ? readBGroup : undefined);
    }

    const { rows: deadlines } = await client.query(`
      SELECT id, student_id, group_id, title, due_at, required, published_at FROM deadlines
      WHERE id IN ('20000000-0000-4000-8000-060000000001','20000000-0000-4000-8000-060000000002','20000000-0000-4000-8000-060000000003')
    `);
    for (const deadline of deadlines) {
      await add(client, {
        studentId: deadline.student_id, groupId: deadline.group_id, kind: "deadline", important: deadline.required,
        title: deadline.title, body: `Срок выполнения · ${dateLabel.format(deadline.due_at)} МСК.`, deadlineId: deadline.id,
        sourceKey: `deadline:${deadline.id}`, publishedAt: deadline.published_at,
      }, deadline.group_id === b.groupId ? readBGroup : undefined);
    }
    const { rows: [control] } = await client.query<{
      student_id: string; deadline_id: string; published_at: Date; due_at: Date;
    }>(`
      SELECT s.id AS student_id, dl.id AS deadline_id, dl.due_at,
        greatest(a.published_at, dl.published_at, '2026-11-16 12:00+03'::timestamptz) AS published_at
      FROM students s
      JOIN study_plan_items p ON p.student_id = s.id
      JOIN assignments a ON a.discipline_id = p.discipline_id AND a.student_id = s.id
      JOIN deadlines dl ON dl.assignment_id = a.id AND dl.student_id = s.id
      WHERE s.account_id = '10000000-0000-4000-8000-000000000003' AND s.student_number = 'DEMO-3'
        AND a.kind = 'rk' AND a.title = 'Пересдача контрольной работы'
      ORDER BY dl.id LIMIT 1
    `);
    if (control) await add(client, {
      studentId: control.student_id, groupId: null, kind: "deadline", important: true,
      title: "Не забудьте о контрольной",
      body: "Срок выполнения · " + dateLabel.format(control.due_at) + " МСК.",
      deadlineId: control.deadline_id, sourceKey: "deadline:" + control.deadline_id, publishedAt: control.published_at,
    });

    const gradeTitles = {
      dz: "Проверено домашнее задание", rk: "Проверен рубежный контроль", lr: "Проверена лабораторная работа",
    } as const;
    const { rows: grades } = await client.query<{
      student_id: string; assignment_id: string; kind: keyof typeof gradeTitles; published_at: Date;
    }>(`
      SELECT result.student_id, result.assignment_id, a.kind, result.published_at
      FROM student_assignment_results result
      JOIN students s ON s.id = result.student_id
      JOIN assignments a ON a.id = result.assignment_id
      JOIN study_plan_items p ON p.student_id = s.id AND p.discipline_id = a.discipline_id
      JOIN disciplines d ON d.id = p.discipline_id AND d.group_id = s.group_id
      WHERE s.account_id = '10000000-0000-4000-8000-000000000003' AND s.student_number = 'DEMO-3'
        AND (a.student_id = s.id OR a.group_id = s.group_id)
        AND result.stage = 'defended' AND result.score IS NOT NULL AND
        (a.kind, a.title) IN (('rk', 'РК1 · Письменная часть'), ('lr', 'ЛР3 · Хранилище и запросы'), ('dz', 'Разбор учебной ситуации'))
    `);
    for (const grade of grades) {
      await add(client, {
        studentId: grade.student_id, groupId: null, kind: "assignment_result", important: false,
        title: gradeTitles[grade.kind], body: "Опубликован результат проверки работы.",
        assignmentId: grade.assignment_id,
        sourceKey: "assignment-result:" + grade.student_id + ":" + grade.assignment_id,
        publishedAt: grade.published_at,
      });
    }
    await client.query("COMMIT");
    console.log("Synthetic inbox ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
seed().catch(() => { console.error("Inbox seed failed"); process.exitCode = 1; });
