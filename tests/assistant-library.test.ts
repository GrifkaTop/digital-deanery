import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db", () => ({ getPool: () => ({ query }) }));
import { answerLibrary, libraryQuery, correctedLibraryQuery } from "../src/server/assistant/library";
import { assistantResponse } from "../src/contracts/assistant";
it.each(["учебник по анализу данных", "найди книгу по экономике", "есть ли пособие по праву?"])("recognizes book lookup: %s", question => { expect(libraryQuery(question)).toBeTruthy(); });
it.each(["Как продлить книгу?", "Когда вернуть книгу?", "Правила библиотеки", "Мои оценки"])("preserves document and personal topics: %s", question => { expect(libraryQuery(question)).toBeUndefined(); });
it("returns only catalog facts and a valid book page link", async () => {
 query.mockResolvedValueOnce({ rows: [{ id: "f2000000-0000-4000-8000-000000000001", title: "Книга", author: "Редакция", online: false, available: 0, booked: true }] });
 const response = assistantResponse.parse(await answerLibrary({ id: "student-a" } as never, "экономика"));
 expect(response.widgets).toMatchObject([{ type: "actions", items: [{
   href: "/prototype#library/f2000000-0000-4000-8000-000000000001", description: expect.stringContaining("Свободных экземпляров: 0"),
 }] }]);
 expect(query.mock.calls[0][1]).toEqual(["student-a", "экономика"]);
 expect(query.mock.calls[0][0]).toContain("b.published");
});
it("does not invent a book when the catalog has no match", async () => {
 query.mockResolvedValueOnce({ rows: [] });
 const response = await answerLibrary({ id: "student-a" } as never, "анализ данных");
 expect(response.kind).toBe("empty"); expect(response.cards).toEqual([]);
});

it.each(["ученбик по экономике", "учебнк по экономике", "кнгиа по экономике"])("routes misspelled book intent to the library: %s", question => { expect(libraryQuery(question)).toBe("экономике"); });
it("preserves subject words while repairing book intent", () => { expect(libraryQuery("ученбик по оплата")).toBe("оплата"); });
it("preserves renewal routing with misspelled book intent", () => { expect(libraryQuery("Как продлить ученбик?")).toBeUndefined(); });

it("asks the model to repair the original subject typo and validates its keywords", async () => {
 const classify = vi.fn().mockResolvedValue({ kind: "search", keywords: ["экономике"] });
 expect(await correctedLibraryQuery("ученбик по экомноике", classify, new AbortController().signal)).toBe("экономике");
 expect(classify.mock.calls[0][0].question).toBe("ученбик по экомноике");
});
it("does not accept invented book cards from the correction model", async () => {
 const classify = vi.fn().mockResolvedValue({ kind: "search", keywords: ["экономика"], cards: [{title:"Выдуманная книга"}] });
 await expect(correctedLibraryQuery("ученбик по экомноике", classify, new AbortController().signal)).rejects.toThrow();
});
it("does not retry an ambiguous correction", async () => {
 expect(await correctedLibraryQuery("учебник по неизвестному", vi.fn().mockResolvedValue({kind:"clarify"}), new AbortController().signal)).toBeUndefined();
});
