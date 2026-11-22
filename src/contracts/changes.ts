import { z } from "zod";

export const changeSnapshot = z.object({
  items: z.array(z.object({
    id: z.uuid(), kind: z.enum(["schedule_change", "request_update"]), title: z.string(), body: z.string(),
    publishedAt: z.iso.datetime(), targetId: z.uuid().nullable(),
  })),
  acknowledgement: z.string(),
});

export const changeAcknowledgement = z.strictObject({ acknowledgement: z.string().min(1).max(8192) });
