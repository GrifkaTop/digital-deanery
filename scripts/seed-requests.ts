import { Pool } from "pg";
import { z } from "zod";
import { certificateSnapshot, nextStep, statusLabel } from "../src/contracts/requests";

const readyAt = new Date("2026-11-10T06:00:00Z");
const submittedAt = new Date(readyAt.getTime() - 60_000);
const processingAt = new Date(submittedAt.getTime() + 20_000);
const examples = [
  { key: 1, account: 1, publicNo: "СП-2026-0042", data: { kind: "study_certificate", payload: { purpose: "on_request" } }, status: "ready" },
  { key: 2, account: 2, publicNo: "СП-2026-0051", data: { kind: "study_certificate", payload: { purpose: "study_contest" } }, status: "ready" },
  { key: 3, account: 2, publicNo: "ЗА-2026-0052", data: { kind: "consultation_reschedule",
    payload: { reason: "schedule_conflict", slot: "option_a" } }, status: "needs_clarification" },
  { key: 5, account: 3, publicNo: "ЗА-2026-0064", data: { kind: "consultation_reschedule", payload: { reason: "schedule_conflict", slot: "option_a" } }, status: "needs_clarification" },
  { key: 4, account: 3, publicNo: "СП-2026-0063", data: { kind: "study_certificate", payload: { purpose: "on_request" } }, status: "ready" },
] as const;

async function seed() {
  const pool = new Pool({ connectionString: z.string().min(1).parse(process.env.MIGRATION_DATABASE_URL) });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8112026)");
    for (const example of examples) {
      const accountId = `10000000-0000-4000-8000-00000000000${example.account}`;
      const id = `30000000-0000-4000-8000-00000000000${example.key}`;
      const { rows: [profile] } = await client.query(`
        SELECT s.id AS "studentId", s.full_name AS "fullName", g.faculty, g.program, g.course, g.code AS "group"
        FROM students s JOIN groups g ON g.id = s.group_id WHERE s.account_id = $1
      `, [accountId]);
      if (!profile) {
        if (example.account === 3) continue;
        throw new Error("Missing profile");
      }
      const { studentId, ...facts } = profile;
      const { kind } = example.data;
      const payload = { schemaVersion: 1, ...example.data.payload };
      const snapshot = example.status === "ready"
        ? certificateSnapshot.parse({ ...facts, templateVersion: 1, publicNo: example.publicNo, readyAt }) : null;
      const inserted = await client.query(`
        INSERT INTO requests (id, student_id, public_no, kind, payload, status, version, result_snapshot, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 3, $7, $8, $9) ON CONFLICT(id) DO NOTHING
      `, [id, studentId, example.publicNo, kind, payload, example.status, snapshot, submittedAt, readyAt]);
      if (!inserted.rowCount) continue;
      const clarification = "Выбранное время совпадает с занятием. Подтвердите альтернативное время или оставьте исходное.";
      const stages = [
        [1, null, "submitted", "student", null, submittedAt],
        [2, "submitted", "in_progress", "system", null, processingAt],
        [3, "in_progress", example.status, "system", example.status === "ready" ? null : clarification, readyAt],
      ] as const;
      for (const [version, from, to, actor, reason, at] of stages) {
        await client.query(`
          INSERT INTO request_history (request_id, version, from_status, to_status, actor_kind, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, version, from, to, actor, reason, at]);
      }
      const { rows: [notice] } = await client.query(`
        INSERT INTO notifications (student_id, kind, important, title, body, request_id, source_key, published_at)
        VALUES ($1, 'request_update', true, $2, $3, $4, $5, $6) RETURNING id
      `, [studentId, `${example.publicNo} · ${statusLabel[example.status]}`,
        example.status === "ready" ? nextStep.ready : clarification, id, `request:${id}:3`, readyAt]);
      if (example.account === 2) await client.query(
        "INSERT INTO notification_states (student_id, notification_id, read_at) VALUES ($1, $2, $3)",
        [studentId, notice.id, readyAt],
      );
    }
    await client.query(`
      INSERT INTO scholarship_accruals (student_id, kind, month, amount_kopecks)
      SELECT s.id, demo.kind, demo.month::date, demo.amount
      FROM (VALUES
        ('10000000-0000-4000-8000-000000000001', 'academic', '2026-09-01', 310000),
        ('10000000-0000-4000-8000-000000000001', 'academic', '2026-10-01', 310000),
        ('10000000-0000-4000-8000-000000000002', 'social', '2026-10-01', 470000)
      ) AS demo(account_id, kind, month, amount)
      JOIN students s ON s.account_id = demo.account_id::uuid
      ON CONFLICT DO NOTHING
    `);
    await client.query("COMMIT");
    console.log("Synthetic requests ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
seed().catch(() => { console.error("Request seed failed"); process.exitCode = 1; });
