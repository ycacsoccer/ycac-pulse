const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");
const fixtures = require("../fixtures/public-data");
const standings = require("../../standings.js");
const forecast = require("../../forecast.js");
const { generateReminder } = require("../../band.js");

const match = { id: "x1", date: "2026-10-31", opponent: "Kilimanjaro FC", venue: "YC&AC", kickoff: "18:00", competition: "TML Division 3", ycac_goals: null, opponent_goals: null };

async function setup(page, fixture = match) {
  const api = await mockSupabase(page);
  await page.route("**/rest/v1/matches?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(fixtures.matches.map((row) => row.id === "x1" ? fixture : row)) }));
  return api;
}

test("upcoming reminder follows the sign-up drafts, uses the forecast and copies edits", async ({ page }) => {
  const api = await setup(page);
  const errors = watchErrors(page);
  const now = new Date("2026-10-30T03:00:00Z");
  await page.clock.install({ time: now });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedReminder = text; } } });
  });
  await page.goto("/match.html?id=x1");
  const panel = page.locator("#reminder-panel");
  const draft = page.locator("#reminder-draft");
  await expect(panel).toBeVisible();
  await expect(page.locator("#band-panel + section")).toHaveAttribute("id", "reminder-panel");
  await expect(panel.locator("h2")).toHaveText("Pre-Match Reminder");
  const data = forecast.build({ match, finals: fixtures.matches.filter((row) => row.ycac_goals != null && row.opponent_goals != null), standingsRows: standings.rows, goals: fixtures.goals });
  const generated = generateReminder(match, data, standings, now);
  await expect(draft).toHaveValue(generated);
  await expect(draft).toHaveValue(/Meet: 17:00/);
  await expect(draft).toHaveValue(/Warm-up: 17:20/);
  await expect(draft).toHaveValue(/Kilimanjaro FC/);
  await expect(draft).toHaveValue(/in the league with/);
  await expect(draft).toHaveValue(/@All/);
  await expect(draft).toHaveValue(/皆さん、お疲れ様です！/);
  await expect(draft).toHaveValue(/Hi everyone!/);
  await expect(draft).toHaveValue(/明日はKilimanjaro FC/);
  await expect(draft).toHaveValue(/Tomorrow we’re up against Kilimanjaro FC/);
  await expect(draft).toHaveValue(/See you tomorrow!/);
  await expect(draft).not.toHaveValue(/as of|時点|2026-10-26/i);

  const edited = `${generated}\n\nAdditional team note`;
  await draft.fill(edited);
  await page.locator("#reminder-copy").click();
  await expect(page.locator("#reminder-status")).toHaveText("Copied — ready to paste.");
  expect(await page.evaluate(() => window.copiedReminder)).toBe(edited);
  await page.locator("#lang-select").selectOption("ja");
  await expect(panel.locator("h2")).toHaveText("試合前リマインダー");
  await expect(draft).toHaveValue(edited);
  await page.locator("#lang-select").selectOption("zh");
  await expect(panel.locator("h2")).toHaveText("赛前提醒");
  await expect(draft).toHaveValue(edited);
  await page.locator("#reminder-copy").click();
  expect(await page.evaluate(() => window.copiedReminder)).toBe(edited);

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }
  expect(api.denied).toEqual([]);
  expect(errors).toEqual([]);
});

test("a reloaded reminder uses Japan's current date at midnight", async ({ page }) => {
  await setup(page);
  const errors = watchErrors(page);
  await page.clock.install({ time: new Date("2026-10-30T14:30:00Z") }); // 23:30 in Japan
  await page.goto("/match.html?id=x1");
  const draft = page.locator("#reminder-draft");
  await expect(draft).toHaveValue(/See you tomorrow!/);
  await page.clock.setFixedTime(new Date("2026-10-30T15:00:00Z")); // 00:00 in Japan
  await page.reload();
  await expect(draft).toHaveValue(/今日はKilimanjaro FC/);
  await expect(draft).toHaveValue(/It’s matchday! We’re playing Kilimanjaro FC today/);
  await expect(draft).not.toHaveValue(/tomorrow|明日/i);
  expect(errors).toEqual([]);
});

test("unknown kickoff and unavailable forecast remain honest, with manual clipboard fallback", async ({ page }) => {
  await setup(page, { ...match, opponent: "Unknown FC", kickoff: null });
  const errors = watchErrors(page);
  await page.route("**/forecast.js*", (route) => route.fulfill({ contentType: "text/javascript", body: "/* forecast unavailable */" }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
  });
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#forecast-panel")).toBeHidden();
  await expect(page.locator("#reminder-panel")).toBeVisible();
  const draft = page.locator("#reminder-draft");
  await expect(draft).toHaveValue(/KO: 未定 \/ TBC/);
  await expect(draft).not.toHaveValue(/in the league|NaN|undefined/);
  await page.locator("#reminder-copy").click();
  await expect(page.locator("#reminder-status")).toContainText("copy it manually");
  await expect(draft).toBeFocused();
  const selection = await draft.evaluate((field) => ({ start: field.selectionStart, end: field.selectionEnd, length: field.value.length }));
  expect(selection).toEqual({ start: 0, end: selection.length, length: selection.length });
  expect(errors).toEqual([]);
});

test("played and missing matches do not offer a pre-match reminder", async ({ page }) => {
  await setup(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=m1");
  await expect(page.locator("#match-hero")).toContainText("Rovers AFC");
  await expect(page.locator("#reminder-panel")).toBeHidden();
  await page.goto("/match.html?id=missing");
  await expect(page.locator("#match-hero")).toContainText("not found");
  await expect(page.locator("#reminder-panel")).toBeHidden();
  expect(errors).toEqual([]);
});
