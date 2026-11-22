import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const route = "/api/v1/assistant/ask";

for (const width of [360, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${width}px ${colorScheme}`, () => {
      test.use({ viewport: { width, height: width === 360 ? 800 : 900 }, colorScheme });

      test("renders the four assistant widgets from the cabinet API", async ({ page }, info) => {
        await page.goto("/login?next=%2Fprototype%23assistant");
        await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
        await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
        await page.getByRole("button", { name: "Войти", exact: true }).click();
        const thread = page.getByRole("log", { name: "Переписка с помощником" });
        const input = page.getByRole("textbox", { name: "Сообщение" });
        await expect(thread).toBeVisible();
        await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", colorScheme);

        const examples = [
          { question: "Где ближайшая пара?", type: "lesson", link: /^#lesson\//u },
          { question: "Какой ближайший дедлайн?", type: "deadline", link: /^#(?:work|study|requests)\//u },
          { question: "Мои оценки", type: "grades", link: /^#study\//u },
          { question: "Как подать заявку на справку об обучении?", type: "actions", link: /^#requests\/new\?kind=study_certificate$/u },
        ];
        for (const { question, type, link } of examples) {
          await input.fill(question);
          const pending = page.waitForResponse(response => response.url().endsWith(route) && response.request().method() === "POST");
          await page.getByRole("button", { name: "Отправить вопрос" }).click();
          const response = await pending;
          expect(response.status()).toBe(200);
          const body = await response.json();
          expect(body.widgets[0].type).toBe(type);
          const answer = thread.locator('[data-chat-role="assistant"]').last();
          const widget = answer.locator(`.chat-widget-${type}`).first();
          await expect(widget).toBeVisible();
          const target = widget.locator("a").or(widget.and(page.locator("a"))).first();
          await expect(target).toHaveAttribute("href", link);
          expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(48);
          await expect(answer).toHaveCSS("border-top-width", "0px");
          if (width === 360) {
            const messageWidth = await answer.evaluate(node => node.getBoundingClientRect().width);
            const listWidth = await answer.evaluate(node => node.parentElement!.getBoundingClientRect().width);
            expect(messageWidth).toBe(listWidth);
          }
          if (type === "grades") {
            await expect(widget.getByRole("link", { name: "Вся успеваемость" })).toHaveAttribute("href", "#study");
            for (const badge of await widget.locator(".chat-widget-badge").all()) {
              await expect(badge).toHaveCSS("white-space", "nowrap");
              expect(await badge.textContent()).not.toMatch(/\d+ из \d+/u);
            }
          }
          if (type === "lesson") {
            const room = widget.locator(".chat-widget-room");
            await expect(room).toHaveCSS("white-space", "nowrap");
            const title = (await widget.locator(".chat-widget-main").boundingBox())!;
            const date = (await widget.locator(".chat-widget-date").boundingBox())!;
            if (width === 360) expect(title.y).toBeGreaterThanOrEqual(date.y + date.height);
            else expect(title.x).toBeGreaterThanOrEqual(date.x + date.width);
          }
          if (type === "lesson" || type === "deadline") {
            await expect(answer.locator(".chat-answer-text").first()).not.toContainText(body.widgets[0].title);
          }
          if (type === "deadline") {
            await expect(widget.locator(".chat-widget-badge")).toHaveText(body.widgets[0].isOverdue ? "Просрочено" : "Обязательный");
          }
          if (type === "actions") {
            await expect(answer.locator(".chat-answer-text ol > li")).toHaveCount(3);
            await expect(answer.locator(".chat-answer-text strong")).toHaveText("назначение справки");
          }

          expect(await answer.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
          expect(await thread.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: info.outputPath(`${type}.png`), style: "nextjs-portal { visibility: hidden; }" });
          if (type === "actions") {
            await target.click();
            await expect(page).toHaveURL(/#requests\/new\?kind=study_certificate$/u);
            await expect(page.getByRole("heading", { name: /справка об обучении/iu })).toBeVisible();
          }
        }
      });
    });
  }
}
