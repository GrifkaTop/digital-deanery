import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInToPrototype } from "./prototype-session";

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function aboveBottomNav(page: Page, target: Locator) {
  await target.evaluate(node => node.scrollIntoView({ block: "end" }));
  await page.evaluate(() => window.scrollBy(0, 90));
  const nav = page.locator(".p-mobile-nav");
  if (await nav.isVisible()) {
    expect((await target.boundingBox())!.y + (await target.boundingBox())!.height)
      .toBeLessThanOrEqual((await nav.boundingBox())!.y);
  }
}

for (const width of [360, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${width}px ${colorScheme}`, () => {
      test.use({ viewport: { width, height: width === 360 ? 800 : 900 }, colorScheme, reducedMotion: "reduce" });

      test("keeps notification, discipline, assignment and article layouts readable", async ({ page, baseURL }, info) => {
        await signInToPrototype(page.request, baseURL, "A");
        await page.route("**/api/v1/inbox", route => route.fulfill({ json: {
          items: [{
            id: "20000000-0000-4000-8000-080000000301", kind: "request_update", important: false,
            title: "Справка готова", publishedAt: "2026-11-22T07:00:00Z", readAt: null, dueAt: null,
          }],
          unreadCount: 1, nextCursor: "layout-fixture",
        } }));
        await page.goto("/prototype#inbox");
        const more = page.getByRole("button", { name: "Ещё уведомления" });
        await expect(more).toHaveCSS("margin-top", "16px");
        await expect(page.locator(".p-inbox-row :is(.p-inbox-meta, .p-inbox-room-heading) .p-read-marker").first()).toBeVisible();
        await fitsViewport(page);
        await more.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath("inbox.png"), style: "nextjs-portal { visibility: hidden; }" });

        await page.goto("/prototype#study");
        const subject = page.locator(".dl-subject-summary").filter({ hasText: "Анализ данных" }).first();
        await subject.click();
        const details = page.locator(".dl-subject-body").filter({ hasText: "Посещения практических занятий" }).filter({ visible: true }).first();
        const attendance = details.getByRole("region", { name: "Посещения практических занятий" });
        await expect(attendance).toBeVisible();
        await expect(details.getByRole("list", { name: "Статусы работ" })).toHaveCount(0);
        await fitsViewport(page);
        await aboveBottomNav(page, attendance.getByRole("heading"));
        await page.screenshot({ path: info.outputPath("study.png"), style: "nextjs-portal { visibility: hidden; }" });

        const homework = details.locator('.dl-work-chip[aria-label^="Домашняя работа."]');
        await homework.click();
        const facts = page.locator(".pw-facts");
        await expect(facts).toContainText("Срок сдачи");
        await expect(facts).toContainText("Защищено");
        await expect(facts.locator("#pw-score")).toContainText("8 из 30");
        await expect(page.locator(".pw-topic").filter({ hasText: /^Домашняя работа$/u })).toHaveCount(0);
        await expect(page.locator(".pw-record")).toContainText("Оценено");
        await expect(page.locator(".pw-record").getByRole("link", { name: "Нина Учебная" })).toBeVisible();
        await fitsViewport(page);
        await aboveBottomNav(page, page.locator(".pw-record > div").last());
        await page.screenshot({ path: info.outputPath("work.png"), style: "nextjs-portal { visibility: hidden; }" });

        for (const [title, headings] of [
          ["Опубликован график зимней сессии", ["Что есть в календаре", "Что проверить заранее"]],
          ["Дополнительные места для подготовки к сессии", ["Где заниматься"]],
        ] as const) {
          await page.goto("/prototype#news");
          await page.getByRole("link", { name: new RegExp(title, "u") }).click();
          const article = page.locator(".hm-detail");
          await expect(article.getByRole("heading", { name: title, exact: true })).toBeVisible();
          for (const heading of headings) {
            const subsection = article.locator(".hm-detail-part").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
            const titleBox = (await subsection.getByRole("heading").boundingBox())!;
            expect((await subsection.locator("p").first().boundingBox())!.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
          }
          const back = article.locator(".hm-detail-back");
          await expect(back).toHaveCSS("display", "inline-flex");
          await expect(back).toHaveCSS("flex-direction", "row");
          await fitsViewport(page);
          await page.screenshot({ path: info.outputPath(`news-${headings.length}.png`), style: "nextjs-portal { visibility: hidden; }" });
        }
      });
    });
  }
}
