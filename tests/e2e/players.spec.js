/* Player grid (players.html) — mocked Supabase.
   Position sections + selection-group wording, and wave 26's compact
   TML/Friendly split (apps, appearance rate, goals, assists). */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, publicOnly, fitsViewport } = require("./mocks");
const { expected } = require("../fixtures/public-data");

let api;
let errors;

test.beforeEach(async ({ page }) => {
  api = await mockSupabase(page);
  errors = watchErrors(page);
  await page.goto("/players.html");
  await expect(page.locator(".player-card").first()).toBeVisible();
});

test("renders one card per active player, grouped into position sections", async ({ page }) => {
  await expect(page.locator(".player-card")).toHaveCount(expected.gridCards); // inactive Fumi excluded
  const heads = page.locator(".position-section-head");
  await expect(heads).toHaveCount(4); // GK · DF · MF · AT
  await expect(page.locator("#players-grid")).toContainText("Goalkeepers");
  await expect(page.locator("#players-grid")).toContainText("Attackers");
});

test("wave 26: every card splits TML and Friendly apps/rate/goals/assists", async ({ page }) => {
  await expect(page.locator(".pc-tot")).toHaveCount(expected.gridCards);
  await expect(page.locator(".pc-split")).toHaveCount(expected.gridCards * 2);
  await expect(page.locator(".pc-split .comp-chip.tml")).toHaveCount(expected.gridCards);
  await expect(page.locator(".pc-split .comp-chip.friendly")).toHaveCount(expected.gridCards);
  const first = page.locator(".player-card").first();
  await expect(first.locator(".pc-split")).toHaveCount(2);
  await expect(first).toContainText(/\d+%/);
  await expect(first).toContainText(/\d+ G · \d+ A/);
});

test("selection-group filter chips use appearance-frequency wording", async ({ page }) => {
  await expect(page.locator("#tier-filters")).toContainText("Plays often");
  await expect(page.locator("#tier-filters")).toContainText("Not yet played");
  await expect(page.locator("#players-grid")).toContainText("Plays often");
  await expect(page.locator("#players-grid")).not.toContainText("First-choice");
});

test("search narrows the grid, empty state when nothing matches", async ({ page }) => {
  await page.fill("#players-search", "ada");
  await expect(page.locator(".player-card")).toHaveCount(1);
  await expect(page.locator(".player-card")).toContainText("Ada Sato");
  await page.fill("#players-search", "zzzz");
  await expect(page.locator(".player-card")).toHaveCount(0);
  await expect(page.locator("#players-grid")).toContainText("No players match this filter.");
  await page.fill("#players-search", "");
  await expect(page.locator(".player-card")).toHaveCount(expected.gridCards);
});

test("a card links through to the profile", async ({ page }) => {
  await page.locator('.player-card:has-text("Ada Sato")').click();
  await expect(page).toHaveURL(/player\.html\?id=p-ada/);
  await expect(page.locator("#profile-hero")).toContainText("Ada Sato");
});

test("grid reads only public tables and logs no errors", async ({ page }) => {
  expect(publicOnly(api)).toBe(true);
  expect(errors).toEqual([]);
});

test("no horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await fitsViewport(page)).toBe(true);
});
