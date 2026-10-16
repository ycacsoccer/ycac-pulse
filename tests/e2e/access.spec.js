/* Wave 33 access model — everything is public (view + write); the optional
   coach login remains only for attribution (entered_by / updated_by). */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, publicOnly } = require("./mocks");

test("login page offers one coach form and no player/team password", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/login.html");
  await expect(page.locator("#coach-form")).toHaveCount(1);
  await expect(page.locator("#coach-password")).toHaveCount(1);
  await expect(page.locator("#team-form, #team-password")).toHaveCount(0);
  await expect(page.locator("#login-heading")).toHaveText("Coach access");
  await expect(page.locator(".login-card")).toContainText("Manage fixtures, players, signups, squads and team content");
  expect(errors).toEqual([]);
});

test("match page is public: signups and notes panels open without a login", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=m1");
  await expect(page).toHaveURL(/match\.html\?id=m1/);
  await expect(page.locator("#match-hero")).toContainText("Rovers AFC");
  await expect(page.locator("#match-lineup .match-player")).toHaveCount(4);
  await expect(page.locator("#match-lineup")).toContainText("Chris Ito");
  await expect(page.locator("#signups-panel")).toBeVisible(); // wave 33: public reads signups/match_notes
  await expect(page.locator("#notes-panel")).toBeVisible();
  expect(publicOnly(api)).toBe(true);
  expect(errors).toEqual([]);
});

test("team page renders for anonymous visitors — no login bounce", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/team.html");
  await expect(page).toHaveURL(/team\.html/); // wave 33: requireCoach() is gone
  await expect(page.locator("#login-heading, #coach-form")).toHaveCount(0);
  await expect(page.locator("#team-content")).toBeVisible();
  expect(api.requestedTables).toContain("team_content");
  expect(publicOnly(api)).toBe(true);
  expect(errors).toEqual([]);
});
