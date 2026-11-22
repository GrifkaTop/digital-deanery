import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/prototype#services");
  await expect(page.getByRole("heading", { name: "Вход в кабинет" })).toBeVisible();
  await page.getByRole("button", { name: "Студент A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Услуги и заявки" })).toBeVisible();
}

async function expectNoOverflow(page: Page, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [360, 1280]) {
    test(`services navigation at ${width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await login(page);
      await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", theme);

      const catalogTab = page.getByRole("link", { name: "Каталог услуг", exact: true });
      const requestsTab = page.getByRole("link", { name: /Мои заявки/ });
      await expect(catalogTab).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".ss-services-heading .ss-demo")).toHaveText("Демонстрационные данные");

      const chips = page.getByRole("group", { name: "Категория услуг" });
      const allCategories = chips.getByRole("button", { name: "Все", exact: true });
      await expect(allCategories).toHaveAttribute("aria-pressed", "true");
      await expect(allCategories).toHaveCSS("background-color", /rgb\(/);
      await expect(page.getByPlaceholder("Поиск услуги")).toBeVisible();
      await expectNoOverflow(page, width);
      await page.screenshot({ path: `/tmp/services-${width}-${theme}-catalog.png`, fullPage: true });

      await requestsTab.click();
      await expect(requestsTab).toHaveAttribute("aria-current", "page");
      await expect(catalogTab).not.toHaveAttribute("aria-current", "page");
      const filters = page.locator(".atlas-request-filters");
      const activeFilter = filters.locator("a").first();
      await expect(activeFilter).toContainText("Все");
      await expect(activeFilter).toHaveAttribute("aria-current", "page");
      await expect(activeFilter).toHaveCSS("text-decoration-line", "none");
      await expect(activeFilter).toHaveCSS("justify-content", "center");
      await expectNoOverflow(page, width);
      await page.screenshot({ path: `/tmp/services-${width}-${theme}-requests.png`, fullPage: true });
      await page.locator(".atlas-request-row").first().click();
      await expect(page.getByRole("heading", { name: "История заявки" })).toBeVisible();
      await expect(page.locator(".atlas-request-back")).toHaveCSS("white-space", "nowrap");
      await expect(page.locator(".atlas-request-back svg")).toHaveCSS("flex-shrink", "0");
      await expectNoOverflow(page, width);
      await page.screenshot({ path: `/tmp/services-${width}-${theme}-detail.png`, fullPage: true });

      await page.goto("/prototype#services");
      await catalogTab.click();
      const academicLeave = page.getByRole("link", { name: /Оформить:.*Академический отпуск/i });
      await expect(academicLeave).toBeVisible();
      await academicLeave.click();
      await expect(page).toHaveURL(/#requests\/new\?kind=academic_leave/u);
      const toolbar = page.locator(".ss-form-toolbar");
      await expect(toolbar.locator(".ss-back")).toHaveCSS("white-space", "nowrap");
      await expect(toolbar.locator(".ss-back svg")).toHaveCSS("flex-shrink", "0");
      await expect(toolbar.locator(".ss-step")).toHaveText("Шаг 1 из 2");
      await expectNoOverflow(page, width);
      await page.screenshot({ path: `/tmp/services-${width}-${theme}-atlas-form.png`, fullPage: true });

      await page.goto("/requests/new?kind=academic_leave");
      await expect(page.getByRole("heading", { name: "Академический отпуск" })).toBeVisible();
      await expect(page.getByText("Заявление на академический отпуск", { exact: true })).toBeVisible();
      await expect(page.getByText("Все поля обязательны · Демонстрационные данные", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Отправить заявку" })).toBeVisible();
      const dates = page.locator(".request-date-field");
      await expect(dates).toHaveCount(2);
      const rects = await dates.evaluateAll(nodes => nodes.map(node => { const {x,y,width} = node.getBoundingClientRect(); return {x,y,width}; }));
      if (width >= 640) expect(rects[0].y).toBeCloseTo(rects[1].y, 0);
      await expectNoOverflow(page, width);
      await page.screenshot({ path: `/tmp/services-${width}-${theme}-main-form.png`, fullPage: true });
    });
  }
}
