import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const env = parseEnv(readFileSync(".env", "utf8"));
test("assistant finds catalog books and opens their authenticated detail", async ({ request }) => {
 const headers = async () => ({ Origin: process.env.PLAYWRIGHT_ORIGIN ?? process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost", "X-CSRF-Token": (await (await request.get("/api/v1/csrf")).json()).token });
 expect((await request.post("/api/v1/session/login", { headers: await headers(), data: { login: env.DEMO_A_LOGIN, password: env.DEMO_A_PASSWORD } })).status()).toBe(200);
 const ask = async (question: string) => { const result = await request.post("/api/v1/assistant/ask", { headers: await headers(), data: { question } }); expect(result.status()).toBe(200); return result.json(); };
 const answer = await ask("найди учебник по экономике");
 expect(answer.kind).toBe("answer"); expect(answer.widgets[0].items.length).toBeGreaterThan(0);
 const id = answer.widgets[0].items[0].href.split("/").pop();
 const detail = await request.get(`/api/v1/library/${id}`); expect(detail.status()).toBe(200);
 expect((await detail.json()).title).toBe(answer.widgets[0].items[0].label);
 const missing = await ask("учебник по анализу данных"); expect(missing.kind).toBe("empty"); expect(missing.cards).toEqual([]);
 expect((await request.post("/api/v1/session/logout", { headers: await headers() })).status()).toBe(204);
 expect((await request.get(`/api/v1/library/${id}`)).status()).toBe(401);
});
