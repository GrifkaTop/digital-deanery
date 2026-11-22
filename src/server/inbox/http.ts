import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inboxFilter } from "@/contracts/inbox";
import { checkCsrf, handle, HttpError, json, requireActor } from "@/server/auth/service";
import { visibilityNow } from "@/server/clock";
import { getInboxItem, listInbox, markInboxRead } from "./store";

const querySchema = z.strictObject({
  filter: inboxFilter.default("all"),
  cursor: z.string().regex(/^[\w-]{1,400}$/).optional(),
});
function idParam(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "NOT_FOUND");
  return id;
}
export const getInbox = (request: Request) => handle(async () => {
  const actor = await requireActor();
  const params = new URL(request.url).searchParams;
  const input = querySchema.safeParse(Object.fromEntries([...params.keys()].map((key) => {
    const values = params.getAll(key);
    return [key, values.length === 1 ? values[0] : values];
  })));
  if (!input.success) throw new HttpError(422, "INVALID_FIELDS");
  return json(await listInbox(actor, visibilityNow(), input.data.filter, input.data.cursor));
});
export const getNotice = (id: string) => handle(async () =>
  json(await getInboxItem(await requireActor(), visibilityNow(), idParam(id))));
export const readNotice = (request: Request, id: string) => markRead(request, id);
export const readAllNotices = (request: Request) => markRead(request, null);

const markRead = (request: Request, id: string | null) => handle(async () => {
  const actor = await requireActor();
  await checkCsrf(request);
  await markInboxRead(actor, visibilityNow(), id === null ? null : idParam(id));
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store, private" } });
});
