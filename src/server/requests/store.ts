import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { getPool } from "@/server/db";
import { transaction } from "@/server/db/transaction";
import { HttpError, lockSession, type Actor } from "@/server/auth/service";
import { createHash } from "node:crypto";
import {
  createRequest, clarifyRequest, consultationPayload, isCertificate, nextStep, requestCursor, requestDetail, requestList,
  requestResult, requestSummary, statusLabel, type RequestSummary,
} from "@/contracts/requests";

const summary = 'id, public_no AS "publicNo", kind, status, created_at AS "createdAt", updated_at AS "updatedAt"';
export async function byPublicNumber(actor: Actor, publicNo: string) {
  const { rows } = await getPool().query(`SELECT ${summary} FROM requests WHERE student_id=$1 AND upper(public_no)=$2`, [actor.id, publicNo]);
  return rows[0] ? requestSummary.parse(rows[0]) : null;
}
export async function list(actor: Actor, filter: string, cursor?: string) {
  let from = null;
  if (cursor) {
    try { from = requestCursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))); }
    catch { throw new HttpError(422, "INVALID_FIELDS"); }
  }
  const { rows } = await getPool().query(`
    SELECT ${summary} FROM requests WHERE student_id = $1
      AND ($2 = 'all' OR ($2 = 'active' AND status IN ('submitted', 'in_progress'))
        OR ($2 = 'reply' AND status = 'needs_clarification')
        OR ($2 = 'closed' AND status IN ('ready', 'approved', 'rejected', 'registered'))
        OR ($2 = 'atlas_active' AND status IN ('submitted', 'in_progress', 'needs_clarification'))
        OR ($2 = 'atlas_ready' AND status IN ('ready', 'approved', 'rejected', 'registered')))
      AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
    ORDER BY created_at DESC, id DESC LIMIT 21
  `, [actor.id, filter, from?.createdAt, from?.id]);
  const items = rows.slice(0, 20).map((row) => requestSummary.parse(row));
  const last = items.at(-1);
  const nextCursor = rows.length > 20 && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url") : null;
  const { rows: [counts] } = await getPool().query(`
    SELECT count(*)::int AS "all", count(*) FILTER (WHERE status IN ('submitted','in_progress','needs_clarification'))::int AS active,
      count(*) FILTER (WHERE status IN ('ready','approved','rejected','registered'))::int AS ready
    FROM requests WHERE student_id=$1`, [actor.id]);
  return requestList.parse({ items, nextCursor, counts });
}

export async function todayRequest(actor: Actor, now: Date) {
  const { rows } = await getPool().query(`
    SELECT ${summary} FROM requests WHERE student_id = $1
      AND (status IN ('submitted', 'in_progress', 'needs_clarification')
        OR (status = 'ready'
          AND updated_at BETWEEN $2::timestamptz - interval '168 hours' AND $2::timestamptz))
    ORDER BY (status = 'ready'), updated_at DESC, id DESC LIMIT 1
  `, [actor.id, now]);
  return requestSummary.nullable().parse(rows[0] ?? null);
}

export async function detail(actor: Actor, id: string) {
  // One statement keeps the visible status and its history on the same database snapshot.
  const { rows } = await getPool().query(`
    SELECT ${summary}, version, payload, (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'version', h.version, 'fromStatus', h.from_status, 'toStatus', h.to_status,
        'actorKind', h.actor_kind, 'reason', h.reason, 'createdAt', h.created_at
      ) ORDER BY h.version), '[]'::jsonb)
      FROM request_history h WHERE h.request_id = requests.id
    ) AS history
    FROM requests WHERE id = $1 AND student_id = $2
  `, [id, actor.id]);
  const row = rows[0];
  if (!row) throw new HttpError(404, "NOT_FOUND");
  return requestDetail.parse({
    ...row, history: row.history.map((item: { createdAt: string }) => ({ ...item, createdAt: new Date(item.createdAt) })),
  });
}

