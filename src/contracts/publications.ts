import { z } from "zod";
const timestamp = z.preprocess(v => v instanceof Date ? v.toISOString() : v, z.iso.datetime());
export const coverSchema = z.object({ src: z.string().regex(/^\/prototype-assets\/[a-zA-Z0-9_.-]+$/), alt: z.string(), credit: z.string(), source: z.url().startsWith("https://"), license: z.url().startsWith("https://") });
export const eventItem = z.object({ id: z.uuid(), title: z.string(), startsOn: z.iso.date(), endsOn: z.iso.date(), startsAt: timestamp.nullable(), endsAt: timestamp.nullable(), kind: z.string(), place: z.string(), summary: z.string(), body: z.string(), participation: z.string(), cover: coverSchema.nullable(), publishedAt: timestamp });
export const newsItem = z.object({ id: z.uuid(), title: z.string(), summary: z.string(), body: z.string(), category: z.string(), pinned: z.boolean(), publishedAt: timestamp, author: z.string(), eventId: z.uuid().nullable() });
export const eventList = z.object({ items: eventItem.array() });
export const newsList = z.object({ items: newsItem.array() });
