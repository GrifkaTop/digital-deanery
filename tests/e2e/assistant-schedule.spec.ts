import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";
const origin = process.env.PLAYWRIGHT_ORIGIN ?? baseURL;
const unknown = "/api/v1/lessons/ffffffff-ffff-4fff-8fff-ffffffffffff";

async function headers(context: APIRequestContext) {
  const { token } = await (await context.get("/api/v1/csrf")).json();
  return { Origin: origin, "X-CSRF-Token": token };
}

async function signIn(context: APIRequestContext, account: "A" | "B") {
  expect((await context.post("/api/v1/session/login", { headers: await headers(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] } })).status()).toBe(200);
}

test("conversation handles spaced and misspelled day after tomorrow", async ({ page }) => {
  await page.goto("/today/assistant");
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const input = page.getByLabel("Ваш вопрос");
  await expect(input).toBeVisible();
  const ask = async (question: string) => {
    await input.fill(question);
    const response = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/assistant/ask") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Спросить" }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    const body = await result.json();
    await expect(page.locator(".assistant-message-assistant").last().locator("p").first()).toHaveText(body.text);
    return body;
  };
  const first = await ask("Какие пары завтра?");
  const next = await ask("что после завтра");
  const tomorrow = first.context.schedule.date as string;
  const expected = new Date(Date.parse(tomorrow + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  expect(next.context.schedule.date).toBe(expected);
  const typo = await ask("после звтра расписание");
  expect(typo.context.schedule.date).toBe(expected);
  expect(typo.processing).toBe("qwen");
});

test("assistant schedule stays within each group and its links close after logout", async ({ playwright }) => {
  const a = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    expect((await a.post("/api/v1/assistant/ask", { data: { question: "Расписание на неделю" } })).status()).toBe(401);
    await signIn(a, "A");
    await signIn(b, "B");
    const links: string[] = [];
    for (const context of [a, b]) {
      const response = await context.post("/api/v1/assistant/ask", { headers: await headers(context), data: { question: "Расписание на этой неделе" } });
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("no-store, private");
      const answer = await response.json();
      expect(answer).toMatchObject({ kind: "answer", context: { schedule: { view: "week" } } });
      const schedule = await (await context.get(`/api/v1/lessons?date=${answer.context.schedule.date}&view=week`)).json();
      expect(answer.widgets.map((widget: { href: string }) => widget.href)).toEqual(
        schedule.items.map((item: { id: string }) => `/schedule/${item.id}`));
      expect(answer.widgets.length).toBeGreaterThan(0);
      links.push(answer.widgets[0].href.replace("/schedule/", "/api/v1/lessons/"));
    }
    for (const [context, foreign] of [[a, links[1]], [b, links[0]]] as const) {
      const denied = await context.get(foreign);
      const missing = await context.get(unknown);
      expect(denied.status()).toBe(404);
      expect(await denied.json()).toEqual(await missing.json());
      expect(denied.headers()["cache-control"]).toBe(missing.headers()["cache-control"]);
      expect((await context.post("/api/v1/session/logout", { headers: await headers(context) })).status()).toBe(204);
      expect((await context.get(foreign)).status()).toBe(401);
      expect((await context.post("/api/v1/assistant/ask", { data: { question: "Расписание" } })).status()).toBe(401);
    }
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("assistant does not reveal another student's request by number", async ({ playwright }) => {
  const a = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await signIn(a, "A");
    await signIn(b, "B");
    const numbers = await Promise.all([a, b].map(async (api) => {
      const response = await api.get("/api/v1/requests");
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.items.length).toBeGreaterThan(0);
      return body.items[0].publicNo as string;
    }));
    for (const [api, own, foreign] of [[a, numbers[0], numbers[1]], [b, numbers[1], numbers[0]]] as const) {
      const ask = async (number: string) => (await api.post("/api/v1/assistant/ask", {
        headers: await headers(api), data: { question: `Статус заявки ${number}` },
      })).json();
      expect((await ask(own)).widgets).toMatchObject([{ type: "actions", items: [{ label: expect.stringContaining(own) }] }]);
      const denied = await ask(foreign);
      const absent = await ask("ЗА-9999-9999999999999999999");
      expect(denied).toEqual(absent);
      expect(denied.text).not.toContain(foreign);
    }
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("personal widget links use the visible deadline targets and keep grade details private", async ({ playwright }) => {
  const a = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  const b = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await signIn(a, "A");
    await signIn(b, "B");
    const paths = { assignment: "/assignments/", discipline: "/study/", request: "/requests/" } as const;
    const personal = [];
    for (const api of [a, b]) {
      const ask = async (question: string) => {
        const response = await api.post("/api/v1/assistant/ask", { headers: await headers(api), data: { question } });
        expect(response.status()).toBe(200);
        return response.json();
      };
      const grades = await ask("Мои оценки");
      expect(grades.widgets[0].type).toBe("grades");
      const href = grades.widgets[0].items[0].href as string;
      expect((await api.get("/api/v1" + href)).status()).toBe(200);
      personal.push(href);

      const deadlines = await ask("Покажи все дедлайны");
      expect(deadlines.widgets[0].type).toBe("deadline");
      const board = await (await api.get("/api/v1/deadlines")).json();
      const targets = new Map<string, string>(board.items.map(({ id, target }: {
        id: string; target: { kind: keyof typeof paths; id: string };
      }) => [id, paths[target.kind] + target.id]));
      for (const widget of deadlines.widgets) {
        if (targets.has(widget.id)) expect(widget.href).toBe(targets.get(widget.id));
        expect((await api.get("/api/v1" + widget.href)).status()).toBe(200);
      }
    }
    for (const [api, foreign] of [[a, personal[1]], [b, personal[0]]] as const) {
      const denied = await api.get("/api/v1" + foreign);
      const missing = await api.get("/api/v1/study/ffffffff-ffff-4fff-8fff-ffffffffffff");
      expect(denied.status()).toBe(404);
      expect(await denied.json()).toEqual(await missing.json());
    }
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

const dialogues = [
  { name: "другие дедлайны", turns: ["Какой ближайший дедлайн?", "А ещё какие есть?", "Какие ещё у меня дедлайны"], topic: "deadlines" },
  { name: "перефразировка дедлайнов", turns: ["Когда мой следующий дедлайн?", "Что ещё есть?", "Покажи остальные дедлайны"], topic: "deadlines" },
  { name: "список без истории", turns: ["Какие у меня дедлайны?", "Покажи все дедлайны"], topic: "deadlines" },
  { name: "расписание", turns: ["Расписание на сегодня", "А на завтра?"], topic: "schedule" },
  { name: "график выплат", turns: ["Когда стипендия?", "когда выплата", "когда я получу деньги от университета"], topic: "payment" },
  { name: "нет контекста", turns: ["А ещё какие есть?", "когда выплата"], topic: "clarify" },
] as const;

test.describe("assistant conversation matrix", () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    await signIn(context, "A");
  });

  test.afterAll(async () => {
    if (!context) return;
    try {
      await context.post("/api/v1/session/logout", { headers: await headers(context) });
    } finally {
      await context.dispose();
    }
  });

  for (const { name, turns, topic } of dialogues) {
    test(`assistant dialogue: ${name}`, async () => {
      let history: unknown;
      let nearest: string | undefined;
      for (const [index, question] of turns.entries()) {
        const response = await context.post("/api/v1/assistant/ask", {
          headers: await headers(context), data: { question, context: history },
        });
        expect(response.status(), question).toBe(200);
        const answer = await response.json();
        history = answer.context;
        if (topic === "clarify") {
          expect(answer, question).toMatchObject({ kind: "clarify", cards: [] });
          continue;
        }
        expect(["answer", "empty"], question).toContain(answer.kind);
        if (topic === "deadlines") {
          expect(answer, question).toMatchObject({ category: "quick", context: { topics: [], deadlines: {} } });
          if (!index && name !== "список без истории" && answer.kind === "answer") {
            expect(answer.context.deadlines.excludeId).toBeTruthy();
            nearest = answer.widgets[0].id;
          }
          if (index && nearest) expect(answer.widgets?.map((widget: { id: string }) => widget.id)).not.toContain(nearest);
        } else if (topic === "schedule") {
          expect(answer.context.schedule.view).toBe("day");
        } else {
          expect(answer.context.topics).toEqual(["scholarship_payment"]);
          if (answer.kind === "answer") expect(answer.cards[0].link.href).toContain("scholarship-payments");
        }
      }
    });
  }

  test("assistant handles mobile typos and free deadline paraphrases", async () => {
    test.setTimeout(90_000);
    const ask = async (question: string) => {
      const response = await context.post("/api/v1/assistant/ask", {
        headers: await headers(context), data: { question },
      });
      expect(response.status(), question).toBe(200);
      return response.json();
    };
    const expected = await ask("Какой ближайший дедлайн?");
    expect(expected.category).toBe("quick");
    for (const question of ["акой ближайшй дедлайн", "каой ближйший дедлайн", "какой ближaйший дедлайн", "какая ближайшая задача"]) {
      const answer = await ask(question);
      expect(answer.widgets, question).toEqual(expected.widgets);
      expect(answer.context.deadlines, question).toEqual(expected.context.deadlines);
    }
    for (const question of [
      "Нет, какой дедлайн нужно сделать мне",
      "Какую из учебных работ надо сдать раньше остальных?",
      "Что у меня горит по учёбе, с чего начать?",
    ]) {
      const answer = await ask(question);
      expect(answer, question).toMatchObject({
        category: "quick", widgets: expected.widgets, context: { deadlines: expected.context.deadlines },
      });
    }
  });
});

test("mixed-topic dialogue uses live data, advances deadlines and isolates both students", async ({ playwright }) => {
  test.setTimeout(120_000);
  for (const account of ["A", "B"] as const) {
    const api = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    try {
      await signIn(api, account);
      const ask = async (question: string, context?: unknown) => {
        const response = await api.post("/api/v1/assistant/ask", {
          headers: await headers(api), data: { question, context },
        });
        expect(response.status(), question).toBe(200);
        return response.json();
      };
      const calendar = await ask("Когда сессия и каникулы?");
      expect(calendar.cards.map((item: { title: string }) => item.title).join(" ")).toMatch(/сессия.*|каникулы/u);
      expect(calendar.context.topics).toEqual(expect.arrayContaining(["session", "holidays"]));

      const studyResponse = await api.get("/api/v1/study");
      expect(studyResponse.status()).toBe(200);
      const study = await studyResponse.json();
      const course = study.items.find((item: { hasGrades: boolean }) => item.hasGrades);
      expect(course).toBeTruthy();

      const grades = await ask("какие у меня оцнки", calendar.context);
      expect(grades).toMatchObject({ kind: "answer", category: "quick", context: { topics: [], subject: "grades" } });
      expect(grades.widgets[0].items).toEqual(expect.arrayContaining([
        expect.objectContaining({ title: course.title, href: `/study/${course.id}` }),
      ]));
      const follow = await ask(`а по ${course.title}?`, grades.context);
      const detail = await (await api.get(`/api/v1/study/${course.id}`)).json();
      expect(follow.kind).toBe("answer");
      for (const result of detail.grades) expect(follow.widgets[0].items).toContainEqual(expect.objectContaining({ label: result.label }));
      const modelGrades = await ask("Скажи, какие оценки мне успели выставить в этом семестре?");
      expect(modelGrades).toMatchObject({ widgets: grades.widgets });

      const list = await ask("Покажи все дедлайны");
      expect(list.kind).toBe("answer");
      const expected = list.widgets;
      const first = await ask("когда дедлайн ближайший", grades.context);
      expect(first).toMatchObject({ kind: "answer", category: "quick", widgets: [expected[0]], context: { topics: [], deadlines: {} } });
      let previous = first;
      for (const [index, question] of ["а следующий", "а после этого???", "что дальше?", "потом какой?"].entries()) {
        const next = await ask(question, previous.context);
        if (expected[index + 1]) {
          expect(next.widgets, question).toEqual([expected[index + 1]]);
          expect(next.context.deadlines.excludeId).not.toBe(previous.context.deadlines.excludeId);
        } else {
          expect(next, question).toMatchObject({ kind: "empty", cards: [] });
        }
        previous = next;
      }
      const noTopic = await ask("а после этого???");
      expect(noTopic).toMatchObject({ kind: "clarify", cards: [] });
      const modelDeadline = await ask("Подскажи, за какую работу мне браться в первую очередь по срокам?");
      expect(modelDeadline).toMatchObject({ widgets: first.widgets });
      expect(["qwen", "catalog"]).toContain(modelDeadline.processing);
      const scholarship = await ask("Что требуется, чтобы мне назначили академическую стипендию?", previous.context);
      expect(scholarship).toMatchObject({ processing: "qwen", kind: "answer", context: { topics: ["scholarship_rules"] } });
      expect(scholarship.cards.some((card: { link: { href: string } }) => card.link.href.includes("scholarship-policy"))).toBe(true);
      const enhanced = await ask("А как получить повышенную?", scholarship.context);
      expect(["answer", "empty"]).toContain(enhanced.kind);

      const requests = await (await api.get("/api/v1/requests")).json();
      const request = requests.items[0];
      expect(request).toBeTruthy();
      const requestAnswer = await ask(`Статус заявки ${request.publicNo}`, scholarship.context);
      expect(requestAnswer).toMatchObject({ kind: "answer", category: "quick" });
      expect(requestAnswer.widgets).toMatchObject([{ type: "actions", items: [{
        label: expect.stringContaining(request.publicNo), href: `/requests/${request.id}`,
      }] }]);

      const sports = await (await api.get("/api/v1/sports")).json();
      const passport = await ask("Когда заканчивается мой паспорт здоровья?", scholarship.context);
      expect(passport.context.subject).toBe("health_passport");
      if (sports.passport) {
        const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" })
          .format(new Date(sports.passport.validUntil + "T12:00:00Z"));
        expect(passport).toMatchObject({ kind: "answer", text: expect.stringContaining(date) });
      } else {
        expect(passport.kind).toBe("empty");
      }
      const renewal = await ask("Как его продлить?", passport.context);
      expect(["answer", "empty"]).toContain(renewal.kind);
      const attendance = await ask("Какая у меня посещаемость по физкультуре?");
      expect(attendance.category).toBe("quick");
      expect(["answer", "empty"]).toContain(attendance.kind);
      expect((await api.post("/api/v1/session/logout", { headers: await headers(api) })).status()).toBe(204);
    } finally {
      await api.dispose();
    }
  }
});
