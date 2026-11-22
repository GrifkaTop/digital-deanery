import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));

test("document dialogs preserve certificate context and open published sections", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/today/assistant");
  await page.getByLabel("Логин", { exact: true }).fill(env.DEMO_A_LOGIN!);
  await page.getByLabel("Пароль", { exact: true }).fill(env.DEMO_A_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();

  const input = page.getByLabel("Ваш вопрос");
  await expect(input).toBeVisible();
  async function ask(question: string) {
    await input.fill(question);
    const pending = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/assistant/ask") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Спросить", exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    const result = await response.json();
    const answer = page.locator(".assistant-message-assistant").last();
    const opening = result.text.split("\n")[0].replaceAll("**", "");
    await expect(answer.locator(".chat-answer-text").first()).toContainText(opening);

    return { request: response.request().postDataJSON(), result };
  }

  await ask("Не успеваю на встречу для разбора вопросов. Как попросить другое время?");
  const consultation = page.locator(".assistant-message-assistant").last()
    .locator('a[href*="file-consultation-rescheduling-"][href$="#section-1"]');
  await expect(consultation).toBeVisible();
  await consultation.click();
  await expect(page).toHaveURL(/file-consultation-rescheduling-[a-f0-9]{64}#section-1$/);
  await expect(page.locator("#section-1")).toContainText("выбирает дисциплину из личного плана");

  await page.getByRole("link", { name: "К помощнику" }).click();
  await page.getByRole("button", { name: "Новый диалог" }).click();
  const first = await ask("Как подать заявку на справку об обучении?");
  expect(first.result.context).toEqual({ topics: [], subject: "study_certificate" });

  const follow = await ask("А где её потом скачать?");
  expect(follow.request.context).toEqual(first.result.context);
  const certificate = page.locator(".assistant-message-assistant").last()
    .locator('a[href*="file-study-certificates-"][href$="#section-3"]');
  await expect(certificate).toBeVisible();
  await certificate.click();
  await expect(page).toHaveURL(/file-study-certificates-[a-f0-9]{64}#section-3$/);
  await expect(page.locator("#section-3")).toContainText("PDF появляется в карточке заявки");
});
