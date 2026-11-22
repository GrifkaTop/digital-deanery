import "server-only";
import { consultationPayload, scholarshipSnapshot, slots, studySnapshot, type RequestSummary } from "@/contracts/requests";
import { scholarshipForm, studyForm } from "@/contracts/request-forms";
import { recordEvent } from "./store";
import { transaction } from "@/server/db/transaction";

export async function processDueRequests() {
  return transaction(async (client) => {
    const { rows: [{ now }] } = await client.query("SELECT date_trunc('milliseconds', clock_timestamp()) AS now");
    const { rows } = await client.query(`
      SELECT r.id, r.student_id AS "studentId", r.public_no AS "publicNo", r.kind, r.payload, r.status,
        r.version, r.created_at AS "createdAt", s.full_name AS "fullName", g.faculty, g.program, g.course, g.code AS "group",
        g.education_level AS "educationLevel", g.study_mode AS "studyMode"
      FROM requests r JOIN students s ON s.id = r.student_id JOIN groups g ON g.id = s.group_id
      WHERE r.next_transition_at <= $1
      ORDER BY r.next_transition_at, r.id LIMIT 25 FOR UPDATE OF r SKIP LOCKED
    `, [now]);
    for (const row of rows) {
      let to: RequestSummary["status"];
      let nextAt: Date | null = null;
      let snapshot = null;
      let reason = null;
      if (row.status === "submitted") {
        to = "in_progress";
        nextAt = new Date(row.createdAt.getTime() + 60_000);
      } else if (row.kind === "study_certificate" || (row.kind === "scholarship_certificate" && row.payload.schemaVersion === 2)) {
        const facts = {
          publicNo: row.publicNo, fullName: row.fullName, faculty: row.faculty, program: row.program,
          course: row.course, group: row.group, educationLevel: row.educationLevel, studyMode: row.studyMode, readyAt: now,
        };
        to = "ready";
        if (row.kind === "study_certificate") {
          const { purpose } = studyForm.parse(row.payload);
          snapshot = studySnapshot.parse({ ...facts, templateVersion: 2, purpose });
        } else {
          const request = scholarshipForm.parse(row.payload);
          const { rows: accruals } = await client.query(`
            SELECT to_char(month, 'YYYY-MM') AS month, amount_kopecks AS "amountKopecks"
            FROM scholarship_accruals
            WHERE student_id = $1 AND kind = $2 AND month BETWEEN $3::date AND $4::date
            ORDER BY month
          `, [row.studentId, request.scholarshipKind, request.fromMonth + "-01", request.toMonth + "-01"]);
          if (accruals.length) {
            snapshot = scholarshipSnapshot.parse({ ...facts, templateVersion: 1, request, accruals });
          } else {
            to = "rejected";
            reason = "За выбранный период в кабинете нет сведений о начислениях этого вида.";
          }
        }
      } else if (row.kind !== "consultation_reschedule") {
        if (row.payload.schemaVersion >= 2) {
          to = "registered";
        } else {
          to = "approved";
          reason = "Демонстрационное обращение рассмотрено. Решение доступно в кабинете.";
        }
      } else {
        const payload = consultationPayload.parse(row.payload);
        if (payload.choice === "keep_original") {
          to = "rejected";
          reason = "Исходное время совпадает с занятием. Выберите другой вариант в новой заявке.";
        } else if (payload.reason === "schedule_conflict" && !payload.choice) {
          to = "needs_clarification";
          reason = "Выбранное время совпадает с занятием. Подтвердите альтернативное время или оставьте исходное.";
        } else {
          to = "approved";
          const slot = payload.choice === "alternative_slot"
            ? (payload.slot === "option_a" ? "option_b" : "option_a") : payload.slot;
          reason = `Консультация перенесена. ${slots[slot]}.`;
        }
      }
      const updated = await client.query(`
        UPDATE requests SET status = $2, next_transition_at = $3, result_snapshot = $4,
          updated_at = $5, version = version + 1 WHERE id = $1 AND version = $6
      `, [row.id, to, nextAt, snapshot, now, row.version]);
      if (updated.rowCount === 1) await recordEvent(client, { ...row, version: row.version + 1 }, row.status, to, "system", reason, now);
    }
    return rows.length;
  });
}

const worker = globalThis as typeof globalThis & { requestTimer?: NodeJS.Timeout };
export function startRequestWorker() {
  if (worker.requestTimer) return;
  let busy = false;
  worker.requestTimer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await processDueRequests(); }
    catch { console.error("Request transition batch failed"); }
    finally { busy = false; }
  }, 5_000);
  worker.requestTimer.unref();
}
