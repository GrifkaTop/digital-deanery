import { z } from "zod";

export const librarySubject = z.object({ id: z.uuid(), title: z.string() });
export const libraryBook = z.object({
  id: z.uuid(), title: z.string(), author: z.string(), description: z.string(),
  online: z.boolean(), available: z.number().int().nonnegative(), booked: z.boolean(),
  subjects: z.array(librarySubject),
});
export const libraryCatalog = z.object({ subjects: z.array(librarySubject), items: z.array(libraryBook) });
export const libraryBookDetail = libraryBook.extend({ content: z.string().nullable() });
export const libraryReading = z.object({ id: z.uuid(), title: z.string(), author: z.string(), content: z.string() });

export const libraryBookings = z.object({ items: z.array(z.object({
  id: z.uuid(), title: z.string(), author: z.string(), online: z.boolean(),
  active: z.boolean(), updatedAt: z.string(),
})) });
