import { z } from "zod";
import { createRequest } from "./requests";

const serviceItem = z.object({
  code: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  contractVersion: z.number().int().positive(),
});

export const serviceList = z.object({ items: serviceItem.array() });
export type Service = z.infer<typeof serviceItem>;
export type CreateRequestKind = z.output<typeof createRequest>["kind"];

export function serviceFormKind(service: Service): CreateRequestKind | undefined {
  const form = createRequest.options.find(({ shape }) => shape.kind.value === service.code);
  if (form?.shape.payload.shape.schemaVersion.safeParse(service.contractVersion).success) {
    return form.shape.kind.value;
  }
}
