/* Player profile (player.html?id=…) — mocked Supabase.
   Hero tiles + stats table (wave 21: no attendance row), the full-match
   timeline with absences labelled, goal rows badged by the match's
   competition (wave 19), and the public view of the pitch diagram. */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, publicOnly, fitsViewport } = require("./mocks");
const { expected } = require("../fixtures/public-data");

test.describe("profile — Chris Ito (scored in both competitions)", () => {
  let api;
  let errors;

  test.beforeEach(async ({ page }) => {
    api = await mockSupabase(page);
    errors = watchErrors(page);
    await page.goto("/player.html?id=p-chr");
    await expect(page.locator("#profile-hero")).toContainText("Chris Ito");
  });

  test("wave 21: three hero tiles and no attendance row in the stats table", async ({ page }) => {
    await expect(page.locator("#profile-hero .ptile")).toHaveCount(expected.heroTiles);
    await expect(page.locator("#profile-hero")).toContainText("Goals / game");
    await expect(page.locator("#profile-hero")).not.toContainText("Attendance");
    await expect(page.locator("#profile-stats")).toContainText("Goals / game");
    await expect(page.locator("#profile-stats")).not.toContainText("Attendance");
  });

  test("timeline has one row per final match with absences labelled", async ({ page }) => {
    await expect(page.locator("#profile-timeline .timeline-entry")).toHaveCount(expected.finals);
    await expect(page.locator("#profile-timeline .timeline-entry.absent")).toHaveCount(expected.chris.absent);
    await expect(page.locator("#profile-timeline")).toContainText("⚪ Absent");
    await expect(page.locator("#profile-timeline .timeline-group-head")).toHaveCount(2); // TML + friendly
  });

  test("goal rows are badged from the match competition (wave 19)", async ({ page }) => {
    await expect(page.locator("#profile-goals .h-comp.tml")).toHaveCount(expected.chris.tmlGoals);
    await expect(page.locator("#profile-goals .h-comp.friendly")).toHaveCount(expected.chris.fndGoals);
  });

  test("public view: pitch diagram without editor controls", async ({ page }) => {
    await expect(page.locator("#profile-positions svg")).toHaveCount(1);
    await expect(page.locator('[data-pos-action], [data-pos-mode]')).toHaveCount(0);
  });

  test("reads only public tables and logs no errors", async ({ page }) => {
    expect(publicOnly(api)).toBe(true);
    expect(api.denied).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await fitsViewport(page)).toBe(true);
  });
});

test.describe("profile — Evan Cole (most absences + current injury)", () => {
  test("absences render as labelled rows and the injury shows on the profile", async ({ page }) => {
    const api = await mockSupabase(page);
    const errors = watchErrors(page);
    await page.goto("/player.html?id=p-evn");
    await expect(page.locator("#profile-hero")).toContainText("Evan Cole");
    await expect(page.locator("#profile-timeline .timeline-entry")).toHaveCount(expected.finals);
    await expect(page.locator("#profile-timeline .timeline-entry.absent")).toHaveCount(expected.evan.absent);
    await expect(page.locator("body")).toContainText("Hamstring strain");
    expect(publicOnly(api)).toBe(true);
    expect(errors).toEqual([]);
  });
});
