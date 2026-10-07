/* Public index — E2E with a fully mocked Supabase (see ./mocks.js).
   Wave 21's TML-first dashboard (charts + KPIs, no attendance surface), plus
   wave 23's rework: matchday-first hero, the unified segmented stat band,
   bento layout, result badges — and the fixture CSS-leak regression. */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, publicOnly, fitsViewport } = require("./mocks");
const { expected } = require("../fixtures/public-data");

let api;
let errors;

test.beforeEach(async ({ page }) => {
  api = await mockSupabase(page);
  errors = watchErrors(page);
  await page.goto("/index.html");
});

test("renders the TML record, trends and KPIs from the fixture data", async ({ page }) => {
  await expect(page.locator("#season-record")).toContainText(expected.tmlRecord);
  await expect(page.locator("#perf-tml-trend svg.trend-svg")).toHaveCount(1);
  await expect(page.locator("#perf-friendly-trend svg.trend-svg")).toHaveCount(1);
  await expect(page.locator("#perf-tml-kpi .kpi")).toHaveCount(expected.tmlKpiTiles);
  await expect(page.locator("#perf-tml-kpi")).toContainText("Goals / game");
  await expect(page.locator("#perf-tml-kpi")).not.toContainText("Attendance");
  await expect(page.locator("#tml-results a.match")).toHaveCount(expected.tmlResults);
  await expect(page.locator("#fixtures .fixture")).toHaveCount(expected.fixtures);
});

test("wave 23: matchday-first hero shows the next fixture and the last result", async ({ page }) => {
  await expect(page.locator("#matchday .md-card")).toHaveCount(2); // next match + last result
  await expect(page.locator("#matchday .md-card").first()).toContainText("vs Titans FC");
  await expect(page.locator("#matchday .md-card").first()).toContainText("14:00"); // kickoff
  const badge = page.locator("#matchday .result-badge");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveClass(/win/); // last final: m4 4–1 vs Comets SC
  await expect(badge).toHaveText("W");
});

test("wave 23: the segmented stat band switches lens without a reload", async ({ page }) => {
  await expect(page.locator("#season-record")).toContainText(expected.tmlRecord); // 2–1–1
  await expect(page.locator("#season-goal-diff")).toHaveText("+2"); // 7 for, 5 against
  await expect(page.locator("#season-win-rate")).toHaveText("50%");
  await expect(page.locator('[data-seg="tml"]')).toHaveAttribute("aria-pressed", "true");
  await page.click('[data-seg="friendly"]');
  await expect(page.locator("#season-record")).toContainText("1–1–1");
  await expect(page.locator("#season-win-rate")).toHaveText("33%");
  await expect(page.locator('[data-seg="friendly"]')).toHaveAttribute("aria-pressed", "true");
  await page.click('[data-seg="all"]');
  await expect(page.locator("#season-record")).toContainText("3–2–2");
  await expect(page.locator("#season-clean-sheets")).toHaveText("2"); // m1 + f2
});

test("wave 23: fixture text stays readable on the navy card (CSS-leak regression)", async ({ page }) => {
  const fixture = page.locator("#fixtures .fixture").first();
  await expect(fixture).toBeVisible();
  const colors = await fixture.evaluate((card) => {
    const read = (selector) => {
      const node = card.querySelector(selector);
      return node ? getComputedStyle(node).color : null;
    };
    return { bg: getComputedStyle(card).backgroundColor, date: read(".fixture-date"), opponent: read(".fixture-opponent"), time: read(".fixture-time") };
  });
  // the coach .fixture-card rules used to cascade in and paint this text the
  // same navy as the card background (invisible); none may match it now.
  for (const color of [colors.date, colors.opponent, colors.time]) expect(color).not.toBe(colors.bg);
});

test("wave 21: attendance is not a surface anywhere on the page", async ({ page }) => {
  await expect(page.locator(".attendance-panel")).toHaveCount(0);
  await expect(page.locator("#attendance-search")).toHaveCount(0);
  await expect(page.locator("table")).toHaveCount(0); // no tables at all on the index
  await expect(page.locator("body")).not.toContainText(/attendance/i);
});

test("squad chips show the TML core; the injury panel shows current injuries", async ({ page }) => {
  const chips = page.locator("#squad-chips .squad-chip");
  await expect(chips).toHaveCount(expected.coreChips.length);
  for (const name of expected.coreChips) await expect(page.locator("#squad-chips")).toContainText(name);
  await expect(page.locator("#squad-status")).toBeVisible();
  await expect(page.locator("#injury-list .injury-card")).toHaveCount(expected.injuryCards);
});

test("requests only the public tables, from the project host, and logs no errors", async ({ page }) => {
  await expect(page.locator("#squad-chips .squad-chip")).toHaveCount(expected.coreChips.length);
  expect(publicOnly(api)).toBe(true);
  expect(api.denied).toEqual([]);
  expect(errors).toEqual([]);
});

test("language switch re-renders the page in Japanese and survives a reload", async ({ page }) => {
  await expect(page.locator('h2[data-i18n="results"]').first()).toHaveText("Results");
  await page.selectOption("#lang-select", "ja");
  await expect(page.locator('h2[data-i18n="results"]').first()).toHaveText("リザルト");
  await page.reload();
  await expect(page.locator('h2[data-i18n="results"]').first()).toHaveText("リザルト");
  await expect(page.locator("#lang-select")).toHaveValue("ja");
});

for (const width of [320, 390, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("#squad-chips .squad-chip")).toHaveCount(expected.coreChips.length);
    expect(await fitsViewport(page)).toBe(true);
  });
}
