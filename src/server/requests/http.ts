import "server-only";
import { z } from "zod";
import { clarifyRequest, createRequest, requestFilter } from "@/contracts/requests";
import { checkCsrf, handle, HttpError, json, requireActor } from "@/server/auth/service";
import { clarify, detail, list, submit } from "./store";
import { downloadCertificate } from "./document";

function requestId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
  return id.toLowerCase();
}
function operationKey(request: Request) {
  const parsed = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!parsed.success) throw new HttpError(422, "INVALID_FIELDS");
  return parsed.data.toLowerCase();
}
async function body<T>(request: Request, schema: z.ZodType<T>) {
  let data: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new HttpError(422, "INVALID_FIELDS");
    data = JSON.parse(raw);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HttpError(422, "INVALID_FIELDS");
  return parsed.data;
}

export const getRequests = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const query = new URL(request.url).searchParams;
  const parsed = requestFilter.safeParse(query.get("filter") ?? "all");
  const cursor = query.get("cursor");
  if (!parsed.success || query.getAll("filter").length > 1 || query.getAll("cursor").length > 1 ||
    (cursor !== null && !/^[\w-]{1,256}$/.test(cursor)) || [...query.keys()].some((key) => key !== "filter" && key !== "cursor")) {
    throw new HttpError(422, "INVALID_FIELDS");
  }
  return json(await list(actor, parsed.data, cursor ?? undefined));
});
export const postRequest = (request: Request) => handle(async () => {
  const actor = await requireActor();
  await checkCsrf(request);
  const key = operationKey(request);
  const { result, created } = await submit(actor, key, await body(request, createRequest));
  return json(result, created ? 201 : 200);
});
export const getRequest = (id: string) => handle(async () => json(await detail(await requireActor(), requestId(id))));
export const getDocument = (id: string) => handle(async () => downloadCertificate(await requireActor(), requestId(id)));
export const postClarification = (request: Request, id: string) => handle(async () => {
  const actor = await requireActor();
  await checkCsrf(request);
  return json(await clarify(actor, requestId(id), operationKey(request), await body(request, clarifyRequest)));
});
