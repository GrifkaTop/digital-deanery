import { NextResponse } from "next/server";
import { z } from "zod";
import { atlasSharedScheduleGroup } from "@/contracts/academics";
import { mondayOf } from "@/contracts/calendar";
import { handle, json, requireActor } from "@/server/auth/service";

const week = z.iso.date();
const querySchema = z.discriminatedUnion("scope", [
  z.strictObject({ week, scope: z.literal("own") }),
  z.strictObject({ week, scope: z.literal("group"), id: z.literal(atlasSharedScheduleGroup.slug) }),
  z.strictObject({ week, scope: z.literal("teacher"), id: z.uuid() }),
]);

export function GET(request: Request) {
  return handle(async () => {
    await requireActor();
    const { searchParams } = new URL(request.url);
    if (new Set(searchParams.keys()).size !== searchParams.size) {
      return json({ error: "Неверные параметры расписания" }, 400);
    }
    const query = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!query.success) return json({ error: "Неверные параметры расписания" }, 400);

    const { week, scope } = query.data;
    if (mondayOf(week) !== week) return json({ error: "Укажите дату понедельника" }, 400);

    const canonical = new URLSearchParams({ date: week });
    if (scope !== "own") canonical.set(scope, query.data.id);
    return new NextResponse(null, { status: 307, headers: {
      Location: "/api/v1/lessons/calendar?" + canonical,
      "Cache-Control": "no-store, private",
    } });
  });
}