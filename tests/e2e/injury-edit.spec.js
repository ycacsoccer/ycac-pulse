const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, fitsViewport } = require("./mocks");

test("a player profile records, edits and clears an injury across public pages", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.clock.install({ time: new Date("2026-11-20T15:00:00Z") });
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#injury-status");
  await expect(panel).toContainText("No current injury recorded.");
  await expect(panel).toContainText("public and can be edited by anyone");
  await panel.getByRole("button", { name: "Record injury" }).click();
  await expect(page.locator("#profile-injury-since")).toHaveValue("2026-11-21");
  await page.locator("#profile-injury-detail").fill("Knee strain");
  await page.locator("#profile-injury-since").fill("2026-11-18");
  await page.locator("#profile-injury-return").fill("Early December");
  await page.locator("#lang-select").selectOption("ja");
  await expect(panel.locator("h2")).toHaveText("負傷状況");
  await expect(page.locator("#profile-injury-detail")).toHaveValue("Knee strain");
  await expect(page.locator("#profile-injury-since")).toHaveValue("2026-11-18");
  await expect(page.locator("#profile-injury-return")).toHaveValue("Early December");
  await page.locator("#lang-select").selectOption("en");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Injury status updated.");
  await expect(page.locator("#profile-hero .profile-injury")).toContainText("Knee strain");
  expect(api.store.injuries.find((row) => row.player_id === "p-chr")).toMatchObject({
    detail: "Knee strain", since_date: "2026-11-18", expected_return: "Early December", updated_by: "public",
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(panel).toContainText("Knee strain");
  await panel.getByRole("button", { name: "Edit injury" }).click();
  await expect(page.locator("#profile-injury-detail")).toHaveValue("Knee strain");
  await page.locator("#profile-injury-detail").fill("Recovering from knee strain");
  await page.locator("#profile-injury-return").fill("");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page)).toBe(true);
  }
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Recovering from knee strain");
  expect(api.store.injuries.filter((row) => row.player_id === "p-chr")).toHaveLength(1);
  expect(api.store.injuries.find((row) => row.player_id === "p-chr").expected_return).toBeNull();

  await page.goto("/players.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('.player-card:has-text("Chris Ito") .injured-badge')).toBeVisible();
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#injury-list")).toContainText("Recovering from knee strain");
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  await expect(panel).toContainText("Recovering from knee strain");
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel.getByRole("button", { name: "Mark recovered" }).click();
  expect(api.store.injuries.some((row) => row.player_id === "p-chr")).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Mark recovered" }).click();
  await expect(panel).toContainText("Injury status cleared.");
  await expect(page.locator("#profile-hero .profile-injury")).toHaveCount(0);
  expect(api.store.injuries.some((row) => row.player_id === "p-chr")).toBe(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(panel).toContainText("No current injury recorded.");
  expect(errors).toEqual([]);
});

test("stale edits and recovery cannot overwrite a newer injury record", async ({ page, context }) => {
  const api = await mockSupabase(page);
  await page.goto("/player.html?id=p-evn", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#injury-status");
  await expect(panel).toContainText("Hamstring strain");
  const other = await context.newPage();
  await mockSupabase(other, { store: api.store });
  await other.goto("/player.html?id=p-evn", { waitUntil: "domcontentloaded" });
  const otherPanel = other.locator("#injury-status");
  await expect(otherPanel).toContainText("Hamstring strain");
  await panel.getByRole("button", { name: "Edit injury" }).click();
  await page.locator("#profile-injury-detail").fill("Stale draft");
  await otherPanel.getByRole("button", { name: "Edit injury" }).click();
  await other.locator("#profile-injury-detail").fill("Updated by another tab");
  await otherPanel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(otherPanel).toContainText("Injury status updated.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Could not confirm the change");
  await expect(page.locator("#profile-injury-detail")).toHaveValue("Stale draft");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(api.store.injuries.find((row) => row.player_id === "p-evn").detail).toBe("Updated by another tab");
  await panel.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(panel).toContainText("Updated by another tab");

  await otherPanel.getByRole("button", { name: "Edit injury" }).click();
  await other.locator("#profile-injury-detail").fill("Newer medical update");
  await otherPanel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(otherPanel).toContainText("Newer medical update");
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Mark recovered" }).click();
  await expect(panel).toContainText("Could not confirm the change");
  expect(api.store.injuries.find((row) => row.player_id === "p-evn").detail).toBe("Newer medical update");
  await panel.getByRole("button", { name: "Reload injury status" }).click();
  await expect(panel).toContainText("Newer medical update");
  expect(api.rest.some((request) => request.startsWith("injuries?") && request.includes("updated_at=eq."))).toBe(true);
  await other.close();
});

test("an unavailable injury read is not presented as healthy and can be retried", async ({ page }) => {
  await mockSupabase(page);
  let fail = true;
  await page.route("**/rest/v1/injuries?**", (route) => {
    if (fail) { fail = false; return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); }
    return route.fallback();
  });
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#injury-status");
  await expect(panel).toContainText("Could not load injury status");
  await expect(panel).not.toContainText("No current injury recorded.");
  await expect(panel.getByRole("button", { name: "Record injury" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Reload injury status" }).click();
  await expect(panel).toContainText("No current injury recorded.");
  await expect(panel.getByRole("button", { name: "Record injury" })).toBeVisible();
});

test("a failed injury write keeps the draft and never reports success", async ({ page }) => {
  const api = await mockSupabase(page);
  await page.route("**/rest/v1/injuries", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : route.fallback());
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#injury-status");
  await panel.getByRole("button", { name: "Record injury" }).click();
  await page.locator("#profile-injury-detail").fill("Ankle injury");
  await page.locator("#profile-injury-since").fill("2026-11-19");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Could not confirm the change");
  await expect(page.locator("#profile-injury-detail")).toHaveValue("Ankle injury");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(api.store.injuries.some((row) => row.player_id === "p-chr")).toBe(false);
  let failRead = true;
  await page.route("**/rest/v1/injuries?**", (route) => {
    if (failRead) { failRead = false; return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); }
    return route.fallback();
  });
  await panel.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(panel).toContainText("Could not load injury status");
  await expect(page.locator("#profile-injury-detail")).toHaveValue("Ankle injury");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(panel).toContainText("No current injury recorded.");
});

test("blank injury details are rejected without sending a write", async ({ page }) => {
  const api = await mockSupabase(page);
  const writes = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/injuries") && request.method() !== "GET") writes.push(request.method());
  });
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#injury-status");
  await panel.getByRole("button", { name: "Record injury" }).click();
  await page.locator("#profile-injury-detail").fill("   ");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Enter the injury and the date it began.");
  await expect(page.locator("#profile-injury-detail")).toHaveValue("   ");
  expect(writes).toEqual([]);
  expect(api.store.injuries.some((row) => row.player_id === "p-chr")).toBe(false);
});

