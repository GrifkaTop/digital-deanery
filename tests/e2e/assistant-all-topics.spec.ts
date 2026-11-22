import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import questions from "../../documents/questions.json";
const env = parseEnv(readFileSync(".env", "utf8"));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";
const origin = process.env.PLAYWRIGHT_ORIGIN ?? baseURL;
const bare = ["материальная помощь", "социальная стипендия", "академический отпуск", "перевод", "восстановление", "оплата обучения", "общежитие", "апелляция", "учебные материалы", "рабочая программа дисциплины", "практика", "ВКР", "внутренний распорядок", "контакты деканата", "справка об обучении", "академическая задолженность"];
const typos = ["Как плучить материальну помщь??", "как получить матпомощь", "как оформить соцстипендию", "хочу в общагу", "академичский отпуск", "апелляця", "консультаця", "пересдча", "восстановлние", "оплта обучения", "учебные материлы"];
const groups = [questions.slice(0, 16), questions.slice(16), bare.map((question, i) => ({ id: `bare-${i}`, question, answerable: true })), typos.map((question, i) => ({ id: `typo-${i}`, question, answerable: true }))];
for (const [index, cases] of groups.entries()) test(`published topic matrix ${index + 1}`, async ({ playwright }) => {
  test.setTimeout(180_000);
  const context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const headers = async () => ({ Origin: origin, "X-CSRF-Token": (await (await context.get("/api/v1/csrf")).json()).token as string });
  try {
    expect((await context.post("/api/v1/session/login", { headers: await headers(), data: { login: env.DEMO_A_LOGIN, password: env.DEMO_A_PASSWORD } })).status()).toBe(200);
    for (const item of cases) {
      const response = await context.post("/api/v1/assistant/ask", { headers: await headers(), data: { question: item.question } });
      expect(response.status(), item.question).toBe(200);
      const answer = await response.json();
      expect(answer.cards.filter((card: { link: { href: string } }) => card.link.href.startsWith("/today/assistant/documents/")).length, item.question).toBeLessThanOrEqual(1);
      if (item.answerable) {
        expect.soft(answer.kind, item.question).toBe("answer");
        expect.soft(answer.concise, item.question).toBe(true);
      }
      if (item.id === "certificate") expect(answer.text).not.toMatch(/три рабочих дня|3 рабочих дня/u);
      if (item.question === "материальная помощь") {
        expect(answer.text).toContain("не содержит личного статуса, суммы");
        expect(answer.text).toContain("не принимает заявления");
      }
    }
  } finally {
    await context.post("/api/v1/session/logout", { headers: await headers() });
    await context.dispose();
  }
});
