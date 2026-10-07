/* Public index — E2E with a fully mocked Supabase (see ./mocks.js).
   Asserts what wave 21 shipped: a TML-first dashboard with charts + KPIs and
   NO attendance surface, fed exclusively by the five public tables. */
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
  await expect(page.locator("#tml-record")).toContainText(expected.tmlRecord);
  await expect(page.locator("#perf-tml-trend svg.trend-svg")).toHaveCount(1);
  await expect(page.locator("#perf-friendly-trend svg.trend-svg")).toHaveCount(1);
  await expect(page.locator("#perf-tml-kpi .kpi")).toHaveCount(expected.tmlKpiTiles);
  await expect(page.locator("#perf-tml-kpi")).toContainText("Goals / game");
  await expect(page.locator("#perf-tml-kpi")).not.toContainText("Attendance");
  await expect(page.locator("#tml-results a.match")).toHaveCount(expected.tmlResults);
  await expect(page.locator("#fixtures .fixture")).toHaveCount(expected.fixtures);
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
