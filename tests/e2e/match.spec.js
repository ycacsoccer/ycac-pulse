/* Match page — the coach-only squad picker + signup editor on upcoming
   fixtures (waves 29–31). Public visitors must never see either panel or ask
   for saved_squads/signups (RLS); a coach picks players on the pitch, saves
   the squad, and edits this fixture's signups — both reading the same state. */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, publicOnly } = require("./mocks");

const coachSession = async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ycac-session", JSON.stringify({
      access_token: "e2e-coach", refresh_token: "e2e-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "coach", email: "coach@example.test" },
    }));
  });
};

test("public visitor never sees the squad picker on an upcoming fixture", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#match-hero")).toContainText("Titans FC");
  await expect(page.locator("#squad-panel")).toBeHidden();
  expect(publicOnly(api)).toBe(true); // no saved_squads request from an anon page
  expect(errors).toEqual([]);
});

test("coach gets the full picker on an upcoming fixture: pitch, bench, save", async ({ page }) => {
  await coachSession({ page });
  const api = await mockSupabase(page, { coach: true });
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#match-hero")).toContainText("Titans FC");

  const panel = page.locator("#squad-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Match squad");
  await expect(panel.locator("#squad-pitch")).toBeVisible();
  await expect(panel.locator("#squad-bench .pk-bench-slot")).toHaveCount(9);
  await expect(page.locator("#squad-status")).toContainText("Add players");

  // every active fixture player is offered in the roster (Fumi is inactive)
  const cards = page.locator(".pk-card");
  await expect(cards).toHaveCount(5);

  // add Ada → she lands on the pitch (GK slot), status confirms, save enables
  await page.locator('[data-squad-add="p-ada"]').click();
  await expect(page.locator("#squad-pitch .pk-slot.assigned")).toContainText("Ada Sato");
  await expect(page.locator("#squad-status")).toContainText("Ada Sato added");
  const save = page.locator("#squad-save");
  await expect(save).toBeEnabled();

  // add three more: each fills their position slot on the pitch
  await page.locator('[data-squad-add="p-ben"]').click();
  await page.locator('[data-squad-add="p-chr"]').click();
  await page.locator('[data-squad-add="p-dan"]').click();
  await expect(page.locator("#squad-status")).toContainText("Dana Park added");
  await expect(page.locator("#squad-pitch .pk-slot.assigned")).toHaveCount(4);

  // remove again by clicking the assigned pitch slot
  const danSlot = page.locator("#squad-pitch .pk-slot.assigned", { hasText: "Dana Park" });
  await danSlot.click();
  await expect(page.locator("#squad-status")).toContainText("Dana Park removed");
  await expect(page.locator("#squad-pitch .pk-slot.assigned")).toHaveCount(3);

  // bench fills from the players outside the XI (2 left of the 5)
  await page.locator("#squad-refresh-bench").click();
  await expect(page.locator("#squad-bench-count")).toHaveText("2");
  await expect(page.locator("#squad-bench .pk-bench-slot.assigned")).toHaveCount(2);

  // save → retire previous save (PATCH) + insert the new group (POST)
  await save.click();
  await expect(page.locator("#squad-status")).toContainText("saved");
  expect(api.rest.some((entry) => entry.startsWith("saved_squads?match_id=eq.x1&active=eq.true"))).toBe(true);
  expect(api.rest.some((entry) => entry === "saved_squads")).toBe(true);
  await expect(save).toBeDisabled(); // nothing changed since the save
  expect(errors).toEqual([]);
});

test("squad picker flags attendance: attending first, declined/unavailable badged", async ({ page }) => {
  await coachSession({ page });
  const errors = watchErrors(page);
  await mockSupabase(page, { coach: true });
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#squad-panel")).toBeVisible();

  // roster cards carry the signup status (fixture: ada/ben/dan confirmed, chr declined, evn unavailable)
  await expect(page.locator('[data-squad-add="p-ada"] .sa-status')).toHaveText(/Confirmed/i);
  await expect(page.locator('[data-squad-add="p-ada"] .sa-status')).toHaveClass(/ss-confirmed/);
  await expect(page.locator('[data-squad-add="p-chr"] .sa-status')).toHaveText(/Declined/i);
  await expect(page.locator('[data-squad-add="p-evn"] .sa-status')).toHaveText(/Unavailable/i);

  // attending players sort to the front, unavailable to the back
  const cards = page.locator(".pk-card");
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText("Ada Sato");
  await expect(cards.last()).toContainText("Evan Cole");

  // a declined player picked into the XI keeps his flag on the card — then remove him
  await page.locator('[data-squad-add="p-chr"]').click();
  await expect(page.locator("#squad-pitch .pk-slot.assigned", { hasText: "Chris Ito" })).toBeVisible();
  await expect(page.locator('[data-squad-add="p-chr"] .sa-status')).toHaveText(/Declined/i);
  await page.locator("#squad-pitch .pk-slot.assigned", { hasText: "Chris Ito" }).click();
  await expect(page.locator("#squad-status")).toContainText("Chris Ito removed");
  expect(errors).toEqual([]);
});

