import "server-only";
import { NextResponse } from "next/server";
import { clinicAfkSample, clinicCommand, clinicOverview, type ClinicCommand } from "@/contracts/clinic";
import { checkCsrf, handle, HttpError, json, lockSession, requireActor, type Actor } from "@/server/auth/service";
import { visibilityNow } from "@/server/clock";
import { getPool } from "@/server/db";
import { transaction } from "@/server/db/transaction";
import { healthPassport } from "@/server/sports/http";
import { clinicAfkSampleBody } from "./sample";

type SlotRow = { id: string; startsAt: Date; endsAt: Date };
type DoctorRow = { id: string; faculty: string; name: string; place: string };
type AppointmentRow = SlotRow & { doctor: DoctorRow };
type CompletionRow = { completedAt: Date; passportUpdatedAt: Date | null };
type AfkRow = { submittedAt: Date; documentKey: string; status: string; publishedAt: Date | null; startsOn: string | null; endsOn: string | null };

async function readClinic(actor: Actor, now: Date) {
  const pool = getPool();
  const [doctors, slots, appointments, completions, passport, requests] = await Promise.all([
    pool.query<DoctorRow>("SELECT id,faculty,name,place FROM clinic_doctors WHERE faculty=$1", [actor.faculty]),
    pool.query<SlotRow>(`SELECT s.id,s.starts_at AS "startsAt",s.ends_at AS "endsAt"
      FROM clinic_slots s JOIN clinic_doctors d ON d.id=s.doctor_id
      WHERE d.faculty=$1 AND s.starts_at>$2 AND NOT EXISTS (
        SELECT FROM clinic_appointments a WHERE a.slot_id=s.id AND a.cancelled_at IS NULL
      ) ORDER BY s.starts_at,s.id`, [actor.faculty, now]),
    pool.query<AppointmentRow>(`SELECT s.id,s.starts_at AS "startsAt",s.ends_at AS "endsAt",
        jsonb_build_object('id',d.id,'faculty',d.faculty,'name',d.name,'place',d.place) AS doctor
      FROM clinic_appointments a JOIN clinic_slots s ON s.id=a.slot_id JOIN clinic_doctors d ON d.id=s.doctor_id
      WHERE a.student_id=$1 AND a.cancelled_at IS NULL AND a.completed_at IS NULL`, [actor.id]),
    pool.query<CompletionRow>(`SELECT completed_at AS "completedAt",
          CASE WHEN passport_updated_at<=$2 THEN passport_updated_at END AS "passportUpdatedAt"
      FROM clinic_appointments WHERE student_id=$1 AND completed_at<=$2
      ORDER BY completed_at DESC,slot_id LIMIT 1`, [actor.id, now]),
    healthPassport(actor),
    pool.query<AfkRow>(`SELECT submitted_at AS "submittedAt",document_key AS "documentKey",status,
        published_at AS "publishedAt",starts_on::text AS "startsOn",ends_on::text AS "endsOn"
      FROM clinic_afk_requests WHERE student_id=$1`, [actor.id]),
  ]);
  const appointment = appointments.rows[0] ?? null;
  const request = requests.rows[0];
  const afk = request && (request.publishedAt && request.publishedAt <= now
    ? request : { status: "submitted", submittedAt: request.submittedAt, documentKey: request.documentKey });
  return clinicOverview.parse({
    now, doctor: doctors.rows[0] ?? null, slots: appointment ? [] : slots.rows, appointment,
    completion: completions.rows[0] ?? null, passport, afk: afk ?? null,
  });
}

