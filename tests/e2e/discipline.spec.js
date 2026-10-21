const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");

const result = (date, opponent, names) => ({ date, home: "YCAC Pulse", away: opponent, hg: 1, ag: 0,
  scorers: { home: ["Chris Ito"], away: [] }, yellowCards: { home: names, away: ["Opponent Player"] } });
const feed = {
  competition: "TML Division 3", updated: "2026-05-25", clubs: ["YCAC Pulse", "Titans FC"],
  results: [result("2026-03-07", "Rovers AFC", ["Ben Miller", "Ada Sato"]), result("2026-03-21", "Lakeside Utd", ["Ben Miller", "Dana Park"]), result("2026-05-02", "Comets SC", ["Ben Miller", "Dana Park"])],
  fixtures: [{ date: "2026-06-06", home: "YCAC Pulse", away: "Titans FC" }],
};

async function setup(page) {
  await mockSupabase(page);
  await page.clock.setFixedTime(new Date("2026-05-25T12:00:00+09:00"));
  await page.route("**/fixtures.js*", (route) => route.fulfill({ contentType: "application/javascript", body: `window.YCACFixtures = ${JSON.stringify(feed)};` }));
}

test("upcoming matches show card totals, dated history, risk and next-game suspension", async ({ page }) => {
  await setup(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  const panel = page.locator("#discipline-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".discipline-player")).toHaveCount(3);
  const ben = panel.locator(".discipline-player", { hasText: "Ben Miller" });
  await expect(ben).toContainText("3 yellow cards");
  await expect(ben).toContainText("Suspended for this match");
  await ben.locator("summary").click();
  await expect(ben.locator("li")).toHaveCount(4); // 3 bookings + 1 projected ban
  await expect(ben).toContainText("Rovers AFC");
  await expect(ben).toContainText("Titans FC");
  await expect(panel.locator(".is-at-risk")).toContainText("Dana Park");
  await expect(panel.locator(".is-at-risk")).toContainText("One yellow from suspension");
  await expect(page.locator('[data-squad-add="p-ben"]')).toBeDisabled();
  await page.locator("#squad-suggest").click();
  await expect(page.locator("#squad-sheet")).not.toContainText("Ben Miller");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await fitsViewport(page)).toBe(true);
  await page.locator("#lang-select").selectOption("ja");
  await expect(panel.locator("h2")).toHaveText("警告・出場停止");
  expect(errors).toEqual([]);
});

test("result reviews do not leak later bookings and can show published scorers", async ({ page }) => {
  await setup(page);
  await page.route("**/rest/v1/goals?**", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.goto("/match.html?id=m2");
  const ben = page.locator(".discipline-player", { hasText: "Ben Miller" });
  await expect(ben).toContainText("2 yellow cards");
  await expect(ben).toContainText("One yellow from suspension");
  await expect(ben).not.toContainText("Comets SC");
  await expect(page.locator("#match-goals")).toContainText("Published league scorers");
  await expect(page.locator("#match-goals")).toContainText("Chris Ito");
  await page.goto("/match.html?id=f3");
  await expect(page.locator("#discipline-panel")).toBeHidden();
});