export async function recordEvent(
  client: PoolClient, request: { id: string; studentId: string; publicNo: string; version: number },
  from: RequestSummary["status"] | null, to: RequestSummary["status"],
  by: "student" | "system", reason: string | null, at: Date,
) {
  await client.query(`
    INSERT INTO request_history (request_id, version, from_status, to_status, actor_kind, reason, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [request.id, request.version, from, to, by, reason, at]);
  await client.query(`
    INSERT INTO notifications (student_id, kind, important, title, body, request_id, source_key, published_at)
    VALUES ($1, 'request_update', $2, $3, $4, $5, $6, $7)
  `, [request.studentId, to === "needs_clarification" || to === "ready",
    `${request.publicNo} · ${statusLabel[to]}`, reason ?? nextStep[to],
    request.id, `request:${request.id}:${request.version}`, at]);
}

async function previousOperation(
  client: PoolClient, actor: Actor, action: "create" | "clarify", key: string, fingerprint: Buffer,
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`request:${actor.id}:${action}:${key}`]);
  const { rows } = await client.query(`
    SELECT r.id, r.public_no AS "publicNo", o.fingerprint
    FROM request_operations o JOIN requests r ON (r.student_id, r.id) = (o.student_id, o.result_request_id)
    WHERE o.student_id = $1 AND o.action = $2 AND o.operation_key = $3
  `, [actor.id, action, key]);
  if (!rows[0]) return null;
  if (!fingerprint.equals(rows[0].fingerprint)) throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
  return requestResult.parse(rows[0]);
}

async function saveOperation(client: PoolClient, actor: Actor, action: string, key: string, fingerprint: Buffer, id: string, now: Date) {
  await client.query(`
    INSERT INTO request_operations (student_id, action, operation_key, fingerprint, result_request_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [actor.id, action, key, fingerprint, id, now]);
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest();
export async function submit(actor: Actor, key: string, input: z.output<typeof createRequest>) {
  return transaction(async (client) => {
    await lockSession(client, actor);
    const fingerprint = digest(input);
    const previous = await previousOperation(client, actor, "create", key, fingerprint);
    if (previous) return { result: previous, created: false };
    const { rows: [service] } = await client.query<{ active: boolean; contract_version: number }>(
      "SELECT active, contract_version FROM service_catalog WHERE code = $1 FOR SHARE", [input.kind],
    );
    if (!service?.active) throw new HttpError(409, "SERVICE_UNAVAILABLE");
    if (service.contract_version !== input.payload.schemaVersion) throw new HttpError(409, "SERVICE_VERSION_CONFLICT");
    const { rows: [{ today }] } = await client.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS today");
    if ((input.kind === "dormitory" || input.kind === "academic_leave") && input.payload.startDate < today) throw new HttpError(422, "PAST_DATE");
    if (input.kind === "travel_compensation" && input.payload.travelDate > today) throw new HttpError(422, "FUTURE_TRAVEL");
    let payload: z.output<typeof createRequest>["payload"] | z.output<typeof consultationPayload> = input.payload;
    if (input.kind === "consultation_reschedule") {
      const { rows: [item] } = await client.query<{ title: string }>(`
        SELECT d.title FROM study_plan_items p
        JOIN disciplines d ON d.id = p.discipline_id
        JOIN semesters s ON s.id = d.semester_id
        WHERE p.id = $1 AND p.student_id = $2 AND s.is_current
      `, [input.payload.planId, actor.id]);
      if (!item) throw new HttpError(404, "NOT_FOUND");
      payload = consultationPayload.parse({ ...input.payload, discipline: item.title });
    }
    const { rows } = await client.query(`
      WITH stamp AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS now, nextval('request_number')::text AS seq)
      INSERT INTO requests (student_id, public_no, kind, payload, status, version, next_transition_at, created_at, updated_at)
      SELECT $1, $2 || '-' || extract(year FROM now AT TIME ZONE 'Europe/Moscow')::text || '-' ||
        lpad(seq, greatest(4, length(seq)), '0'), $3, $4, 'submitted', 1, now + interval '20 seconds', now, now
      FROM stamp RETURNING id, public_no AS "publicNo", created_at AS now
    `, [actor.id, isCertificate(input.kind) ? "СП" : "ЗА", input.kind, payload]);
    const result = requestResult.parse(rows[0]);
    await recordEvent(client, { ...result, studentId: actor.id, version: 1 }, null, "submitted", "student", null, rows[0].now);
    await saveOperation(client, actor, "create", key, fingerprint, result.id, rows[0].now);
    return { result, created: true };
  });
}

export async function clarify(actor: Actor, id: string, key: string, input: z.output<typeof clarifyRequest>) {
  return transaction(async (client) => {
    await lockSession(client, actor);
    if (!(await client.query("SELECT FROM requests WHERE student_id = $1 AND id = $2", [actor.id, id])).rowCount) {
      throw new HttpError(404, "NOT_FOUND");
    }
    const fingerprint = digest({ id, ...input });
    const previous = await previousOperation(client, actor, "clarify", key, fingerprint);
    if (previous) return previous;
    const { rows: [row] } = await client.query(`
      SELECT id, public_no AS "publicNo", status, version, payload, kind
      FROM requests WHERE student_id = $1 AND id = $2 FOR UPDATE
    `, [actor.id, id]);
    if (!row) throw new HttpError(404, "NOT_FOUND");
    if (row.status !== "needs_clarification" || row.version !== input.expectedVersion || row.kind !== "consultation_reschedule") {
      throw new HttpError(409, "VERSION_CONFLICT");
    }
    const payload = consultationPayload.parse({ ...row.payload, choice: input.choice });
    const { rows: [updated] } = await client.query(`
      WITH stamp AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS now)
      UPDATE requests SET payload = $3, status = 'in_progress', version = version + 1,
        updated_at = now, next_transition_at = now + interval '20 seconds'
      FROM stamp WHERE student_id = $1 AND id = $2 RETURNING version, updated_at AS now
    `, [actor.id, id, payload]);
    const result = requestResult.parse(row);
    await recordEvent(client, { ...result, studentId: actor.id, version: updated.version },
      "needs_clarification", "in_progress", "student", "Ответ на уточнение получен.", updated.now);
    await client.query(`
      INSERT INTO deadline_completions (student_id, deadline_id, completed_at)
      SELECT $1, id, $3 FROM deadlines WHERE student_id = $1 AND request_id = $2 AND published_at <= $3
      ON CONFLICT DO NOTHING
    `, [actor.id, id, updated.now]);
    await saveOperation(client, actor, "clarify", key, fingerprint, id, updated.now);
    return result;
  });
}
