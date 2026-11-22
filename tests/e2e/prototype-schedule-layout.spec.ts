import { expect, test } from "@playwright/test";
import { signInToPrototype } from "./prototype-session";

for (const width of [360, 1440]) for (const colorScheme of ["light", "dark"] as const) {
  test(`schedule ${width} ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await signInToPrototype(page.request, baseURL);
    await page.goto("/prototype#schedule?date=2026-11-23&view=week");
    await expect(page.getByRole("heading", { name: "Расписание", exact: true })).toBeVisible();
    await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", colorScheme);
    await expect(page.locator(".sw-lesson").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const labels = await page.locator(".sw-lesson").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
    for (const kind of ["Лекция", "Семинар", "Практика", "Лабораторная работа"]) expect(labels.some(label => label?.includes(kind))).toBe(true);
    await page.screenshot({ path: `/tmp/schedule-week-${width}-${colorScheme}.png`, fullPage: true });
    if (width === 360) {
      const lesson = page.locator(".sw-lesson").first();
      await expect(lesson.locator(".sw-code")).toBeVisible();
      await lesson.click();
      await expect(page.locator(".sg-mobile-selected .sg-agenda-item").first()).toBeVisible();
    } else {
      const panel = page.getByRole("region", { name: "Поиск расписания" });
      await expect(panel).toBeVisible();
      await panel.getByRole("searchbox").fill("несуществующая фамилия");
      await expect(panel.getByText(/Ничего не найдено/)).toBeVisible();
      const previous = await page.locator(".sg-week-indicator").textContent();
      await page.getByRole("button", { name: "Следующая неделя" }).click();
      await expect.poll(async () => page.locator(".sg-week-indicator").textContent()).not.toBe(previous);
      await page.getByRole("button", { name: "Предыдущая неделя" }).click();
      await expect(page.locator(".sg-week-indicator")).toHaveText(previous!);
      await expect(panel).toBeVisible();
    }
    await page.screenshot({ path: `/tmp/schedule-${width}-${colorScheme}.png`, fullPage: true });
  });
}