test("simultaneous injury creation preserves the first record and the second draft", async ({ page, context }) => {
  const api = await mockSupabase(page);
  const other = await context.newPage();
  await mockSupabase(other, { store: api.store });
  await page.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  await other.goto("/player.html?id=p-chr", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#injury-status"), otherPanel = other.locator("#injury-status");
  await panel.getByRole("button", { name: "Record injury" }).click();
  await otherPanel.getByRole("button", { name: "Record injury" }).click();
  await page.locator("#profile-injury-detail").fill("Second draft");
  await other.locator("#profile-injury-detail").fill("First record");
  await otherPanel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(otherPanel).toContainText("Injury status updated.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("Could not confirm the change");
  await expect(page.locator("#profile-injury-detail")).toHaveValue("Second draft");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(api.store.injuries.filter((row) => row.player_id === "p-chr")).toHaveLength(1);
  expect(api.store.injuries.find((row) => row.player_id === "p-chr").detail).toBe("First record");
  await other.close();
});

test("the Admin injuries list links to the player's editor", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  await page.locator('.admin-tab[data-tab="injuries"]').click();
  const row = page.locator("#admin-injuries .injury-row").filter({ hasText: "Evan Cole" });
  const edit = row.getByRole("link", { name: "Edit injury" });
  await expect(edit).toHaveAttribute("href", "player.html?id=p-evn#injury-status");
  await edit.click();
  await expect(page).toHaveURL(/player\.html\?id=p-evn#injury-status/);
  await expect(page.locator("#injury-status")).toContainText("Hamstring strain");
  await expect(page.locator("#injury-status").getByRole("button", { name: "Edit injury" })).toBeVisible();
});

test("Admin removal is confirmed and cannot delete a newer injury record", async ({ page, context }) => {
  const api = await mockSupabase(page);
  await page.goto("/admin.html", { waitUntil: "domcontentloaded" });
  await page.locator('.admin-tab[data-tab="injuries"]').click();
  const row = page.locator("#admin-injuries .injury-row").filter({ hasText: "Evan Cole" });
  await expect(row).toContainText("Hamstring strain");
  await expect(page.locator('[data-panel="injuries"]')).toContainText("public and can be edited by anyone");
  page.once("dialog", (dialog) => dialog.dismiss());
  await row.getByRole("button", { name: "Remove" }).click();
  expect(api.store.injuries.find((injury) => injury.player_id === "p-evn").detail).toBe("Hamstring strain");

  const other = await context.newPage();
  await mockSupabase(other, { store: api.store });
  await other.goto("/player.html?id=p-evn", { waitUntil: "domcontentloaded" });
  await other.getByRole("button", { name: "Edit injury" }).click();
  await other.locator("#profile-injury-detail").fill("Newer injury status");
  await other.locator("#injury-status").getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.locator("#injury-status")).toContainText("Injury status updated.");
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("#admin-injury-status")).toContainText("Could not confirm removal");
  await expect(row.getByRole("button", { name: "Remove" })).toBeDisabled();
  expect(api.store.injuries.find((injury) => injury.player_id === "p-evn").detail).toBe("Newer injury status");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('.admin-tab[data-tab="injuries"]').click();
  await expect(row).toContainText("Newer injury status");
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
  expect(api.store.injuries.some((injury) => injury.player_id === "p-evn")).toBe(false);
  await other.close();
});
