import { expect, test } from "@playwright/test";
import { signInToPrototype } from "./prototype-session";

for (const width of [320, 360, 393]) for (const colorScheme of ["light", "dark"] as const) {
  test(`notification filters at ${width}px in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 800 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await signInToPrototype(page.request, baseURL, "A");
    await page.goto("/prototype#inbox");
    const filters = page.getByRole("group", { name: "Тип уведомления" });
    const buttons = filters.getByRole("button");
    await expect(buttons).toHaveText(["Все", "Важное", "Оценки", "Напоминания", "Заявки"]);
    const positions = await buttons.evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    }));
    expect(new Set(positions.map(position => position.top)).size).toBe(1);
    expect(positions.every(position => position.height === 32)).toBe(true);
    if (width >= 360) {
      expect(await filters.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const bounds = await filters.evaluate(node => {
        const container = node.getBoundingClientRect();
        const panel = document.querySelector(".p-inbox-panel")!.getBoundingClientRect();
        return { left: container.left - panel.left, right: container.right - panel.right };
      });
      expect(Math.abs(bounds.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds.right)).toBeLessThanOrEqual(1);
    }
    await buttons.last().click();
    await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => buttons.last().evaluate(node => {
      const button = node.getBoundingClientRect();
      const container = node.parentElement!.getBoundingClientRect();
      return button.left >= container.left && button.right <= container.right;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`desktop sidebar spacing in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await signInToPrototype(page.request, baseURL, "A");
    await page.goto("/prototype#inbox");
    const sidebar = page.locator(".p-sidebar");
    const logo = sidebar.locator(".p-wordmark");
    const assistant = sidebar.locator(".p-sidebar-ai");
    await expect(assistant).toBeVisible();
    await expect(logo).toHaveCSS("border-bottom-width", "1px");
    await expect(sidebar.locator(".p-sidebar-ai-slot")).toHaveCSS("border-bottom-width", "0px");
    const metrics = await sidebar.evaluate(node => {
      const logo = node.querySelector(".p-wordmark")!.getBoundingClientRect();
      const assistant = node.querySelector(".p-sidebar-ai")!.getBoundingClientRect();
      const study = node.querySelector(".p-nav-group p")!.getBoundingClientRect();
      const nav = node.querySelector(".p-desktop-nav")!;
      return { above: assistant.top - logo.bottom, below: study.top - assistant.bottom, scroll: nav.scrollHeight - nav.clientHeight };
    });
    expect(metrics.above).toBeGreaterThan(metrics.below);
    expect(metrics.scroll).toBeLessThanOrEqual(1);
  });
}
