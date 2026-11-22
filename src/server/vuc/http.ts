import "server-only";
import { vucCommand, vucExerciseResults, vucOverview, vucStudy, type VucCommand, type VucOverview, type VucSlot } from "@/contracts/vuc";
import { checkCsrf, handle, HttpError, json, lockSession, requireActor, type Actor } from "@/server/auth/service";
import { visibilityNow } from "@/server/clock";
import { getPool } from "@/server/db";
import { transaction } from "@/server/db/transaction";

type SlotRow = { id: string; startsAt: Date; endsAt: Date; place: string };
type ApplicationRow = {
  submittedAt: Date;
  slotId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  place: string | null;
  physicalScore: number | null;
  academicScore: number | null;
  exercises: unknown;
  resultsPublishedAt: Date | null;
  decision: "admitted" | "not_admitted" | null;
  decidedAt: Date | null;
};

function presentSlot(row: SlotRow): VucSlot {
  return { id: row.id, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), place: row.place };
}

export function presentVucApplication(row: ApplicationRow, slots: SlotRow[], now: Date): VucOverview {
  const appointment = row.slotId && row.startsAt && row.endsAt && row.place
    ? presentSlot({ id: row.slotId, startsAt: row.startsAt, endsAt: row.endsAt, place: row.place }) : null;
  const publication = row.resultsPublishedAt && row.resultsPublishedAt <= now ? row.resultsPublishedAt : null;
  const results = publication && row.physicalScore !== null && row.academicScore !== null ? {
    physicalScore: row.physicalScore, academicScore: row.academicScore, total: row.physicalScore + row.academicScore,
    exercises: vucExerciseResults.parse(row.exercises), publishedAt: publication.toISOString(),
  } : null;
  const decision = row.decision && row.decidedAt && row.decidedAt <= now && results ? row.decision : null;
  const status = decision ?? (results ? "results_published"
    : appointment ? (Date.parse(appointment.endsAt) <= now.getTime() ? "awaiting_results" : "scheduled") : "submitted");
  return vucOverview.parse({
    status, submittedAt: row.submittedAt.toISOString(), appointment,
    availableSlots: status === "submitted" ? slots.map(presentSlot) : [],
    results, decidedAt: decision ? row.decidedAt?.toISOString() ?? null : null,
  });
}

async function readApplication(actor: Actor, now: Date) {
  const { rows: [application] } = await getPool().query<ApplicationRow>(`
    SELECT a.submitted_at AS "submittedAt", a.slot_id AS "slotId", s.starts_at AS "startsAt",
      s.ends_at AS "endsAt", s.place, a.physical_score AS "physicalScore",
      a.academic_score AS "academicScore", a.exercises, a.results_published_at AS "resultsPublishedAt",
      a.decision, a.decided_at AS "decidedAt"
    FROM vuc_applications a LEFT JOIN vuc_test_slots s ON s.id=a.slot_id
    WHERE a.student_id=$1
  `, [actor.id]);
  if (!application) {
    return vucOverview.parse({ status: "not_applied", submittedAt: null, appointment: null,
      availableSlots: [], results: null, decidedAt: null });
  }
  const slots = application.slotId ? [] : (await getPool().query<SlotRow>(`
    SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", place
    FROM vuc_test_slots WHERE starts_at>$1 ORDER BY starts_at,id
  `, [now])).rows;
  return presentVucApplication(application, slots, now);
}

async function updateApplication(actor: Actor, command: VucCommand, now: Date) {
  await transaction(async client => {
    await lockSession(client, actor);
    await client.query("SELECT id FROM students WHERE id=$1 FOR UPDATE", [actor.id]);
    if (command.action === "apply") {
      await client.query("INSERT INTO vuc_applications(student_id,submitted_at) VALUES($1,$2) ON CONFLICT DO NOTHING", [actor.id, now]);
      return;
    }
    const { rows: [application] } = await client.query<{ slotId: string | null }>(
      'SELECT slot_id AS "slotId" FROM vuc_applications WHERE student_id=$1 FOR UPDATE', [actor.id]);
    if (!application) throw new HttpError(409, "APPLICATION_REQUIRED");
    if (application.slotId === command.slotId) return;
    if (application.slotId) throw new HttpError(409, "ALREADY_BOOKED");
    const slot = await client.query("SELECT id FROM vuc_test_slots WHERE id=$1 AND starts_at>$2 FOR SHARE", [command.slotId, now]);
    if (!slot.rowCount) throw new HttpError(404, "NOT_FOUND");
    await client.query("UPDATE vuc_applications SET slot_id=$2,booked_at=$3 WHERE student_id=$1", [actor.id, command.slotId, now]);
  });
}

const noQuery = (request: Request) => {
  if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
};

export const getVuc = (request: Request) => handle(async () => {
  const actor = await requireActor();
  noQuery(request);
  return json(await readApplication(actor, visibilityNow()));
});

export const postVuc = (request: Request) => handle(async () => {
  const actor = await requireActor();
  await checkCsrf(request);
  noQuery(request);
  const text = await request.text();
  if (text.length > 4096) throw new HttpError(422, "INVALID_FIELDS");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new HttpError(400, "INVALID_JSON"); }
  const parsed = vucCommand.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "INVALID_FIELDS");
  const now = visibilityNow();
  await updateApplication(actor, parsed.data, now);
  return json(await readApplication(actor, now));
});

const admittedStudy = vucStudy.parse({
  schedule: [
    { title: "Организационная встреча", startsAt: "2027-02-03T13:00:00Z", endsAt: "2027-02-03T13:45:00Z", place: "Корпус «Маяк» · 204" },
    { title: "Вводный учебный семинар", startsAt: "2027-02-10T13:00:00Z", endsAt: "2027-02-10T14:30:00Z", place: "Корпус «Маяк» · 208" },
  ],
  requirements: ["Сверьте расписание в кабинете перед первой встречей.", "Познакомьтесь с учебной группой и уточните порядок занятий на встрече."],
});

export const getVucStudy = (request: Request) => handle(async () => {
  const actor = await requireActor();
  noQuery(request);
  const now = visibilityNow();
  const result = await getPool().query(`
    SELECT FROM vuc_applications
    WHERE student_id=$1 AND decision='admitted' AND decided_at<=$2 AND results_published_at<=$2
  `, [actor.id, now]);
  if (!result.rowCount) throw new HttpError(404, "NOT_FOUND");
  return json(admittedStudy);
});
