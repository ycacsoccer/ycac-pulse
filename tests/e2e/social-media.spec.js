const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");
const fixtures = require("../fixtures/public-data");

const match = { id: "x1", date: "2026-10-31", opponent: "Kilimanjaro FC", venue: "YC&AC", kickoff: "18:00", competition: "TML Division 3", ycac_goals: null, opponent_goals: null };
const hashtags = "#YCACPulse #YCAC #YCACSoccer #YokohamaFootball #FootballInJapan";

async function setup(page, fixture = match) {
  const api = await mockSupabase(page);
  await page.route("**/rest/v1/matches?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(fixtures.matches.map((row) => row.id === "x1" ? fixture : row)) }));
  return api;
}

test("lineup caption follows the reminder, is editable and copyable, and survives language switches", async ({ page }) => {
  const api = await setup(page);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedSocial = text; } } });
  });
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#social-panel");
  const draft = page.locator("#social-draft");
  await expect(page.locator("#reminder-panel + section")).toHaveAttribute("id", "social-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("h2")).toHaveText("Social Media Helper");
  await expect(page.locator("#social-label")).toHaveText("Instagram lineup caption");
  await expect(draft).toHaveValue(`⚽️ MATCH DAY! 🔴⚫️\n\nReady to take on Kilimanjaro FC! 💪\n\n${hashtags}`);
  await expect(panel).toContainText("not saved or posted automatically");
  const edited = `Our edited lineup caption\n\n${hashtags}`;
  await draft.fill(edited);
  await page.locator("#social-copy").click();
  await expect(page.locator("#social-status")).toHaveText("Copied — ready to paste.");
  expect(await page.evaluate(() => window.copiedSocial)).toBe(edited);

  await page.locator("#lang-select").selectOption("ja");
  await expect(panel.locator("h2")).toHaveText("SNS投稿サポート");
  await expect(page.locator("#social-label")).toHaveText("Instagram用メンバー発表文");
  await expect(draft).toHaveValue(edited);
  await page.locator("#lang-select").selectOption("zh");
  await expect(panel.locator("h2")).toHaveText("社交媒体助手");
  await expect(page.locator("#social-label")).toHaveText("Instagram 赛前阵容文案");
  await expect(draft).toHaveValue(edited);
  await page.locator("#social-copy").click();
  expect(await page.evaluate(() => window.copiedSocial)).toBe(edited);

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(draft).toHaveValue(`⚽️ MATCH DAY! 🔴⚫️\n\nReady to take on Kilimanjaro FC! 💪\n\n${hashtags}`);
  expect(api.denied).toEqual([]);
  expect(errors).toEqual([]);
});

test("completed matches show score-aware win, draw and loss captions", async ({ page }) => {
  await setup(page);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedSocial = text; } } });
  });
  for (const [id, score, line] of [
    ["m1", "2–0", "A win against Rovers AFC!"],
    ["m2", "1–1", "All square against Lakeside Utd."],
    ["m3", "0–3", "Defeat against Hilltop FC."],
  ]) {
    await page.goto(`/match.html?id=${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#reminder-panel")).toBeHidden();
    await expect(page.locator("#social-panel")).toBeVisible();
    await expect(page.locator("#social-label")).toHaveText("Instagram full-time caption");
    const value = await page.locator("#social-draft").inputValue();
    expect(value).toContain(`FULL TIME | ${score} ⚽️🔴⚫️`);
    expect(value).toContain(line);
    expect(value).toContain(hashtags);
  }
  await page.locator("#social-draft").fill("Edited full-time caption");
  await page.locator("#lang-select").selectOption("ja");
  await expect(page.locator("#social-label")).toHaveText("Instagram用試合結果の投稿文");
  await expect(page.locator("#social-draft")).toHaveValue("Edited full-time caption");
  await page.locator("#social-copy").click();
  expect(await page.evaluate(() => window.copiedSocial)).toBe("Edited full-time caption");
  expect(errors).toEqual([]);
});

test("a fixture gets a full-time draft after a result is recorded and the page is reloaded", async ({ page }) => {
  await mockSupabase(page);
  let current = match;
  await page.route("**/rest/v1/matches?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(fixtures.matches.map((row) => row.id === "x1" ? current : row)) }));
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#social-label")).toHaveText("Instagram lineup caption");
  current = { ...match, ycac_goals: 2, opponent_goals: 2 };
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#social-label")).toHaveText("Instagram full-time caption");
  await expect(page.locator("#social-draft")).toHaveValue(/FULL TIME \| 2–2[\s\S]*All square against Kilimanjaro FC/);
  expect(errors).toEqual([]);
});

test("unknown details stay neutral and clipboard denial selects the draft for manual copying", async ({ page }) => {
  await setup(page, { ...match, opponent: "", ycac_goals: 0, opponent_goals: null });
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
  });
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  const draft = page.locator("#social-draft");
  await expect(draft).toHaveValue(/Ready to go, Pulse!/);
  await expect(draft).not.toHaveValue(/undefined|null|FULL TIME/i);
  await page.locator("#social-copy").click();
  await expect(page.locator("#social-status")).toContainText("copy it manually");
  await expect(draft).toBeFocused();
  const selection = await draft.evaluate((field) => ({ start: field.selectionStart, end: field.selectionEnd, length: field.value.length }));
  expect(selection).toEqual({ start: 0, end: selection.length, length: selection.length });
  expect(errors).toEqual([]);
});

test("missing matches and an unavailable generator do not show the helper", async ({ page }) => {
  await setup(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=missing", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#match-hero")).toContainText("not found");
  await expect(page.locator("#social-panel")).toBeHidden();
  await page.route("**/social-media.js*", (route) => route.fulfill({ contentType: "text/javascript", body: "/* generator unavailable */" }));
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#reminder-panel")).toBeVisible();
  await expect(page.locator("#social-panel")).toBeHidden();
  expect(errors).toEqual([]);
});
