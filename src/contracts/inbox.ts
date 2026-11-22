import { z } from "zod";
import { lessonKinds } from "./academics";

export const notificationKinds = ["announcement", "schedule_change", "deadline", "request_update", "assignment_result"] as const;
export const notificationLabels = {
  announcement: "Объявление", schedule_change: "Изменение расписания", deadline: "Дедлайн", request_update: "Заявка", assignment_result: "Проверенная работа",
};
export const inboxFilter = z.enum(["all", "important", "deadlines"]);
const timestamp = z.preprocess((value) => value instanceof Date ? value.toISOString() : value, z.iso.datetime());
const context = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("grade"), workKind: z.string(), number: z.number().int().positive().nullable(),
    subject: z.string(), title: z.string(), points: z.number().nonnegative(), maxPoints: z.number().nonnegative().nullable(),
  }),
  z.object({ type: z.literal("work_deadline"), workKind: z.string() }),
  z.object({
    type: z.literal("room_change"), title: z.string(), kind: z.enum(lessonKinds),
    startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
    room: z.string(), building: z.string().nullable(), previousRoom: z.string(), previousBuilding: z.string().nullable(),
  }),
]);
const item = z.object({
  id: z.uuid(), kind: z.enum(notificationKinds), important: z.boolean(), title: z.string(),
  publishedAt: timestamp, readAt: timestamp.nullable(), dueAt: timestamp.nullable(),
  context: context.nullable().optional(),
});
export const inboxList = z.object({
  items: item.array(), unreadCount: z.number().int().nonnegative(), nextCursor: z.string().nullable(),
});
export const inboxCount = inboxList.pick({ unreadCount: true });
export const inboxDetail = item.extend({
  body: z.string(),
  target: z.object({ kind: z.enum(["lesson", "discipline", "assignment", "request"]), id: z.uuid() }).nullable(),
});
export const inboxCursor = z.strictObject({
  priority: z.union([z.literal(0), z.literal(1)]), orderValue: z.string().regex(/^-?\d{1,16}(?:\.\d{1,6})?$/),
  publishedAt: z.iso.datetime(), id: z.uuid(),
});
