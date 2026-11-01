const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");
const fixtures = require("../fixtures/public-data");

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

const muro = { id: "murat", display_name: "Muro", display_name_full: null, primary_position: "CM", active: true, secondary_positions: [] };
const kilimanjaro = { id: "m007", date: "2026-10-31", competition: "TML Division 3", opponent: "Kilimanjaro FC",
  home_away: "away", ycac_goals: 2, opponent_goals: 2, squad_confirmed_at: "2026-11-01T02:16:44Z" };
const jetro = { id: "m008", date: "2026-11-15", competition: "TML Division 3", opponent: "Jetro FC",
  home_away: "away", ycac_goals: null, opponent_goals: null, squad_confirmed_at: null };
const oldMatch = { id: "m006", date: "2026-10-17", competition: "TML Division 3", opponent: "Corinthians Harbour FC",
  home_away: "home", ycac_goals: 2, opponent_goals: 2, squad_confirmed_at: null };
const muroFeed = (kilimanjaroPublished = false) => ({
  competition: "TML Division 3", updated: "2026-11-01", clubs: ["YCAC Pulse", "Jetro FC", "Kilimanjaro FC"],
  results: [result("2026-08-29", "Albion FC", ["Muro"]), result("2026-09-05", "BFC Tokyo", ["Muro"]),
    ...(kilimanjaroPublished ? [result("2026-10-31", "Kilimanjaro FC", ["Muro"])] : [])],
  fixtures: [{ date: "2026-11-15", home: "Jetro FC", away: "YCAC Pulse" }],
});

async function setupMuro(page, published = false, { players = [...fixtures.players, muro], feedData = muroFeed(published) } = {}) {
  const api = await mockSupabase(page, {
    squadFeature: true, players, matches: [...fixtures.matches, oldMatch, kilimanjaro, jetro],
    appearances: [...fixtures.appearances, { match_id: "m007", player_id: "murat", role: "starter" }],
    savedSquads: [{ match_id: "m007", saved_squad_id: "locked", formation: "4231", player_id: "murat", selection_type: "starter", slot_order: 0, active: true }],
  });
  await page.clock.setFixedTime(new Date("2026-11-01T12:00:00+09:00"));
  await page.route("**/fixtures.js*", (route) => route.fulfill({ contentType: "application/javascript", body: `window.YCACFixtures = ${JSON.stringify(feedData)};` }));
  return api;
}

test("one known team report is displayed without claiming earlier cards are known", async ({ page }) => {
  await setupMuro(page, false, { feedData: { ...muroFeed(), results: [] } });
  await page.goto("/match.html?id=m007");
  const panel = page.locator("#discipline-panel");
  await expect(panel.locator(".discipline-match-card")).toContainText("Muro");
  const row = panel.locator(".discipline-player", { hasText: "Muro" });
  await expect(row).toContainText("1 yellow card");
  await expect(row).toContainText("Provisional count: 1/3");
  await expect(row).not.toContainText("Suspended for this match");
  await expect(panel).toContainText("Records may be incomplete or duplicated");
});

test("the match and season show Muro's reported yellow, with the confirmed squad unchanged", async ({ page }) => {
  const api = await setupMuro(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=m007");
  const panel = page.locator("#discipline-panel");
  const card = panel.locator(".discipline-match-card", { hasText: "Muro" });
  await expect(card).toContainText("Team report — not confirmed in league feed");
  const row = panel.locator(".discipline-player", { hasText: "Muro" });
  await expect(row).toContainText("3 yellow cards");
  await expect(row).toContainText("Includes unconfirmed team report");
  await expect(row).toContainText("Possible suspension next league match — confirm with league");
  await row.locator("summary").click();
  await expect(row).toContainText("Kilimanjaro FC · Team report");
  await expect(row).toContainText("Possible suspension — not confirmed");
  await expect(page.locator("#squad-confirm-hint")).toContainText("confirmed and locked");
  await expect(page.locator("#squad-pitch [data-slot='0']")).toContainText("Muro");
  await expect(page.locator("#squad-pitch [data-slot='0']")).toBeDisabled();

  await page.locator("#lang-select").selectOption("ja");
  await expect(card).toContainText("チーム報告（リーグ発表は未確認）");
  await page.locator("#lang-select").selectOption("zh");
  await expect(card).toContainText("球队报告（联赛数据尚未确认）");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }
  expect(api.store.appearances.filter((row) => row.match_id === "m007")).toEqual([{ match_id: "m007", player_id: "murat", role: "starter" }]);
  expect(api.rest.some((request) => request.startsWith("rpc/"))).toBe(false);
  expect(errors).toEqual([]);
});

test("a reported third yellow warns provisionally but does not block picking or saving a player", async ({ page }) => {
  await setupMuro(page);
  await page.goto("/match.html?id=m008");
  const row = page.locator(".discipline-player", { hasText: "Muro" });
  await expect(row).toContainText("Possible suspension for this match — confirm with league");
  await page.locator("#squad-availability").selectOption("");
  const player = page.locator('[data-squad-add="murat"]');
  await expect(player).toBeEnabled();
  await player.click();
  await expect(page.locator("#squad-pitch")).toContainText("Muro");
  await page.locator("#squad-save").click();
  await expect(page.locator("#squad-status")).toContainText("saved");
  await page.goto("/match.html?id=m006");
  const earlier = page.locator(".discipline-player", { hasText: "Muro" });
  await expect(earlier).toContainText("2 yellow cards");
  await expect(earlier).not.toContainText("team report");
  await expect(page.locator(".discipline-match-card", { hasText: "Muro" })).toHaveCount(0);
});

test("a later uniquely matched league publication replaces the report and can enforce an official-only ban", async ({ page }) => {
  await setupMuro(page, true);
  await page.goto("/match.html?id=m007");
  await expect(page.locator(".discipline-match-card", { hasText: "Muro" })).toContainText("League publication");
  const row = page.locator(".discipline-player", { hasText: "Muro" });
  await expect(row).toContainText("3 yellow cards");
  await expect(row).not.toContainText("Includes unconfirmed team report");
  await page.goto("/match.html?id=m008");
  await expect(page.locator(".discipline-player", { hasText: "Muro" })).toContainText("Suspended for this match");
  await page.locator("#squad-availability").selectOption("");
  await expect(page.locator('[data-squad-add="murat"]')).toBeDisabled();
});

test("ambiguous roster names do not cause a published ban to block either player", async ({ page }) => {
  const otherMuro = { ...muro, id: "murat-other" };
  await setupMuro(page, true, { players: [...fixtures.players, muro, otherMuro] });
  await page.goto("/match.html?id=m008");
  await expect(page.locator(".discipline-player", { hasText: "Muro" })).toHaveCount(2);
  await page.locator("#squad-availability").selectOption("");
  await expect(page.locator('[data-squad-add="murat"]')).toBeEnabled();
  await expect(page.locator('[data-squad-add="murat-other"]')).toBeEnabled();
});
