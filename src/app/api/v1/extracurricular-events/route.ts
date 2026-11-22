import { extracurricularQuery, extracurricularResponse } from "@/contracts/extracurricular-events";
import { handle, HttpError, json, requireActor } from "@/server/auth/service";
import { visibleEvents } from "@/server/publications/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const fields = Object.fromEntries(Array.from(params.keys(), (key) => [
      key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key),
    ]));
    const query = extracurricularQuery.safeParse(fields);
    if (!query.success) throw new HttpError(422, "INVALID_FIELDS");
    return json(extracurricularResponse.parse({ items: await visibleEvents(actor, query.data) }));
  });
}
