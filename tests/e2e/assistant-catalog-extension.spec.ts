import { expect, test, type APIRequestContext } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env", "utf8"));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://localhost";
const origin = process.env.PLAYWRIGHT_ORIGIN ?? baseURL;
const documentRoot = process.env.ASSISTANT_DOCUMENTS_DIR ?? "documents";
async function csrf(context: APIRequestContext) {
  return { Origin: origin, "X-CSRF-Token": (await (await context.get("/api/v1/csrf")).json()).token as string };
}

async function signIn(context: APIRequestContext, account: "A" | "B" = "A") {
  const response = await context.post("/api/v1/session/login", {
    headers: await csrf(context),
    data: { login: env[`DEMO_${account}_LOGIN`], password: env[`DEMO_${account}_PASSWORD`] },
  });
  expect(response.status()).toBe(200);
}

test("new educational documents answer direct, colloquial, combined and missing-information questions", async ({ playwright }) => {
  test.setTimeout(120_000);
  const context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    await signIn(context);
    const ask = async (question: string) => context.post("/api/v1/assistant/ask", {
      headers: await csrf(context), data: { question },
    });

    const direct = await (await ask("В какой форме проходит промежуточная аттестация?")).json();
    expect(direct.kind).toBe("answer");
    expect(direct.cards.some((card: { text: string }) => card.text.includes("учебном плане"))).toBe(true);
    const assessmentLink = direct.cards.find((card: { link: { href: string } }) => card.link.href.includes("assessment-rules"))?.link.href;
    expect(assessmentLink).toBeTruthy();

    const colloquial = await (await ask("Не сдал экзамен, сколько ещё попыток дадут?")).json();
    expect(colloquial.kind).toBe("answer");
    expect(colloquial.cards.some((card: { text: string }) => card.text.includes("не более двух раз"))).toBe(true);
    const debtLink = colloquial.cards.find((card: { link: { href: string } }) => card.link.href.includes("academic-debt"))?.link.href;
    expect(debtLink).toBeTruthy();

    const combined = await (await ask("Какая форма промежуточной аттестации и сколько раз можно пересдать академическую задолженность?")).json();
    const combinedLinks = combined.cards.map((card: { link: { href: string } }) => card.link.href).join(" ");
    expect(combined.kind).toBe("answer");
    expect(combinedLinks).toContain("assessment-rules");
    expect(combined.cards).toHaveLength(1);
    expect(combined.text).toContain("не более двух раз");
    expect(combined.text).toContain("учебном плане");

    const missing = await (await ask("В УЧ-04 есть индивидуальная дата пересдачи?")).json();
    expect(missing.kind).toBe("answer");
    expect(missing.cards.some((card: { text: string }) => card.text.includes("Общий документ не устанавливает индивидуальную дату"))).toBe(true);
    const personalGrade = await (await ask("Какую оценку мне поставили за контрольную?")).json();
    expect(JSON.stringify(personalGrade)).not.toMatch(/(?:вам поставил|ваша оценка|оценка:\s*[0-9])/iu);
    const unanswered = await (await ask("Какую именно сумму мне начислили в этом месяце?")).json();
    expect(unanswered.kind).toBe("unsupported");
    expect(unanswered.cards).toHaveLength(0);

    const attendance = await (await ask("Я болел и не пришёл, мне автоматически поставят ноль?")).json();
    expect(attendance.cards.some((card: { link: { href: string } }) => card.link.href.includes("attendance-rules"))).toBe(true);
    const appeal = await (await ask("Как обратиться, если не согласен с оценкой?")).json();
    expect(appeal.cards.some((card: { link: { href: string } }) => card.link.href.includes("assessment-appeals"))).toBe(true);
    const consultation = await (await ask("Когда ближайшая консультация?")).json();
    expect(consultation.cards.some((card: { link: { href: string }; text: string }) => card.link.href.includes("consultation-control-info") && card.text.toLocaleLowerCase().includes("отсутствуют события консультаций"))).toBe(true);
    const social = await (await ask("Чем социальная стипендия отличается от материальной помощи?")).json();
    expect(social.cards.some((card: { link: { href: string } }) => card.link.href.includes("student-social-support"))).toBe(true);
    const service = await (await ask("Куда позвонить в деканат?")).json();
    expect(service.cards.some((card: { link: { href: string } }) => card.link.href.includes("service-directory"))).toBe(true);
    const practice = await (await ask("Где у меня будет практика и когда сдавать ВКР?")).json();
    expect(practice.cards.some((card: { link: { href: string } }) => card.link.href.includes("practice-thesis"))).toBe(true);

    const documentLinks = [assessmentLink!, debtLink!];
    const documentIds: string[] = [];
    for (const link of documentLinks) {
      const page = await context.get(link);
      expect(page.status()).toBe(200);
      const documentId = link.split("/documents/")[1].split("#")[0];
      const document = await context.get(`/api/v1/assistant/documents/${documentId}`);
      expect(document.status()).toBe(200);
      const publication = await document.json();
      expect(publication.pdfHref).toContain("/pdf");
      const pdf = await context.get(publication.pdfHref);
      expect(pdf.status()).toBe(200);
      expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
      documentIds.push(documentId);
    }

    const newIds = ["attendance-rules", "assessment-appeals", "learning-materials", "discipline-overview", "consultation-control-info", "academic-leave", "transfer-restoration", "student-social-support", "tuition-payment", "dormitory-rules", "student-conduct-requests", "practice-thesis", "service-directory"];
    for (const id of newIds) {
      const versionRoot = join(documentRoot, "versions", id);
      const revision = readdirSync(versionRoot).filter((entry) => !entry.startsWith("."))
        .sort((left, right) => statSync(`${versionRoot}/${right}`).mtimeMs - statSync(`${versionRoot}/${left}`).mtimeMs)[0];
      expect(revision, id).toBeTruthy();
      const documentId = `file-${id}-${revision}`;
      const response = await context.get(`/api/v1/assistant/documents/${documentId}`);
      expect(response.status(), id).toBe(200);
      const publication = await response.json();
      expect(publication.pdfHref, id).toContain("/pdf");
      const pdf = await context.get(publication.pdfHref);
      expect(pdf.status(), id).toBe(200);
      expect((await pdf.body()).subarray(0, 4).toString(), id).toBe("%PDF");
      documentIds.push(documentId);
    }

    expect((await context.post("/api/v1/session/logout", { headers: await csrf(context) })).status()).toBe(204);
    for (const documentId of documentIds) {
      expect((await context.get(`/api/v1/assistant/documents/${documentId}`)).status()).toBe(401);
      expect((await context.get(`/api/v1/assistant/documents/${documentId}/pdf`)).status()).toBe(401);
    }
    await signIn(context, "B");
    for (const documentId of documentIds) expect((await context.get(`/api/v1/assistant/documents/${documentId}`)).status()).toBe(200);
    expect((await context.post("/api/v1/session/logout", { headers: await csrf(context) })).status()).toBe(204);
    for (const documentId of documentIds) expect((await context.get(`/api/v1/assistant/documents/${documentId}`)).status()).toBe(401);
  } finally {
    await context.dispose();
  }
});

test("a student can open a new document and its PDF in the mobile assistant", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page.request);
  await page.goto("/today/assistant");
  await page.getByLabel("Ваш вопрос").fill("В какой форме проходит промежуточная аттестация?");
  await page.getByLabel("Ваш вопрос").press("Enter");
  const reference = page.getByRole("link", { name: /Положение о текущем контроле и промежуточной аттестации/ }).first();
  await expect(reference).toBeVisible({ timeout: 30_000 });
  await reference.click();
  await expect(page.getByRole("heading", { name: "Положение о текущем контроле и промежуточной аттестации" })).toBeVisible();
  const pdfResponse = page.waitForResponse((response) => response.url().includes("/api/v1/assistant/documents/file-assessment-rules-") && response.url().endsWith("/pdf"));
  await page.getByRole("link", { name: "Открыть оригинал PDF" }).click();
  expect((await pdfResponse).status()).toBe(200);
});
