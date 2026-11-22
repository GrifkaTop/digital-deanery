import { z } from "zod";

const date = z.iso.date().refine((value) => Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2199);

export const extracurricularQuery = z.strictObject({ from: date, to: date })
  .refine(({ from, to }) => from <= to);

export const extracurricularResponse = z.object({
  items: z.array(z.object({
    id: z.uuid(),
    title: z.string().trim().min(1),
    startsOn: date,
    endsOn: date,
  })),
});
