const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");
const fixtures = require("../fixtures/public-data");

const extraPlayers = Array.from({ length: 9 }, (_, index) => ({
  id: `p-extra-${index}`, display_name: `Extra ${index}`, primary_position: "CM", active: true,
  secondary_positions: [], shirt_number: null, photo_path: null, age_band: "20s",
}));
const players = [...fixtures.players.filter((row) => row.active !== false), ...extraPlayers];
const picked = players.slice(0, 14);
const match = { ...fixtures.matches.find((row) => row.id === "x1"), ycac_goals: 2, opponent_goals: 2, squad_confirmed_at: null };
const savedSquads = picked.map((player, index) => ({
  match_id: "x1", saved_squad_id: "sq-original", formation: "4231", player_id: player.id,
  selection_type: index < 11 ? "starter" : "sub", slot_order: index < 11 ? index : index - 11,
  played: null, active: true,
}));
const goals = [
  { match_id: "x1", scorer_id: picked[0].id, assist_id: null, minute: null },
  { match_id: "x1", scorer_id: picked[11].id, assist_id: null, minute: null },
];

async function setup(page, overrides = {}) {
  return mockSupabase(page, {
    squadFeature: true, players, savedSquads, goals,
    matches: fixtures.matches.map((row) => ({ ...row, squad_confirmed_at: null })).map((row) => row.id === "x1" ? match : row),
    ...overrides,
  });
}

