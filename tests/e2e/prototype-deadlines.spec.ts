import { expect, test, type Locator, type Page } from "@playwright/test";
import { deadlinesResponse } from "../../src/contracts/academics";
import { assignmentItem, assignmentLabel } from "../../src/contracts/assignments";
import { addDays, dateInMoscow, mondayOf } from "../../src/contracts/calendar";
import { signInToPrototype } from "./prototype-session";

async function openDeadlines(page: Page, colorScheme: "light" | "dark", baseURL: string | undefined) {
  await signInToPrototype(page.request, baseURL);
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/deadlines");
  await page.goto("/prototype#deadlines", { waitUntil: "domcontentloaded" });
  const response = await loaded;
  expect(response.status()).toBe(200);
  const data = deadlinesResponse.parse(await response.json());
  await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", colorScheme);
  const board = page.getByRole("region", { name: "Дедлайны", exact: true });
  await expect(board.getByRole("heading", { name: "Дедлайны", level: 1 })).toBeVisible();
  return { board, data };
}

async function measureColors(locator: Locator) {
  return locator.evaluateAll(nodes => {
    type Rgba = [number, number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not resolve rendered colors");

    const parse = (value: string): Rgba => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha / 255];
    };

    function over([r, g, b, alpha]: Rgba, background: Rgba): Rgba {
      return [r * alpha + background[0] * (1 - alpha), g * alpha + background[1] * (1 - alpha),
        b * alpha + background[2] * (1 - alpha), 1];
    }

    function backgroundOf(node: Element | null): Rgba {
      if (!node) return [255, 255, 255, 1];
      const fill = parse(getComputedStyle(node).backgroundColor);
      return fill[3] === 1 ? fill : over(fill, backgroundOf(node.parentElement));
    }

    function luminance(color: Rgba) {
      const [red, green, blue] = color.map(channel => {
        const encoded = channel / 255;
        return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }

    const contrast = (first: Rgba, second: Rgba) => {
      const values = [luminance(first), luminance(second)];
      return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    };

    return nodes.map(node => {
      const style = getComputedStyle(node);
      const color = parse(style.color);
      const fill = parse(style.backgroundColor);
      const background = backgroundOf(node);
      return {
        text: node.textContent?.trim(), color, fill, background,
        contrast: contrast(over(color, background), background),
        outlineContrast: contrast(over(parse(style.outlineColor), background), background),
        outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
        border: style.borderTopStyle, borderWidth: parseFloat(style.borderTopWidth),
        borderColor: parse(style.borderTopColor), radius: parseFloat(style.borderTopLeftRadius),
        textTransform: style.textTransform, weight: Number(style.fontWeight), size: parseFloat(style.fontSize),
      };
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [360, 1440]) {
    test(`deadline lists at ${width}px in ${colorScheme} theme`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 850 });
      const { board, data } = await openDeadlines(page, colorScheme, baseURL);
      const sections = board.locator(".dld-panel");
      const overdue = board.getByRole("region", { name: "Просрочено", exact: true });
      const today = board.getByRole("region", { name: "Сегодня", exact: true });
      const later = board.getByRole("region", { name: "Позже", exact: true });

      await expect(sections).toHaveCount(3);
      await expect(board.getByRole("button")).toHaveCount(3);
      await expect(board.locator('button[aria-expanded="true"]')).toHaveCount(3);
      const datesFromApi = data.items.map(item => dateInMoscow(item.dueAt));
      const overdueCount = datesFromApi.filter(date => date < data.today).length;
      const todayCount = datesFromApi.filter(date => date === data.today).length;
      const laterDates = datesFromApi.filter(date => date > data.today).sort();
      const weekCounts = new Map<string, number>();
      for (const date of laterDates) {
        const week = mondayOf(date);
        weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
      }
      await expect(overdue.getByRole("link")).toHaveCount(overdueCount);
      await expect(today.getByRole("link")).toHaveCount(todayCount);
      await expect(later.getByRole("link")).toHaveCount(laterDates.length);
      expect(await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ width, overflow: false });
      const targets = await board.locator("button, .dld-task-link").evaluateAll(nodes => nodes.map(node => {
        const { width, height } = node.getBoundingClientRect();
        return { width, height, label: node.getAttribute("aria-label") };
      }));
      expect(targets).toHaveLength(data.items.length + 3);
      expect(targets.filter(target => target.width < 48 || target.height < 48)).toEqual([]);

      const listBoxes = sections.locator(":scope > .dld-status-works");
      await expect(listBoxes).toHaveCount(3);
      const shapes = await measureColors(listBoxes);
      expect(shapes.every(item => item.fill[3] === 1 && item.border === "solid" && item.borderWidth === 1 && item.radius > 0)).toBe(true);
      expect(new Set(shapes.map(item => item.fill.join())).size).toBe(1);
      expect(new Set(shapes.map(item => item.borderColor.join())).size).toBe(1);
      const panels = await measureColors(sections);
      const expectedPanelFills = colorScheme === "light"
        ? [[246, 226, 225, 1], [245, 234, 219, 1], [232, 238, 245, 1]]
        : [[49, 29, 36, 1], [46, 34, 28, 1], [28, 34, 48, 1]];
      expect(panels.map(item => item.fill)).toEqual(expectedPanelFills);
      expect(panels.every(item => item.borderWidth === 0)).toBe(true);
      const rows = await measureColors(sections.locator(".dld-task-link"));
      expect(rows.every(item => item.fill[3] === 0 && item.borderWidth === 0 && item.background.join() === shapes[0].background.join())).toBe(true);
      const rules = await measureColors(sections.locator(".dld-task-list li + li, .dld-later-week + .dld-later-week"));
      const openGroups = Number(overdueCount > 0) + Number(todayCount > 0) + Number(laterDates.length > 0);
      expect(rules).toHaveLength(data.items.length - openGroups);
      expect(rules.every(item => item.border === "solid" && item.borderWidth === 1 && item.borderColor.join() === shapes[0].borderColor.join())).toBe(true);
      const positioned = await sections.evaluateAll(nodes => nodes.map(node => {
        const heading = node.querySelector(":scope > h2")!.getBoundingClientRect();
        const list = node.querySelector(":scope > .dld-status-works")!.getBoundingClientRect();
        return { left: list.left, top: heading.top, bottom: list.bottom, width: list.width, headersAbove: heading.bottom <= list.top };
      }));
      expect(positioned.every(item => item.headersAbove)).toBe(true);
      const [overdueBox, todayBox, laterBox] = positioned;
      if (width === 360) {
        expect(laterBox.left).toBe(overdueBox.left);
        expect(laterBox.top).toBeGreaterThan(todayBox.bottom);
      } else {
        expect(laterBox.left).toBeGreaterThan(overdueBox.left + overdueBox.width);
        expect(laterBox.top).toBe(overdueBox.top);
        expect(laterBox.width).toBeGreaterThan(overdueBox.width);
      }

      const headings = sections.getByRole("button");
      const counts = await measureColors(sections.locator(".dld-count"));
      expect(counts.map(item => item.text)).toEqual([overdueCount, todayCount, laterDates.length].map(String));
      expect(new Set(counts.map(item => item.fill.join())).size).toBe(1);
      expect(new Set(counts.map(item => item.color.join())).size).toBe(1);
      const headerStyles = await measureColors(headings);
      expect(headerStyles.every(item => item.fill[3] === 0 && item.borderWidth === 0)).toBe(true);
      expect(headerStyles.every(item => item.contrast >= 4.5)).toBe(true);
      const [iconOverdue, iconToday, iconLater] = await measureColors(sections.locator(".dld-heading-icon"));
      const amber = colorScheme === "light" ? [128, 80, 13, 1] : [241, 201, 137, 1];
      const coral = colorScheme === "light" ? [162, 63, 59, 1] : [255, 164, 154, 1];
      expect(iconOverdue.color).toEqual(coral);
      expect(iconToday.color).toEqual(amber);
      for (const section of [overdue, today, later]) {
        const [day, month] = await measureColors(section.locator("time").first().locator("strong, span"));
        if (!day) continue;
        expect(day.size).toBeGreaterThan(month.size);
        if (section === today) {
          expect(day.color).toEqual(amber);
          expect(month.color).toEqual(amber);
        } else if (section === overdue) {
          expect(day.color).toEqual(coral);
          expect(month.color).toEqual(coral);
        } else {
          const [subject] = await measureColors(section.locator(".dld-task-subject").first());
          expect(day.color).toEqual(subject.color);
          expect(month.color).toEqual(iconLater.color);
          expect(day.color).not.toEqual(month.color);
        }
      }

      const weeks = later.locator(".dld-later-week");
      expect(await weeks.evaluateAll(nodes => nodes.map(week => [week.getAttribute("data-week-start"), week.querySelectorAll("a").length]))).toEqual([...weekCounts]);
      const weekLabels = await measureColors(weeks.getByRole("heading", { level: 3 }));
      const thisMonday = mondayOf(data.today);
      const nextMonday = addDays(thisMonday, 7);
      const weekStartDates = [...weekCounts.keys()];
      for (const [index, label] of weekLabels.entries()) {
        const weekStart = weekStartDates[index];
        if (weekStart === thisMonday) expect(label.text).toBe("На этой неделе");
        else if (weekStart === nextMonday) expect(label.text).toBe("На следующей неделе");
        expect(label.fill).toEqual(counts[0].fill);
        expect(label.color).toEqual(iconLater.color);
        expect(label.borderWidth).toBe(0);
        expect(label.textTransform).toBe("uppercase");
      }
      const dates = await measureColors(sections.locator("time strong, time span"));
      const chips = await measureColors(sections.locator(".dld-task-type"));
      const titles = await measureColors(sections.locator(".dld-task-title"));
      const subjects = await measureColors(sections.locator(".dld-task-subject"));
      const namedSubjects = await measureColors(sections.locator(".dld-task:has(.dld-task-title) .dld-task-subject"));
      expect(titles).toHaveLength(data.items.filter(item => item.subjectTitle).length);
      expect(namedSubjects.every((subject, index) => subject.size > titles[index].size && subject.weight > titles[index].weight)).toBe(true);
      // Compare categories and rendered labels by API item, including unnumbered assignments.
      const categories = new Map([["dz", "homework"], ["rk", "control"], ["lr", "lab"]]);
      const categoryColors = new Map<string, string>();
      for (const item of data.items) {
        if (item.target.kind !== "assignment") continue;
        const chip = board.locator("#deadline-link-" + item.id + " .dld-task-type");
        await expect(chip).toHaveText(assignmentLabel(item.target.workKind, item.target.number));
        const category = categories.get(item.target.workKind);
        if (!category) continue;
        await expect(chip).toHaveAttribute("data-academic-category", category);
        if (!categoryColors.has(category)) categoryColors.set(category, (await measureColors(chip))[0].fill.join());
      }
      expect(new Set(categoryColors.values()).size).toBe(categoryColors.size);
      const icons = [iconOverdue, iconToday, iconLater];
      const minText = Math.min(...[...dates, ...chips, ...subjects, ...titles, ...counts, ...weekLabels].map(item => item.contrast));
      const minIcon = Math.min(...icons.map(item => item.contrast));
      expect(minText).toBeGreaterThanOrEqual(4.5);
      expect(minIcon).toBeGreaterThanOrEqual(3);
      console.log(`${width}px ${colorScheme}: list widths ${positioned.map(item => item.width.toFixed(0)).join("/")}px; min text ${minText.toFixed(2)}:1, min icon ${minIcon.toFixed(2)}:1`);
    });
  }
}

