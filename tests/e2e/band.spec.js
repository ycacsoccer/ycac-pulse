const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");
const fixtures = require("../fixtures/public-data");
const { generate } = require("../../band.js");
const example = { id: "x1", date: "2026-10-31", opponent: "Kilimanjaro FC", venue: "YC&AC", kickoff: "18:00", competition: "TML Division 3", ycac_goals: null, opponent_goals: null };

async function setup(page, match = example) {
  await mockSupabase(page);
  await page.route("**/rest/v1/matches?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(fixtures.matches.map((row) => row.id === "x1" ? match : row)) }));
}

test("upcoming matches offer both supplied BAND templates and copy the edited draft", async ({ page }) => {
  await setup(page);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedBandText = text; } } });
  });
  await page.goto("/match.html?id=x1");
  const panel = page.locator("#band-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator("#band-standard")).toHaveValue(generate(example).standard);
  await expect(page.locator("#band-priority")).toHaveValue(generate(example).priority);
  await expect(page.locator("#band-standardTitle")).toHaveValue(generate(example).standardTitle);
  await expect(page.locator("#band-priorityTitle")).toHaveValue(generate(example).priorityTitle);
  await expect(page.locator("#band-deadline")).toContainText("Priority closes 15 days before at 9pm");
  const standardSettings = panel.locator(".band-draft").nth(0).locator(".band-settings");
  const prioritySettings = panel.locator(".band-draft").nth(1).locator(".band-settings");
  await expect(standardSettings.locator('[data-band-setting="deadline"]')).toContainText("29 Oct 2026 · 21:00 JST");
  await expect(prioritySettings.locator('[data-band-setting="deadline"]')).toContainText("16 Oct 2026 · 21:00 JST");
  await expect(standardSettings.locator('[data-band-setting="deadline-alert"]')).toContainText("28 Oct 2026 · 21:00 JST");
  await expect(prioritySettings.locator('[data-band-setting="deadline-alert"]')).toContainText("15 Oct 2026 · 21:00 JST");
  await expect(panel.locator('[data-band-setting="match-alert"]')).toHaveCount(2);
  for (const settings of [standardSettings, prioritySettings]) await expect(settings.locator('[data-band-setting="match-alert"]')).toContainText("30 Oct 2026 · 21:00 JST");
  await panel.locator('[data-band-copy="standardTitle"]').click();
  await expect(page.locator("#band-status")).toContainText("Copied");
  expect(await page.evaluate(() => window.copiedBandText)).toBe(generate(example).standardTitle);
  const editedTitle = `${generate(example).priorityTitle} — Updated`;
  await page.locator("#band-priorityTitle").fill(editedTitle);
  await panel.locator('[data-band-copy="priorityTitle"]').click();
  expect(await page.evaluate(() => window.copiedBandText)).toBe(editedTitle);
  const edited = `${generate(example).standard}\n\nExtra match-day note`;
  await page.locator("#band-standard").fill(edited);
  await panel.locator('[data-band-copy="standard"]').click();
  await expect(page.locator("#band-status")).toContainText("Copied");
  expect(await page.evaluate(() => window.copiedBandText)).toBe(edited);
  await page.locator("#lang-select").selectOption("ja");
  await expect(panel.locator("h2")).toHaveText("BAND参加申込の下書き");
  await expect(page.locator("#band-standard")).toHaveValue(edited);
  await expect(page.locator("#band-priorityTitle")).toHaveValue(editedTitle);
  await panel.locator('[data-band-copy="priority"]').click();
  expect(await page.evaluate(() => window.copiedBandText)).toBe(generate(example).priority);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).map((element) => ({ tag: element.tagName, id: element.id, class: element.className })).slice(0, 12));
    expect(await fitsViewport(page), JSON.stringify(overflow)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("missing kickoff stays TBC and clipboard denial selects the draft for manual copying", async ({ page }) => {
  await setup(page, { ...example, kickoff: null });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
  });
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#band-standard")).toHaveValue(/KO: 未定 \/ TBC/);
  await page.locator('[data-band-copy="standard"]').click();
  await expect(page.locator("#band-status")).toContainText("copy it manually");
  const selection = await page.locator("#band-standard").evaluate((field) => ({ start: field.selectionStart, end: field.selectionEnd, length: field.value.length }));
  expect(selection).toEqual({ start: 0, end: selection.length, length: selection.length });
  await page.locator('[data-band-copy="priorityTitle"]').click();
  await expect(page.locator("#band-priorityTitle")).toBeFocused();
  expect(await page.locator("#band-priorityTitle").evaluate((field) => field.selectionEnd - field.selectionStart)).toBe(generate(example).priorityTitle.length);
});

test("played and missing matches do not offer BAND sign-up drafts", async ({ page }) => {
  await setup(page);
  await page.goto("/match.html?id=m1");
  await expect(page.locator("#match-hero")).toContainText("Rovers AFC");
  await expect(page.locator("#band-panel")).toBeHidden();
  await page.goto("/match.html?id=missing");
  await expect(page.locator("#band-panel")).toBeHidden();
});
