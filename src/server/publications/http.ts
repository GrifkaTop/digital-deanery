import "server-only";
import { z } from "zod";
import { eventItem, eventList, newsItem, newsList } from "@/contracts/publications";
import { handle, HttpError, json, requireActor, type Actor } from "@/server/auth/service";
import { getPool } from "@/server/db";
import { visibilityNow } from "@/server/clock";
export const eventVisibility = `e.status='published' AND e.published_at <= $2 AND
 (NOT EXISTS (SELECT FROM event_audiences a WHERE a.event_id=e.id) OR EXISTS (SELECT FROM event_audiences a WHERE a.event_id=e.id AND a.group_id=$1))`;
const eventSelect = `SELECT e.id, e.title, e.starts_on::text AS "startsOn", e.ends_on::text AS "endsOn", e.starts_at AS "startsAt", e.ends_at AS "endsAt", e.kind, e.place, e.summary, e.body, e.participation, e.cover, e.published_at AS "publishedAt" FROM extracurricular_events e WHERE ${eventVisibility}`;
const newsSelect = `SELECT n.id,n.title,n.summary,n.body,n.category,n.pinned,n.published_at AS "publishedAt",n.author,
 (SELECT e.id FROM extracurricular_events e WHERE e.id=n.event_id AND ${eventVisibility}) AS "eventId"
 FROM news_posts n WHERE n.status='published' AND n.published_at <= $2 AND
 (NOT EXISTS (SELECT FROM news_audiences a WHERE a.news_id=n.id) OR EXISTS (SELECT FROM news_audiences a WHERE a.news_id=n.id AND a.group_id=$1))`;
export async function visibleEvents(actor: Actor, range?: {from: string; to: string}) {
 return (await getPool().query(eventSelect + (range ? ' AND e.starts_on <= $4::date AND e.ends_on >= $3::date' : '') + ' ORDER BY e.starts_on,e.id', [actor.group_id, visibilityNow(), ...(range ? [range.from,range.to] : [])])).rows;
}
export const getPublications = (kind: "events" | "news", request: Request, id?: string) => handle(async () => {
 const actor=await requireActor();
 if (id !== undefined && !z.uuid().safeParse(id).success) throw new HttpError(404,"NOT_FOUND");
 if (new URL(request.url).search) throw new HttpError(422,"INVALID_FIELDS");
 const alias=kind === "events" ? "e" : "n";
 const rows=(await getPool().query((kind === "events" ? eventSelect : newsSelect) + (id ? ` AND ${alias}.id=$3` : kind === "events" ? ' ORDER BY e.starts_on,e.id' : ' ORDER BY n.pinned DESC,n.published_at DESC,n.id'), [actor.group_id,visibilityNow(),...(id ? [id] : [])])).rows;
 if(id && !rows.length) throw new HttpError(404,"NOT_FOUND");
 return json(id ? (kind === "events" ? eventItem.parse(rows[0]) : newsItem.parse(rows[0])) : (kind === "events" ? eventList.parse({items:rows}) : newsList.parse({items:rows})));
});
