const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");

test("membership is explicitly set to member, non-member or unknown and survives reload", async ({ page }) => {
  const api = await mockSupabase(page, { mutablePlayers: true });
  const errors = watchErrors(page);
  const writes = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/players?") && request.method() === "PATCH") writes.push(request.postDataJSON());
  });
  const original = { ...api.store.players.find((player) => player.id === "p-chr") };
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#membership-status"), select = panel.locator("#membership-select");
  await expect(panel).toContainText("Membership status is public and can be edited by anyone.");
  await expect(select).toHaveValue("");
  await select.selectOption("true");
  await page.locator("#lang-select").selectOption("ja");
  await expect(panel.locator("h2")).toHaveText("YC&AC会員情報");
  await expect(select).toHaveValue("true");
  await page.locator("#lang-select").selectOption("en");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Membership status updated.");
  expect(api.store.players.find((player) => player.id === "p-chr")).toEqual({ ...original, is_ycac_member: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(select).toHaveValue("true");
  await select.selectOption("false");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Membership status updated.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(select).toHaveValue("false");
  await select.selectOption("");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Membership status updated.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(select).toHaveValue("");
  expect(writes).toEqual([{ is_ycac_member: true }, { is_ycac_member: false }, { is_ycac_member: null }]);
  expect(api.store.players.find((player) => player.id === "p-chr")).toEqual(original);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("a stale membership selection cannot overwrite another editor", async ({ page, context }) => {
  const api = await mockSupabase(page, { mutablePlayers: true });
  const other = await context.newPage();
  await mockSupabase(other, { store: api.store, mutablePlayers: true });
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  await other.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#membership-status"), otherPanel = other.locator("#membership-status");
  await panel.locator("#membership-select").selectOption("true");
  await otherPanel.locator("#membership-select").selectOption("false");
  await otherPanel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(otherPanel).toContainText("Membership status updated.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Could not confirm the change.");
  await expect(panel.locator("#membership-select")).toHaveValue("true");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(api.store.players.find((player) => player.id === "p-chr").is_ycac_member).toBe(false);
  await panel.getByRole("button", { name: "Discard selection and reload" }).click();
  await expect(panel.locator("#membership-select")).toHaveValue("false");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await other.close();
});

test("an uncertain write and a failed reload retain the selection without claiming success", async ({ page }) => {
  const api = await mockSupabase(page, { mutablePlayers: true });
  await page.route("**/rest/v1/players?**", (route) => route.request().method() === "PATCH"
    ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : route.fallback());
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#membership-status");
  await panel.locator("#membership-select").selectOption("true");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Could not confirm the change.");
  await expect(panel.locator("#membership-select")).toHaveValue("true");
  expect(api.store.players.find((player) => player.id === "p-chr").is_ycac_member).toBeNull();
  let failRead = true;
  await page.route("**/rest/v1/players?**", (route) => {
    if (failRead && route.request().method() === "GET") {
      failRead = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
    return route.fallback();
  });
  await panel.getByRole("button", { name: "Discard selection and reload" }).click();
  await expect(panel).toContainText("Could not load membership status.");
  await expect(panel.locator("#membership-select")).toHaveValue("true");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Discard selection and reload" }).click();
  await expect(panel.locator("#membership-select")).toHaveValue("");
});

test("a missing membership column is reported as unavailable, not as non-member", async ({ page }) => {
  const api = await mockSupabase(page, { mutablePlayers: true });
  delete api.store.players.find((player) => player.id === "p-chr").is_ycac_member;
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#membership-status");
  await expect(panel).toContainText("Membership status is unavailable until the database is updated.");
  await expect(panel.locator("#membership-select")).toHaveCount(0);
  await panel.getByRole("button", { name: "Reload membership status" }).click();
  await expect(panel).toContainText("Could not load membership status.");
  api.store.players.find((player) => player.id === "p-chr").is_ycac_member = null;
  await panel.getByRole("button", { name: "Reload membership status" }).click();
  await expect(panel.locator("#membership-select")).toHaveValue("");
});
