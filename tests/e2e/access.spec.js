/* Wave 26 access model — public by default, one coach login for private tools. */
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

test("match page is public; private coach panels stay hidden", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=m1");
  await expect(page).toHaveURL(/match\.html\?id=m1/);
  await expect(page.locator("#match-hero")).toContainText("Rovers AFC");
  await expect(page.locator("#match-lineup .match-player")).toHaveCount(4);
  await expect(page.locator("#match-lineup")).toContainText("Chris Ito");
  await expect(page.locator("#signups-panel")).toBeHidden();
  await expect(page.locator("#notes-panel")).toBeHidden();
  expect(publicOnly(api)).toBe(true);
  expect(errors).toEqual([]);
});
