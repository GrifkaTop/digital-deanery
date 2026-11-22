import { z } from "zod";
const timestamp = z.preprocess(value => value instanceof Date ? value.toISOString() : value, z.iso.datetime());
const normFields = { id: z.string(), title: z.string(), unit: z.string(), direction: z.enum(["higher","lower"]) };
const sportsNorm = z.discriminatedUnion("status", [
  z.object({ ...normFields, status: z.literal("unattempted"), result: z.null() }),
  z.object({ ...normFields, status: z.enum(["passed","failed"]), result: z.number() }),
]);

export const sportsList = z.object({ now: timestamp, items: z.array(z.object({
  teacherId: z.uuid().nullable(), teacherName: z.string().nullable(),
  id: z.uuid(), kind: z.enum(["class", "makeup", "pool"]), title: z.string(),
  startsAt: timestamp, endsAt: timestamp, place: z.string(), capacity: z.number().int(),
  available: z.number().int().nonnegative(), bookingOpen: z.boolean(),
  booking: z.enum(["active", "cancelled"]).nullable(), attended: z.boolean().nullable(),
})), passport: z.object({ validUntil: z.iso.date(), admitted: z.boolean(), medicalGroup: z.string().nullable() }).nullable(),
  results: z.array(z.object({
    semesterId: z.uuid(), label: z.string(), isCurrent: z.boolean(),
    startsOn: z.iso.date(), endsOn: z.iso.date(),
    targetAttendance: z.number().int().nonnegative().nullable(),
    attendance: z.number().int().nonnegative(), score: z.number().nullable(), result: z.string().nullable(),
    minimumPoints: z.number().int().nonnegative().nullable().optional(), priorSemesterId: z.uuid().nullable().optional(),
    norms: sportsNorm.array().optional(),
  })) });