async function changeClinic(actor: Actor, command: ClinicCommand, now: Date) {
  await transaction(async client => {
    await lockSession(client, actor);
    await client.query("SELECT id FROM students WHERE id=$1 FOR UPDATE", [actor.id]);
    if (command.action === "request_afk") {
      await client.query(`INSERT INTO clinic_afk_requests(student_id,submitted_at,document_key)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [actor.id, now, command.documentKey]);
      return;
    }
    if (command.action === "cancel") {
      const { rows: [existing] } = await client.query<{ startsAt: Date; cancelledAt: Date | null; completedAt: Date | null }>(
        `SELECT s.starts_at AS "startsAt",a.cancelled_at AS "cancelledAt",a.completed_at AS "completedAt"
        FROM clinic_appointments a JOIN clinic_slots s ON s.id=a.slot_id
        WHERE a.student_id=$1 AND a.slot_id=$2 FOR UPDATE OF s`, [actor.id, command.slotId]);
      if (!existing) throw new HttpError(404, "NOT_FOUND");
      if (existing.cancelledAt) return;
      if (existing.completedAt || existing.startsAt <= now) throw new HttpError(409, "CLINIC_BOOKING_CLOSED");
      await client.query("UPDATE clinic_appointments SET cancelled_at=$3 WHERE student_id=$1 AND slot_id=$2", [actor.id, command.slotId, now]);
      return;
    }

    const { rows: [slot] } = await client.query<{ startsAt: Date }>(
      `SELECT s.starts_at AS "startsAt" FROM clinic_slots s JOIN clinic_doctors d ON d.id=s.doctor_id
      JOIN students st ON st.id=$2 JOIN groups g ON g.id=st.group_id AND g.faculty=d.faculty
      WHERE s.id=$1 FOR UPDATE OF s`, [command.slotId, actor.id]);
    if (!slot) throw new HttpError(404, "NOT_FOUND");
    const { rows: [existing] } = await client.query<{ slot_id: string }>(
      "SELECT slot_id FROM clinic_appointments WHERE student_id=$1 AND cancelled_at IS NULL AND completed_at IS NULL", [actor.id]);
    if (existing?.slot_id === command.slotId) return;
    if (slot.startsAt <= now) throw new HttpError(404, "NOT_FOUND");
    if (existing) throw new HttpError(409, "CLINIC_ALREADY_BOOKED");
    const occupied = await client.query("SELECT FROM clinic_appointments WHERE slot_id=$1 AND cancelled_at IS NULL", [command.slotId]);
    if (occupied.rowCount) throw new HttpError(409, "CLINIC_SLOT_TAKEN");
    await client.query(`INSERT INTO clinic_appointments(student_id,slot_id,booked_at) VALUES($1,$2,$3)
      ON CONFLICT(student_id,slot_id) DO UPDATE SET booked_at=EXCLUDED.booked_at,cancelled_at=NULL
      WHERE clinic_appointments.cancelled_at IS NOT NULL`, [actor.id, command.slotId, now]);
  });
}

function noQuery(request: Request) {
  if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
}

export const getClinic = (request: Request) => handle(async () => {
  const actor = await requireActor();
  noQuery(request);
  return json(await readClinic(actor, visibilityNow()));
});

export const postClinic = (request: Request) => handle(async () => {
  const actor = await requireActor();
  await checkCsrf(request);
  noQuery(request);
  if (request.headers.get("content-type")?.split(";")[0].toLowerCase() !== "application/json") throw new HttpError(415, "INVALID_CONTENT_TYPE");
  if (Number(request.headers.get("content-length") ?? 0) > 512) throw new HttpError(422, "INVALID_FIELDS");
  const text = await request.text();
  if (text.length > 512) throw new HttpError(422, "INVALID_FIELDS");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new HttpError(400, "INVALID_JSON"); }
  const command = clinicCommand.safeParse(input);
  if (!command.success) throw new HttpError(422, "INVALID_FIELDS");
  const now = visibilityNow();
  await changeClinic(actor, command.data, now);
  return json(await readClinic(actor, now));
});

export const getClinicSample = (request: Request) => handle(async () => {
  await requireActor();
  noQuery(request);
  return new NextResponse(clinicAfkSampleBody, { headers: {
    "Cache-Control": "no-store, private",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": 'attachment; filename="' + clinicAfkSample.name + '"',
    "X-Content-Type-Options": "nosniff",
  } });
});
