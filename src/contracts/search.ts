import { z } from "zod";
export const searchResponse = z.object({
  items: z.array(z.object({ type: z.enum(["discipline", "teacher", "section"]), id: z.string(), title: z.string() })),
});