test("deadline folds support keyboard and touch and preserve focus and state after work details", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 360, height: 850 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    const { board, data } = await openDeadlines(page, "light", baseURL);
    const overdue = board.getByRole("region", { name: "Просрочено", exact: true });
    const later = board.getByRole("region", { name: "Позже", exact: true });
    const assignments = data.items.filter(item => item.target.kind === "assignment");
    const work = assignments.find(item => dateInMoscow(item.dueAt) >= data.today) ?? assignments[0];
    const retain = work && dateInMoscow(work.dueAt) < data.today ? later : overdue;
    const touchSection = retain === overdue ? later : overdue;
    const keyToggle = retain.getByRole("button");
    const touchToggle = touchSection.getByRole("button");

    await keyToggle.press("Enter");
    await expect(keyToggle).toHaveAttribute("aria-expanded", "false");
    await expect(keyToggle).toBeFocused();
    await expect(retain.getByRole("link")).toHaveCount(0);
    const [focus] = await measureColors(keyToggle);
    expect(focus.outline).not.toBe("none");
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focus.outlineContrast).toBeGreaterThanOrEqual(3);

    await touchToggle.tap();
    await expect(touchToggle).toHaveAttribute("aria-expanded", "false");
    await expect(touchSection.getByRole("link")).toHaveCount(0);
    await touchToggle.tap();
    await expect(touchToggle).toHaveAttribute("aria-expanded", "true");

    if (!work) {
      test.info().annotations.push({ type: "coverage", description: "The seed has no open assignment to verify details return." });
      return;
    }
    const workLink = board.locator("#deadline-link-" + work.id);
    await workLink.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const scroll = await page.evaluate(() => scrollY);
    const detail = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/assignments/" + work.target.id);
    await workLink.tap();
    await expect(page).toHaveURL(url => url.hash.split("?")[0] === "#work/" + work.target.id);
    const detailResponse = await detail;
    expect(detailResponse.status()).toBe(200);
    const assignment = assignmentItem.parse(await detailResponse.json());
    await expect(page.getByRole("heading", { name: assignment.title, exact: true, level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/#deadlines$/);
    await expect(workLink).toBeFocused();
    await expect(keyToggle).toHaveAttribute("aria-expanded", "false");
    await expect(touchToggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThanOrEqual(2);
  } finally {
    await context.close();
  }
});
