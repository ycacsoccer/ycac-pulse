/* Player grid (players.html) — mocked Supabase.
   Wave 18's position sections + selection-group wording, and wave 21's
   removal of the TML/FND appearance-% cells from the cards. */
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

test("wave 21: cards carry season totals, never appearance percentages", async ({ page }) => {
  await expect(page.locator(".pc-tot")).toHaveCount(expected.gridCards);
  await expect(page.locator(".pcq")).toHaveCount(0);
  const body = await page.locator("#players-grid").innerText();
  expect(body).not.toMatch(/\b\d+%/); // no bare percentages on a card
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
