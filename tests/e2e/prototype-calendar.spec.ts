import { expect, test, type CDPSession, type Locator } from "@playwright/test";
import { eventList } from "../../src/contracts/publications";
import { signInToPrototype } from "./prototype-session";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 560 } });
test.skip(({ browserName }) => browserName !== "chromium", "Touch gestures use Chromium CDP.");
test.beforeEach(async ({ page, baseURL }) => { await signInToPrototype(page.request, baseURL); });

const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dateValue = (value: string) => new Date(value + "T12:00:00Z");

function monthInfo(date: string, offset = 0) {
  const value = dateValue(date);
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + offset;
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const days = last.getUTCDate();
  const firstColumn = (first.getUTCDay() + 6) % 7;
  return {
    first: first.toISOString().slice(0, 10),
    last: last.toISOString().slice(0, 10),
    days,
    cells: Math.ceil((firstColumn + days) / 7) * 7,
  };
}

async function swipe(touch: CDPSession, target: Locator, dx: number, dy = 0) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 5; step++) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...start, x: start.x + dx * step / 5, y: start.y + dy * step / 5 }],
    });
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

for (const colorScheme of ["light", "dark"] as const) {
  test("calendar touch navigation in " + colorScheme + " theme", async ({ context, page }) => {
    const response = await page.request.get("/api/v1/events");
    expect(response.status()).toBe(200);
    const { items: events } = eventList.parse(await response.json());
    const eventsOn = (date: string) => events.filter(event => event.startsOn <= date && date <= event.endsOn);
    const fixture = events.find(event => event.startsOn === event.endsOn &&
      dateValue(event.startsOn).getUTCDate() <= 28 && eventsOn(event.startsOn).length === 1);
    if (!fixture) throw new Error("Seed one event on its own calendar day between the 1st and 28th.");

    const fixtureDate = fixture.startsOn;
    const month = monthInfo(fixtureDate);
    const nextMonth = monthInfo(fixtureDate, 1);
    const emptyDate = Array.from({ length: month.days }, (_, index) =>
      month.first.slice(0, 8) + String(index + 1).padStart(2, "0"),
    ).find(date => eventsOn(date).length === 0);
    if (!emptyDate) throw new Error("The seeded calendar month needs a day without events.");

    await page.clock.setFixedTime(dateValue(fixtureDate));
    await page.emulateMedia({ colorScheme });
    await page.goto("/prototype#events", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Календарь событий", level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".interface-prototype")).toHaveAttribute("data-mode", colorScheme);
    const touch = await context.newCDPSession(page);
    const grid = page.getByRole("group", { name: "Даты месяца" });
    const days = grid.getByRole("button");
    await expect(days).toHaveCount(month.days);
    await expect(days.first()).toHaveAttribute("data-date", month.first);
    await expect(grid.getByRole("img", { name: fixture.title, exact: true }).and(grid.locator('[data-start="' + fixtureDate + '"]'))).toBeVisible();
    await expect(page.getByRole("group", { name: "Вид календаря" })).toHaveCount(0);
    const cells = await grid.locator(".hm-dates > *").evaluateAll(nodes => nodes.map(node => {
      const { width, height } = node.getBoundingClientRect();
      return { width, height };
    }));
    expect(cells).toHaveLength(month.cells);
    expect(cells.every(cell => cell.width >= 48 && cell.height === 66)).toBe(true);
    expect(await grid.locator(".hm-week-events").evaluateAll(nodes =>
      nodes.every(node => getComputedStyle(node).gridTemplateRows.split(" ").length === 4),
    )).toBe(true);
    const today = grid.locator('button[aria-current="date"]');
    await expect(today).toHaveAttribute("data-date", fixtureDate);
    await expect(today).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(today.locator(".hm-day-number")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    const cards = page.locator(".hm-event-list");
    const selectedHeading = cards.getByRole("heading", { level: 3 });
    await expect(selectedHeading).toContainText(dayFormat.format(dateValue(fixtureDate)));
    const emptyDay = grid.locator('[data-date="' + emptyDate + '"]');
    await emptyDay.tap({ position: { x: 24, y: cells[0].height - 8 } });
    await expect(emptyDay).toHaveAttribute("aria-pressed", "true");
    await expect(cards.getByText("На эту дату событий нет.")).toBeVisible();

    const eventDay = grid.locator('[data-date="' + fixtureDate + '"]');
    await eventDay.tap();
    await expect(eventDay).toHaveAttribute("aria-pressed", "true");
    await expect(selectedHeading).toBeFocused();
    await expect(cards.getByRole("link")).toHaveCount(1);
    const eventLink = cards.getByRole("link", { name: fixture.title, exact: true });
    await eventLink.tap();
    await expect(page).toHaveURL(url => url.hash === "#events/" + fixture.id);
    await expect(page.getByRole("heading", { level: 1, name: fixture.title, exact: true })).toBeVisible();
    await page.goBack();
    await expect(eventDay).toHaveAttribute("aria-pressed", "true");
    await expect(eventLink).toBeFocused();
    await expect(grid.getByRole("img", { name: fixture.title, exact: true }).and(grid.locator('[data-start="' + fixtureDate + '"]'))).toBeVisible();

    await swipe(touch, grid.locator(".hm-weekdays"), -112);
    await expect(days.first()).toHaveAttribute("data-date", nextMonth.first);
    await expect(days.last()).toHaveAttribute("data-date", nextMonth.last);

    await swipe(touch, days.first(), 112);
    await expect(days.first()).toHaveAttribute("data-date", month.first);
    await expect(eventDay).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.scrollTo(0, 0));
    const weekdays = grid.locator(".hm-weekdays");
    await weekdays.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await swipe(touch, weekdays, 0, -110);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    await expect(days.first()).toHaveAttribute("data-date", month.first);

    await page.getByRole("button", { name: "Следующий месяц" }).press("Enter");
    await expect(days.first()).toHaveAttribute("data-date", nextMonth.first);
    await page.getByRole("button", { name: "Сегодня", exact: true }).press("Enter");
    await expect(grid.locator('[aria-pressed="true"]')).toHaveAttribute("data-date", fixtureDate);
    await expect(selectedHeading).toContainText(dayFormat.format(dateValue(fixtureDate)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  });
}