test("a completed match confirms only the substitutes who played and remains locked across sessions", async ({ page, context }) => {
  const api = await setup(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#squad-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("#squad-pitch .pk-slot.assigned")).toHaveCount(11);
  // Preserve the saved pitch order rather than reassigning players by primary position.
  await expect(panel.locator("#squad-pitch [data-slot='0']")).toContainText(picked[0].display_name);
  await expect(panel.locator("#squad-pitch [data-slot='10']")).toContainText(picked[10].display_name);
  await expect(panel.locator("[data-played-sub]")).toHaveCount(3);
  await expect(page.locator("#squad-confirm-hint")).toContainText("substitutes who actually played");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }

  await page.locator("#squad-confirm").click(); // scorer is an unchecked substitute
  await expect(page.locator("#squad-status")).toContainText("scorer and assister");
  expect(api.rest.some((entry) => entry.startsWith("rpc/confirm_match_squad"))).toBe(false);
  await page.locator(`[data-played-sub="${picked[11].id}"]`).check();
  await page.locator("#squad-save").click();
  await expect(page.locator("#squad-status")).toContainText("saved");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-played-sub="${picked[11].id}"]`)).toBeChecked();
  await page.locator("#lang-select").selectOption("ja");
  await expect(page.locator("#squad-confirm")).toHaveText("メンバーを確定");
  await expect(page.locator(`[data-played-sub="${picked[11].id}"]`)).toBeChecked();
  await page.locator("#lang-select").selectOption("en");

  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("cannot be changed afterward"); await dialog.dismiss(); });
  await page.locator("#squad-confirm").click();
  await expect(page.locator("#squad-confirm")).toBeEnabled();
  expect(api.rest.some((entry) => entry.startsWith("rpc/confirm_match_squad"))).toBe(false);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#squad-confirm").click();
  await expect(page.locator("#squad-confirm-hint")).toContainText("confirmed and locked");
  await expect(page.locator("#squad-confirm")).toBeHidden();
  await expect(page.locator("#squad-formation")).toBeDisabled();
  await expect(page.locator("#squad-save")).toBeDisabled();
  await expect(page.locator("#squad-pitch [data-slot='0']")).toBeDisabled();
  await expect(page.locator(`[data-played-sub="${picked[11].id}"]`)).toBeChecked();
  await expect(page.locator(`[data-played-sub="${picked[11].id}"]`)).toBeDisabled();
  await expect(page.locator("#match-lineup")).toContainText(picked[11].display_name);
  await expect(page.locator("#match-lineup")).not.toContainText(picked[12].display_name);
  const apps = api.store.appearances.filter((row) => row.match_id === "x1");
  expect(apps.filter((row) => row.role === "starter")).toHaveLength(11);
  expect(apps.filter((row) => row.role === "sub").map((row) => row.player_id)).toEqual([picked[11].id]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#squad-confirm-hint")).toContainText("confirmed and locked");
  await expect(page.locator(`[data-played-sub="${picked[11].id}"]`)).toBeChecked();
  await expect(page.locator(`[data-played-sub="${picked[12].id}"]`)).not.toBeChecked();
  const other = await context.newPage();
  await setup(other, { store: api.store });
  await other.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await expect(other.locator("#squad-confirm-hint")).toContainText("confirmed and locked");
  await expect(other.locator("#squad-clear")).toBeDisabled();
  await other.goto(`/player.html?id=${picked[11].id}`, { waitUntil: "domcontentloaded" });
  await expect(other.locator(".timeline-entry").filter({ hasText: "Titans FC" })).toContainText("Substitute");
  await other.goto(`/player.html?id=${picked[12].id}`, { waitUntil: "domcontentloaded" });
  await expect(other.locator(".timeline-entry").filter({ hasText: "Titans FC" })).toContainText("Absent");
  await other.close();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("a stale session cannot overwrite another browser's saved squad", async ({ page, context }) => {
  const api = await setup(page);
  const other = await context.newPage();
  await setup(other, { store: api.store });
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await other.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await page.locator("#squad-pitch [data-slot='0']").click();
  await other.locator("#squad-pitch [data-slot='1']").click();
  await other.locator("#squad-save").click();
  await expect(other.locator("#squad-status")).toContainText("saved");
  await page.locator("#squad-save").click();
  await expect(page.locator("#squad-status")).toContainText("changed in another session");
  await expect(page.locator("#squad-save")).toBeDisabled();
  const active = api.store.savedSquads.filter((row) => row.match_id === "x1" && row.active);
  expect(active.some((row) => row.player_id === picked[0].id)).toBe(true);
  expect(active.some((row) => row.player_id === picked[1].id)).toBe(false);
  await other.close();
});

test("a squad cannot be confirmed before the result or without eleven starters", async ({ page }) => {
  const upcoming = { ...match, ycac_goals: null, opponent_goals: null };
  await setup(page, { matches: fixtures.matches.map((row) => ({ ...row, squad_confirmed_at: null })).map((row) => row.id === "x1" ? upcoming : row) });
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#squad-confirm")).toBeVisible();
  await expect(page.locator("#squad-confirm")).toBeDisabled();
  await expect(page.locator("#squad-confirm-hint")).toContainText("Enter the final result");
  await expect(page.locator("[data-played-sub]")).toHaveCount(0);
});

test("an incomplete starting XI cannot be confirmed after the result", async ({ page }) => {
  await setup(page);
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#squad-confirm")).toBeEnabled();
  await page.locator("#squad-pitch [data-slot='0']").click();
  await expect(page.locator("#squad-confirm")).toBeDisabled();
  await expect(page.locator("#squad-confirm-hint")).toContainText("all 11 starters");
});

test("the admin page keeps confirmed appearances read-only but allows score editing", async ({ page }) => {
  const api = await setup(page);
  api.store.matches.find((row) => row.id === "x1").squad_confirmed_at = "2026-11-01T12:00:00Z";
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#admin-players .admin-row").first()).toBeVisible();
  await page.locator('.admin-tab[data-tab="matches"]').click();
  await expect(page.locator('[data-action="delete-match"][data-id="x1"]')).toBeDisabled();
  await page.locator('[data-action="edit-match"][data-id="x1"]').click();
  await expect(page.locator("#match-form")).toContainText("appearance records are confirmed");
  await expect(page.locator('#match-form [data-action="clear-lineup"]')).toBeDisabled();
  await expect(page.locator("#lineup-search")).toBeDisabled();
  await expect(page.locator("#lineup-available button")).toHaveCount(0);
  await expect(page.locator("#match-f-ycac")).toBeEnabled();
  await expect(page.locator("#match-f-opp-goals")).toBeEnabled();
});

test("a failed confirmation leaves the saved draft editable", async ({ page }) => {
  const api = await setup(page, { goals: [] });
  await page.route("**/rest/v1/rpc/confirm_match_squad", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "temporary_failure" }) }));
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#squad-confirm").click();
  await expect(page.locator("#squad-status")).toContainText("Could not confirm");
  await expect(page.locator("#squad-confirm")).toBeEnabled();
  await expect(page.locator("#squad-pitch [data-slot='0']")).toBeEnabled();
  expect(api.store.matches.find((row) => row.id === "x1").squad_confirmed_at).toBeNull();
});

test("an uncertain confirmation response requires a reload before editing", async ({ page }) => {
  await setup(page, { goals: [] });
  await page.route("**/rest/v1/rpc/confirm_match_squad", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "unavailable" }) }));
  await page.goto("/match.html?id=x1", { waitUntil: "domcontentloaded" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#squad-confirm").click();
  await expect(page.locator("#squad-status")).toContainText("Reload the page before continuing");
  await expect(page.locator("#squad-save")).toBeDisabled();
  await expect(page.locator("#squad-confirm")).toBeDisabled();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#squad-confirm")).toBeEnabled();
});