test("squad roster filters by availability", async ({ page }) => {
  await coachSession({ page });
  const errors = watchErrors(page);
  await mockSupabase(page, { coach: true });
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#squad-panel")).toBeVisible();
  const cards = page.locator(".pk-card");
  await expect(cards).toHaveCount(5); // every active player under the default "All"

  // declined → only Chris; unavailable → only Evan
  await page.locator("#squad-availability").selectOption("declined");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Chris Ito");
  await page.locator("#squad-availability").selectOption("unavailable");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Evan Cole");

  // every fixture player answered → "no response" shows the honest empty state
  await page.locator("#squad-availability").selectOption("none");
  await expect(cards).toHaveCount(0);
  await expect(page.locator("#squad-roster .empty")).toContainText("No players match");

  // the availability filter stacks with the search box
  await page.locator("#squad-availability").selectOption("confirmed");
  await expect(cards).toHaveCount(3);
  await page.locator("#squad-search").fill("ada");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Ada Sato");

  // back to the full roster
  await page.locator("#squad-availability").selectOption("");
  await page.locator("#squad-search").fill("");
  await expect(cards).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("coach edits signups on the match page and the picker stays aligned", async ({ page }) => {
  await coachSession({ page });
  const api = await mockSupabase(page, { coach: true });
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  const panel = page.locator("#signups-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".signup-group")).toHaveCount(3); // confirmed / declined / unavailable

  // 1. move Chris from declined → confirmed (PATCH)
  await page.locator('[data-signup-status="p-chr"]').selectOption("confirmed");
  await expect(panel.locator(".sg-confirmed")).toContainText("Chris Ito");
  expect(api.rest.some((entry) => entry.startsWith("signups?match_id=eq.x1&player_id=eq.p-chr"))).toBe(true);
  // the squad picker's roster badge follows the same state
  await expect(page.locator('[data-squad-add="p-chr"] .sa-status')).toHaveText(/Confirmed/i);

  // 2. remove Evan's signup (DELETE) → he shows as no-response and returns to the add list
  await page.locator('[data-signup-drop="p-evn"]').click();
  await expect(panel.locator(".sg-unavailable")).toHaveCount(0);
  expect(api.rest.some((entry) => entry.startsWith("signups?match_id=eq.x1&player_id=eq.p-evn"))).toBe(true);
  await expect(page.locator('[data-squad-add="p-evn"] .sa-status')).toHaveText(/No response/i);
  await expect(page.locator("#signup-player option[value='p-evn']")).toHaveCount(1);

  // 3. add him back as confirmed (POST) — no active player is left to add afterwards
  await page.locator("#signup-player").selectOption("p-evn");
  await page.locator("#signup-add button[type=submit]").click();
  await expect(panel.locator(".sg-confirmed")).toContainText("Evan Cole");
  expect(api.rest.some((entry) => entry === "signups")).toBe(true);
  await expect(page.locator('[data-squad-add="p-evn"] .sa-status')).toHaveText(/Confirmed/i);
  await expect(page.locator("#signup-add button[type=submit]")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("match page for a played match hides the squad picker and signup editing", async ({ page }) => {
  await coachSession({ page });
  const errors = watchErrors(page);
  await mockSupabase(page, { coach: true });
  await page.goto("/match.html?id=m1");
  await expect(page.locator("#match-hero")).toContainText("Rovers AFC");
  await expect(page.locator("#squad-panel")).toBeHidden();
  await expect(page.locator("#lineup-panel")).toBeVisible();
  await expect(page.locator("#signup-add")).toHaveCount(0); // signups are read-only once played
  expect(errors).toEqual([]);
});

test("upcoming fixture shows the public match forecast with form and season numbers", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#forecast-panel")).toBeVisible();
  await expect(page.locator("#forecast-panel h2")).toContainText("Match forecast");

  // Titans FC is not in the league table and there is no past meeting:
  // an honest no-data note instead of a fabricated probability card
  await expect(page.locator("#match-forecast .fc-note")).toHaveCount(1);
  await expect(page.locator("#match-forecast .fc-verdict")).toHaveCount(0);
  await expect(page.locator("#match-forecast .fc-meetings")).toHaveCount(0);

  // TML form from the four league finals (W D L W → 2–1–1) + season snapshot
  await expect(page.locator("#match-forecast .fc-form .form-pill")).toHaveCount(4);
  await expect(page.locator("#match-forecast .fc-form .form-pill.win")).toHaveCount(2);
  await expect(page.locator("#match-forecast .fc-stats")).toContainText("2–1–1");
  await expect(page.locator("#match-forecast .fc-watch")).toContainText("Chris Ito"); // top TML scorer (2)
  expect(publicOnly(api)).toBe(true); // forecast reads public tables only
  expect(errors).toEqual([]);
});

test("forecast panel hides on a played match", async ({ page }) => {
  const errors = watchErrors(page);
  await mockSupabase(page);
  await page.goto("/match.html?id=m1");
  await expect(page.locator("#forecast-panel")).toBeHidden();
  expect(errors).toEqual([]);
});
