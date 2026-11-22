import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, test, type Page } from "@playwright/test";

const origin = process.env.ATLAS_UI_ORIGIN;

test.skip(!origin, "Requires an isolated Atlas stand with ATLAS_UI_ORIGIN.");
test.use({ baseURL: origin, viewport: { width: 360, height: 780 } });

async function signIn(page: Page, account: "A" | "B") {
  const env = parseEnv(readFileSync(".env", "utf8"));
  await expect(page.getByRole("heading", { name: "Вход в кабинет" })).toBeVisible();
  await page.getByLabel("Логин", { exact: true }).fill(env[`DEMO_${account}_LOGIN`]!);
  await page.getByLabel("Пароль", { exact: true }).fill(env[`DEMO_${account}_PASSWORD`]!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("Clinic Passport appointment and cancellation persist at 360 px", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/prototype#clinic");
  await expect(page.getByRole("heading", { name: "Поликлиника", exact: true })).toHaveCount(0);
  await signIn(page, "A");
  await expect(page).toHaveURL("/prototype#clinic");
  await expect(page.getByRole("heading", { name: "Поликлиника", exact: true })).toBeFocused();
  await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", "light");
  await expect(page.getByText("Обновлён после приёма")).toBeVisible();
  await expect(page.getByText("Согласовано", { exact: true })).toBeVisible();
  await expect(page.getByText("Анна Соколова", { exact: true })).toBeVisible();
  await expectNoOverflow(page);

  const date = page.getByRole("button", { name: /24 ноября/ });
  await date.press("Space");
  const slot = page.getByRole("button", { name: "12:00", exact: true });
  await slot.press("Enter");
  await expect(page.getByRole("heading", { name: "Проверьте запись" })).toBeFocused();
  await expect(page.getByText(/24 ноября.*12:00/)).toBeVisible();
  await page.getByRole("button", { name: "Изменить время", exact: true }).click();
  await date.press("Space");
  await slot.click();
  await page.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(page.getByRole("heading", { name: "Моя запись" })).toBeFocused();
  await expect(page.getByText("Запись подтверждена")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Моя запись" })).toBeVisible();
  await page.getByRole("link", { name: "К профилю" }).click();
  const clinicLink = page.getByRole("navigation", { name: "Кампус" }).getByRole("link", { name: "Поликлиника" });
  await clinicLink.click();
  await expect(page.getByText(/24 ноября.*12:00/)).toBeVisible();
  await page.goBack();
  await expect(clinicLink).toBeFocused();
  await clinicLink.press("Enter");
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await expect(page.getByRole("region", { name: "Запись к врачу факультета" }).getByRole("status")).toContainText("Запись отменена");
  await date.press("Space");
  await expect(slot).toBeVisible();
  await expectNoOverflow(page);
});

test("VUC checklist resets and Clinic shows the new signed-in owner", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/prototype#vuc");
  await signIn(page, "A");
  await expect(page).toHaveURL("/prototype#vuc");
  await expect(page.getByRole("heading", { name: "Военный учебный центр", exact: true })).toBeFocused();
  await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", "dark");
  const conditions = page.getByRole("checkbox", { name: "Уточнить условия набора" });
  await conditions.press("Space");
  await expect(page.getByRole("region", { name: "Чек-лист подготовки" }).getByRole("status")).toContainText("Выполнено 1 из 4");
  await page.getByText("Где уточнить условия и документы?", { exact: true }).press("Enter");
  await expect(page.getByText(/В примере консультации проходят/)).toBeVisible();
  await expectNoOverflow(page);

  for (const width of [768, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
  }

  const navigation = page.getByRole("navigation", { name: "Основная навигация", exact: true });
  await page.reload();
  await expect(conditions).not.toBeChecked();
  await conditions.check();

  await page.getByRole("link", { name: "К профилю" }).click();
  await page.getByRole("tab", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("heading", { name: "Вход в кабинет" })).toBeVisible();
  await page.goto("/prototype#vuc");
  await expect(page.getByRole("heading", { name: "Военный учебный центр", exact: true })).toHaveCount(0);
  await signIn(page, "B");
  await expect(conditions).not.toBeChecked();
  await navigation.getByRole("link", { name: "Поликлиника" }).click();
  await expect(page.getByText("Илья Ветров", { exact: true })).toBeVisible();
  await expect(page.getByText("Отклонено", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
});
