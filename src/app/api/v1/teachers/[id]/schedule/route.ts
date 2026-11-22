import { z } from "zod";
import { scheduleQuery } from "@/contracts/academics";
import { dateInMoscow } from "@/contracts/calendar";
import { listTeacherLessons } from "@/server/academics/schedule";
import { handle, HttpError, json, requireActor } from "@/server/auth/service";
import { visibilityNow } from "@/server/clock";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
    const params = new URL(request.url).searchParams;
    const fields = Object.fromEntries(Array.from(params.keys(), key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)]));
    const parsed = scheduleQuery.safeParse(fields);
    if (!parsed.success) throw new HttpError(422, "INVALID_FIELDS");
    const now = visibilityNow();
    const schedule = await listTeacherLessons(actor, id, parsed.data.date ?? dateInMoscow(now), parsed.data.view, now);
    const response = json(schedule);
    response.headers.set("X-Academic-Now", now.toISOString());
    return response;
  });
}
