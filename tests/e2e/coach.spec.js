/* Coach dashboard — authenticated mocked Supabase. Wave 28 verifies that the
   formation map exposes best-position and can-play depth separately. */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors } = require("./mocks");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ycac-session", JSON.stringify({
      access_token: "e2e-coach", refresh_token: "e2e-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "coach", email: "coach@example.test" },
    }));
  });
  await mockSupabase(page, { coach: true });
});

test("wave 28: tactical slots split best and can-play coverage", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/coach.html");
  const nodes = page.locator("#tactics-map .tactic-node");
  await expect(nodes).toHaveCount(11);

  const centreBack = page.locator('[data-tactic-slot="lcb"]');
  await expect(centreBack.locator(".tactic-count.best strong")).toHaveText("1");
  await expect(centreBack.locator(".tactic-count.capable strong")).toHaveText("0");

  const leftAttackingMid = page.locator('[data-tactic-slot="lam"]');
  await expect(leftAttackingMid.locator(".tactic-count.best strong")).toHaveText("1");
  await expect(leftAttackingMid.locator(".tactic-count.capable strong")).toHaveText("0"); // injured Evan is excluded
  await expect(leftAttackingMid.locator("small")).toContainText("1");
  await leftAttackingMid.click();
  await expect(page.locator(".tactic-detail")).toContainText("Dana Park");
  await expect(page.locator(".tactic-detail")).toContainText("Evan Cole");
  await expect(page.locator(".tactic-detail")).toContainText("Injured");

  await page.selectOption("#formation-lens", "3-5-2");
  await expect(nodes).toHaveCount(11);
  await expect(page.locator(".tactic-detail .eyebrow")).toHaveText("3-5-2");
  expect(errors).toEqual([]);
});
