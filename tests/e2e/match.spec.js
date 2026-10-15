/* Match page — the coach-only squad picker on upcoming fixtures (wave 29).
   Public visitors must never see the panel or ask for saved_squads (RLS);
   a coach can add/remove players in the match squad and save it. */
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

test("coach sees the squad picker on an upcoming fixture and can add + save players", async ({ page }) => {
  await coachSession({ page });
  const api = await mockSupabase(page, { coach: true });
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#match-hero")).toContainText("Titans FC");

  const panel = page.locator("#squad-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Match squad");
  await expect(page.locator("#squad-status")).toContainText("Add players");

  // every active fixture player is offered (Fumi is inactive, not in the page data)
  const addCards = page.locator(".squad-add");
  await expect(addCards).toHaveCount(5);

  // add Ada as a starter → chip appears, status confirms, save enables
  await page.locator('[data-squad-add="p-ada"]').click();
  await expect(page.locator('#match-squad .match-group').first()).toContainText("Ada Sato");
  await expect(page.locator("#squad-status")).toContainText("Ada Sato added");
  const save = page.locator("#squad-save");
  await expect(save).toBeEnabled();

  // add three more: XI fills first, then the bench
  await page.locator('[data-squad-add="p-ben"]').click();
  await page.locator('[data-squad-add="p-chr"]').click();
  await page.locator('[data-squad-add="p-dan"]').click();
  await expect(page.locator("#squad-status")).toContainText("Dana Park added");

  // remove one again
  await page.locator('[data-squad-remove="p-dan"]').click();
  await expect(page.locator("#squad-status")).toContainText("Dana Park removed");
  await expect(page.locator('[data-squad-add="p-dan"]')).toBeVisible();

  // save → retire previous save (PATCH) + insert the new group (POST)
  await save.click();
  await expect(page.locator("#squad-status")).toContainText("saved");
  expect(api.rest.some((entry) => entry.startsWith("saved_squads?match_id=eq.x1&active=eq.true"))).toBe(true);
  expect(api.rest.some((entry) => entry === "saved_squads" || entry.startsWith("saved_squads?"))).toBe(true);
  await expect(save).toBeDisabled(); // nothing changed since the save
  expect(errors).toEqual([]);
});

test("squad picker flags attendance: attending first, declined/unavailable badged", async ({ page }) => {
  await coachSession({ page });
  const errors = watchErrors(page);
  await mockSupabase(page, { coach: true });
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#squad-panel")).toBeVisible();

  // add cards carry the signup status (fixture: ada/ben/dan confirmed, chr declined, evn unavailable)
  await expect(page.locator('[data-squad-add="p-ada"] .sa-status')).toHaveText(/Confirmed/i);
  await expect(page.locator('[data-squad-add="p-ada"] .sa-status')).toHaveClass(/ss-confirmed/);
  await expect(page.locator('[data-squad-add="p-chr"] .sa-status')).toHaveText(/Declined/i);
  await expect(page.locator('[data-squad-add="p-evn"] .sa-status')).toHaveText(/Unavailable/i);

  // attending players sort to the front, unavailable to the back
  const addCards = page.locator(".squad-add");
  await expect(addCards).toHaveCount(5);
  await expect(addCards.first()).toContainText("Ada Sato");
  await expect(addCards.last()).toContainText("Evan Cole");

  // a declined player already in the squad is flagged on the chip for removal
  await page.locator('[data-squad-add="p-chr"]').click();
  const chrChip = page.locator("#match-squad .squad-chip", { hasText: "Chris Ito" });
  await expect(chrChip.locator(".sa-status")).toHaveText(/Declined/i);
  await chrChip.locator(".sc-remove").click();
  await expect(page.locator("#squad-status")).toContainText("Chris Ito removed");
  expect(errors).toEqual([]);
});

test("match page for a played match hides the squad picker even for a coach", async ({ page }) => {
  await coachSession({ page });
  const errors = watchErrors(page);
  await mockSupabase(page, { coach: true });
  await page.goto("/match.html?id=m1");
  await expect(page.locator("#match-hero")).toContainText("Rovers AFC");
  await expect(page.locator("#squad-panel")).toBeHidden();
  await expect(page.locator("#lineup-panel")).toBeVisible();
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
