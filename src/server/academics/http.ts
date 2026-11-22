import "server-only";
import { z } from "zod";
import { visibilityNow } from "@/server/clock";
import { atlasSharedScheduleGroup, scheduleQuery, studyQuery, todayQuery } from "@/contracts/academics";
import { todayRequest } from "@/server/requests/store";
import { dateInMoscow } from "@/contracts/calendar";
import { handle, HttpError, json, requireActor } from "@/server/auth/service";
import { lessonDetail, lessonToday, listAtlasSharedLessons, listLessons, listTeacherLessons } from "./schedule";
import { deadlineToday, disciplineDetail, studyCards, studyList, studyToday } from "./study";
import { NextResponse } from "next/server";
import { calendarFile } from "./ical";
import { listDeadlines } from "./deadlines";

function parseQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  const fields = Object.fromEntries(Array.from(params.keys(), (key) => [
    key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key),
  ]));
  const parsed = schema.safeParse(fields);
  if (!parsed.success) throw new HttpError(422, "INVALID_FIELDS");
  return parsed.data;
}

function idParam(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
  return id;
}

function timedJson(data: unknown, time: Date) {
  const response = json(data);
  response.headers.set("X-Academic-Now", time.toISOString());
  return response;
}

export const getLessons = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const { date, view, group } = parseQuery(request, scheduleQuery.extend({ group: z.literal(atlasSharedScheduleGroup.slug).optional() }));
  const time = visibilityNow();
  const day = date ?? dateInMoscow(time);
  const schedule = group ? await listAtlasSharedLessons(day, view, time)
    : await listLessons(actor, day, view, time, { includeRules: true });
  return timedJson(schedule, time);
});
export const getDeadlines = (request: Request) => handle(async () => {
  const actor = await requireActor();
  parseQuery(request, z.strictObject({}));
  const now = visibilityNow();
  return timedJson(await listDeadlines(actor, now), now);
});
export const getCalendar = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const { date, teacher, group } = parseQuery(request, scheduleQuery.omit({ view: true }).extend({
    teacher: z.uuid().optional(),
    group: z.literal(atlasSharedScheduleGroup.slug).optional(),
  }).refine(fields => !(fields.teacher && fields.group)));
  const now = visibilityNow();
  const day = date ?? dateInMoscow(now);
  const schedule = teacher ? await listTeacherLessons(actor, teacher, day, "week", now)
    : group ? await listAtlasSharedLessons(day, "week", now)
      : await listLessons(actor, day, "week", now);
  return new NextResponse(calendarFile(schedule.items, schedule.start, schedule.end, now), { headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="schedule-${schedule.start}.ics"`,
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
  } });
});
export const getLesson = (id: string) => handle(async () => {
  const actor = await requireActor();
  return json(await lessonDetail(actor, idParam(id), visibilityNow()));
});
export const getStudy = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const { semester, view, subject } = parseQuery(request, studyQuery);
  const now = visibilityNow();
  return json(view === "cards" ? await studyCards(actor, semester, subject, now) : await studyList(actor, semester, now));
});
export const getDiscipline = (id: string) => handle(async () => {
  const actor = await requireActor();
  return json(await disciplineDetail(actor, idParam(id), visibilityNow()));
});
export const getToday = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const { block } = parseQuery(request, todayQuery);
  const time = visibilityNow();
  if (block === "request") return json(await todayRequest(actor, time));
  if (block === "lesson") return timedJson(await lessonToday(actor, time), time);
  if (block === "deadline") return timedJson(await deadlineToday(actor, time), time);
  return json(await studyToday(actor, time));
});
