import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, test, type Page } from "@playwright/test";

const origin = process.env.ATLAS_UI_ORIGIN;
const onlineBook = "f2000000-0000-4000-8000-000000000001";
const printBook = "f2000000-0000-4000-8000-000000000002";
const economics = "f1000000-0000-4000-8000-000000000002";
const missingSubject = "f1000000-0000-4000-8000-000000000099";
const subjectQuery = `?subjectId=${economics}`;

test.skip(!origin, "Requires an isolated Atlas stand with ATLAS_UI_ORIGIN.");
test.use({ baseURL: origin, viewport: { width: 360, height: 780 } });

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
}

for (const theme of ["light", "dark"] as const) {
  test(`Library is usable at 360 px in ${theme} theme`, async ({ page }) => {
    const { DEMO_A_LOGIN, DEMO_A_PASSWORD } = parseEnv(readFileSync(".env", "utf8"));
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/prototype#library/${onlineBook}/read`);
    await expect(page.getByRole("heading", { name: "Вход в кабинет" })).toBeVisible();
    await page.getByLabel("Логин", { exact: true }).fill(DEMO_A_LOGIN!);
    await page.getByLabel("Пароль", { exact: true }).fill(DEMO_A_PASSWORD!);
    const reading = page.waitForResponse(response =>
      response.url().endsWith(`/api/v1/library/${onlineBook}/read`) && response.ok());
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await reading;
    await expect(page).toHaveURL(`/prototype#library/${onlineBook}/read`);
    await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", theme);
    await expect(page.getByRole("article", { name: "Основы международного сотрудничества" })).toContainText("Глава 1.");
    await expectNoOverflow(page);

    await page.getByRole("link", { name: "К книге", exact: true }).click();
    const downloadLink = page.getByRole("link", { name: "Скачать", exact: true });
    const downloaded = page.waitForEvent("download");
    await downloadLink.press("Enter");
    expect((await downloaded).suggestedFilename()).toMatch(/\.txt$/u);
    await expect(downloadLink).toBeFocused();

    await page.getByRole("link", { name: "Профиль", exact: true }).click();
    await page.getByRole("link", { name: "Библиотека", exact: true }).click();
    const filter = page.getByRole("combobox", { name: "Предмет" });
    await expect(filter).toBeEnabled();
    await filter.focus();
    await filter.selectOption({ label: "Экономика" });
    await expect(page).toHaveURL(`/prototype#library${subjectQuery}`);
    const book = page.getByRole("link", { name: "Практикум по экономике кампуса" });
    await expect(book).toBeVisible();
    await expect(page.getByRole("link", { name: "Основы международного сотрудничества" })).toHaveCount(0);
    await expect(filter).toBeFocused();
    await expectNoOverflow(page);
    await book.press("Enter");
    await expect(page).toHaveURL(`/prototype#library/${printBook}${subjectQuery}`);
    await expect(page.getByText("Электронная версия недоступна.")).toBeVisible();
    await page.getByRole("link", { name: "К библиотеке", exact: true }).click();
    await expect(book).toBeFocused();
    await book.press("Enter");
    const bookButton = page.getByRole("button", { name: "Забронировать в библиотеке" });
    const cancel = page.getByRole("button", { name: "Отменить бронь" });
    try {
      await bookButton.press("Enter");
      await expect(cancel).toBeFocused();
      await expect(cancel).toBeEnabled();
      await page.reload();
      await expect(cancel).toBeEnabled();
      await expectNoOverflow(page);
      await cancel.press("Enter");
      await expect(bookButton).toBeFocused();
      await expect(bookButton).toBeEnabled();
    } finally {
      if (await cancel.isVisible()) await cancel.click();
    }

    await page.getByRole("link", { name: "К библиотеке", exact: true }).click();
    await expect(filter).toHaveValue(economics);
    await expect(page.getByRole("heading", { name: "Библиотека", exact: true })).toBeFocused();
    await page.goto(`/prototype#library/${printBook}/read${subjectQuery}`);
    await expect(page.getByText("Страница недоступна", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "К книге", exact: true })).toHaveAttribute("href", `#library/${printBook}${subjectQuery}`);

    if (theme === "light") {
      const failedFilter = (url: URL) =>
        url.pathname === "/api/v1/library" && url.searchParams.get("subjectId") === missingSubject;
      await page.route(failedFilter, route => route.fulfill({ status: 503 }));
      await page.goto(`/prototype#library?subjectId=${missingSubject}`);
      await expect(page.getByText("Не удалось загрузить данные.", { exact: true })).toBeVisible();
      await page.unroute(failedFilter);
      await page.getByRole("button", { name: "Повторить", exact: true }).click();
      await expect(page.getByText("По этому предмету книг пока нет.", { exact: true })).toBeVisible();
      await filter.selectOption({ label: "Все предметы" });
      await expect(page.getByRole("link", { name: "Основы международного сотрудничества" })).toBeVisible();
    } else {
      const otherTab = await page.context().newPage();
      await otherTab.goto(`/prototype#library/${onlineBook}/read`);
      await expect(otherTab.getByRole("article")).toContainText("Глава 1.");
      await page.getByRole("link", { name: "Профиль", exact: true }).click();
      await page.getByRole("tab", { name: "Настройки" }).click();
      await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await expect(otherTab.getByRole("heading", { name: "Вход в кабинет" })).toBeVisible();
      await expect(otherTab.getByRole("article")).toHaveCount(0);
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Вход в кабинет" })).toBeVisible();
      await expect(page.getByRole("link", { name: "К книге", exact: true })).toHaveCount(0);
    }
  });
}
