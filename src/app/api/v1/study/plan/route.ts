import { readStudyPlan } from "@/server/academics/study-plan";
import { handle, json, requireActor } from "@/server/auth/service";
import { visibilityNow } from "@/server/clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => handle(async () => {
  try {
    return json(await readStudyPlan(await requireActor(), visibilityNow()));
  } catch (error) {
    console.error("Study plan request failed", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
});
