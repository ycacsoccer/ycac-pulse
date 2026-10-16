/* Match page — the squad picker + signup editor on upcoming fixtures
   (waves 29–31, public since wave 33). Every visitor sees both panels and
   may use them: pick players on the pitch, save the squad, and edit this
   fixture's signups — both panels reading the same state. Played matches
   stay read-only. */
const { test, expect } = require("@playwright/test");
const { mockSupabase, watchErrors, publicOnly, fitsViewport } = require("./mocks");
const standingsData = require("../../standings.js");

test("public visitor gets the full squad picker on an upcoming fixture", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#match-hero")).toContainText("Titans FC");
  await expect(page.locator("#squad-panel")).toBeVisible(); // wave 33: public reads saved_squads/signups
  await expect(page.locator("#signups-panel")).toBeVisible();
  expect(publicOnly(api)).toBe(true); // the anon role may read every table asked for
  expect(errors).toEqual([]);
});

test("the full picker on an upcoming fixture: pitch, bench, save", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#match-hero")).toContainText("Titans FC");

  const panel = page.locator("#squad-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Match squad");
  await expect(panel.locator("#squad-pitch")).toBeVisible();
  await expect(panel.locator("#squad-bench .pk-bench-slot")).toHaveCount(9);
  await expect(page.locator("#squad-status")).toContainText("Add players");

  // wave 34: the roster opens on the Confirmed filter — ada/ben/dan only
  const cards = page.locator(".pk-card");
  await expect(page.locator("#squad-availability")).toHaveValue("confirmed");
  await expect(cards).toHaveCount(3);

  // every active fixture player is offered under All (Fumi is inactive)
  await page.locator("#squad-availability").selectOption("");
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
  const errors = watchErrors(page);
  await mockSupabase(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#squad-panel")).toBeVisible();

  // the roster opens on the Confirmed filter; declined/unavailable cards only
  // appear once the filter is opened to All
  await expect(page.locator("#squad-availability")).toHaveValue("confirmed");
  await expect(page.locator(".pk-card")).toHaveCount(3);
  await page.locator("#squad-availability").selectOption("");

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
  const errors = watchErrors(page);
  await mockSupabase(page);
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#squad-panel")).toBeVisible();
  const cards = page.locator(".pk-card");
  await expect(page.locator("#squad-availability")).toHaveValue("confirmed"); // wave 34 default
  await expect(cards).toHaveCount(3); // the confirmed players, filter untouched
  await page.locator("#squad-availability").selectOption("");
  await expect(cards).toHaveCount(5); // the full roster under All

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

test("a visitor edits signups on the match page and the picker stays aligned", async ({ page }) => {
  const api = await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  const panel = page.locator("#signups-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".signup-group")).toHaveCount(3); // confirmed / declined / unavailable
  // wave 35: coverage answers "who's coming" before the groups — confirmed,
  // response rate, position bands and the injury note
  const coverage = panel.locator(".signup-coverage");
  await expect(coverage).toContainText("3 of 5 confirmed"); // five active players, three confirmed
  await expect(coverage).toContainText("Response 100%"); // every active player has answered
  await expect(coverage).toContainText("GK 1/1"); // band chips: GK/DF confirmed, MF none, AT 1 of 2
  await expect(coverage.locator(".sc-injured")).toContainText("1 injured"); // Evan's hamstring row
  // this test watches every roster badge (incl. no-response), so open the
  // default Confirmed filter to All — badge state, not filtering, is under test
  await page.locator("#squad-availability").selectOption("");

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
  const errors = watchErrors(page);
  await mockSupabase(page);
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

/* ---- wave 35: richer statistics on match.html --------------------------- */

test("the forecast gains venue records, league scorers and the neighbour nav", async ({ page }) => {
  await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=x1");
  // season cells + this fixture's Home/Away records
  const stats = page.locator("#match-forecast .fc-stats");
  await expect(stats.locator(".fc-stat")).toHaveCount(7);
  await expect(stats).toContainText("Home record");
  await expect(stats).toContainText("Away record");
  // the published D3 top scorers, our own striker's row accented
  const scorers = page.locator("#match-forecast .standings-scorers");
  await expect(scorers.locator("li")).toHaveCount(standingsData.topScorers.length);
  await expect(scorers.locator("li.is-us")).toHaveCount(1);
  await expect(scorers.locator("li.is-us .ss-name")).toHaveText(standingsData.topScorers[0].name);
  // x1 is the newest fixture → only a Previous link, to the last result
  const nav = page.locator(".hero-nav");
  await expect(nav.locator("a")).toHaveCount(1);
  await expect(nav.locator("a.hn-prev")).toContainText("Comets SC");
  expect(errors).toEqual([]);
});

test("the hero counts down to kickoff (fixed clock)", async ({ page }) => {
  await mockSupabase(page);
  await page.clock.install({ time: new Date("2026-06-04T09:00:00") }); // x1 is 2026-06-06
  await page.goto("/match.html?id=x1");
  await expect(page.locator("#match-hero .match-meta")).toContainText("Matchday in 2 days");
});

test("a played opener shows its season context, clean-sheet flag and season lines", async ({ page }) => {
  await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=m1"); // 2–0, the first league result
  const context = page.locator("#context-panel");
  await expect(context).toBeVisible();
  await expect(context.locator(".mc-season")).toContainText("1–0–0"); // record through this match
  await expect(context.locator(".mc-flag")).toHaveCount(1);
  await expect(context.locator(".mc-flag")).toContainText("Clean sheet");
  await expect(context.locator(".mc-entering")).toHaveCount(0); // nothing played before the opener
  // every lineup row carries the player's season line through this match
  await expect(page.locator("#match-lineup .mp-stat")).toHaveCount(4);
  await expect(page.locator("#match-lineup .mp-stat").first()).toContainText("1 app");
  await expect(page.locator("#h2h-panel")).toBeHidden(); // one meeting is no history
  expect(errors).toEqual([]);
});

test("a later result reports the form entering it and the record it set", async ({ page }) => {
  await mockSupabase(page);
  const errors = watchErrors(page);
  await page.goto("/match.html?id=m4"); // 4–1 away win over the prior 1–1–1
  const context = page.locator("#context-panel");
  const entering = context.locator(".mc-entering");
  await expect(entering).toBeVisible();
  await expect(entering.locator(".form-pill")).toHaveCount(3); // m1 W · m2 D · m3 L
  await expect(entering.locator("h4 small")).toContainText("1W 1D 1L"); // record across those three
  await expect(context.locator(".mc-season")).toContainText("2–1–1"); // W D L W through m4
  await expect(context.locator(".mc-flag")).toHaveCount(1);
  await expect(context.locator(".mc-flag")).toContainText("Biggest win of the season"); // 4 > prior best 2
  expect(errors).toEqual([]);
});

/* ---- mobile layout (the picker once pushed the page past a 320px screen
   and crushed the "Match squad" heading into the button stack) ---------- */

for (const width of [320, 390, 1440]) {
  test(`no horizontal overflow at ${width}px (upcoming fixture)`, async ({ page }) => {
    await mockSupabase(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/match.html?id=x1");
    await expect(page.locator("#squad-panel")).toBeVisible();
    expect(await fitsViewport(page)).toBe(true);
  });
}

test("no horizontal overflow at 320px (played fixture)", async ({ page }) => {
  await mockSupabase(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/match.html?id=m1");
  await expect(page.locator("#lineup-panel")).toBeVisible();
  expect(await fitsViewport(page)).toBe(true);
});

for (const width of [320, 390]) {
  test(`match-squad heading sits above the action buttons at ${width}px`, async ({ page }) => {
    await mockSupabase(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/match.html?id=x1");
    await expect(page.locator("#squad-panel")).toBeVisible();
    const heading = await page.locator("#squad-panel .section-heading h2").boundingBox();
    const controls = await page.locator("#squad-panel .squad-controls").boundingBox();
    expect(controls.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1); // stacked, never side-crushed
    expect(heading.height).toBeLessThan(36); // the h2 stays on one line (1.55rem ≈ 25px)
  });
}

test("played match: the substitutes heading keeps its gap below the starters", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/match.html?id=m1");
  const gap = await page.evaluate(() => {
    const groups = document.querySelectorAll("#match-lineup .match-group");
    if (groups.length < 2) return -1;
    const players = groups[0].querySelector(".match-players");
    const next = groups[1].querySelector("h4");
    if (!players || !next) return -1;
    return next.getBoundingClientRect().top - players.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThan(6);
});
