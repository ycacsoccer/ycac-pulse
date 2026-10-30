/* Post-deploy smoke against the PUBLISHED site (CI runs this right after
   actions/deploy-pages; locally: npm run test:smoke).

   1. build-info.json must report the pushed commit — proves the deployment
      actually propagated before anything else is asserted.
   2. The public pages render from live anon data: charts, KPIs, squad chips,
      player cards, a real profile — with wave 21's attendance surface gone.
   3. No horizontal overflow, no JS exceptions, every page (team included)
      reachable without a login, and the footer badge naming the build. */
const { test, expect } = require("@playwright/test");

const COMMIT = process.env.SMOKE_COMMIT || "";

const watchErrors = (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

const fitsViewport = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("the published build is the commit we pushed", async ({ request }) => {
  test.skip(!COMMIT, "SMOKE_COMMIT not set — skipping the propagation check");
  const deadline = Date.now() + 3 * 60_000;
  let published = "";
  while (Date.now() < deadline) {
    const response = await request.get("build-info.json");
    if (response.ok()) {
      const info = await response.json().catch(() => ({}));
      published = String(info.commit || "");
      if (published.startsWith(COMMIT.slice(0, 7)) || COMMIT.startsWith(published.slice(0, 7))) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  expect(published.slice(0, 7), "build-info.json commit").toBe(COMMIT.slice(0, 7));
});

test("index renders live data with charts, KPIs and no attendance surface", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await expect(page.locator("#season-record")).toContainText(/\d+–\d+–\d+/); // wave 23: unified band
  await expect(page.locator("#matchday .md-card").first()).toBeVisible(); // wave 23: matchday-first hero
  await expect(page.locator("#perf-tml-trend svg.trend-svg").first()).toBeVisible();
  await expect(page.locator("#perf-tml-kpi .kpi")).toHaveCount(3); // wave 21: attendance tile gone
  await expect(page.locator(".attendance-panel, #attendance-search")).toHaveCount(0);
  await expect(page.locator("#squad-chips .squad-chip")).not.toHaveCount(0);
  await expect(page.locator("#tml-results a.match").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("players grid and a real profile render from live data", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./players.html");
  await expect(page.locator(".player-card").first()).toBeVisible();
  expect(await page.locator(".player-card").count()).toBeGreaterThan(3);
  await expect(page.locator(".player-card").first().locator(".pc-split")).toHaveCount(2);
  await expect(page.locator(".player-card").first()).toContainText(/\d+%/);

  await page.locator(".player-card").first().click();
  await expect(page).toHaveURL(/player\.html\?id=/);
  await expect(page.locator("#profile-hero .profile-competition")).toHaveCount(2); // wave 26: TML + Friendly summaries
  await expect(page.locator("#profile-timeline .timeline-entry").first()).toBeVisible();
  await expect(page.locator("#profile-positions svg")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the team page renders for anonymous visitors — no login bounce", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./team.html");
  await expect(page).toHaveURL(/team\.html/); // wave 33: requireCoach() is gone
  await expect(page.locator("#coach-form")).toHaveCount(0);
  await expect(page.locator("#team-content")).toBeVisible(); // content or its empty state
  expect(errors).toEqual([]);
});

test("a live fixture detail opens every panel for anonymous visitors", async ({ page }) => {
  await page.goto("./match.html?id=m006");
  await expect(page).toHaveURL(/match\.html\?id=m006/);
  await expect(page.locator("#match-hero")).toContainText("Corinthians Harbour FC");
  await expect(page.locator("#signups-panel")).toBeVisible(); // wave 33: public reads signups/match_notes
  await expect(page.locator("#notes-panel")).toBeVisible();
});

test("the standalone tactical foundation and both videos are published", async ({ page, request }) => {
  const errors = watchErrors(page);
  await page.goto("./tactical-foundation.html");
  await expect(page.locator("h1")).toContainText("Our Tactical");
  await expect(page.locator(".team-key")).toContainText("purple team");
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator("#page-title")).toContainText("戦術の土台");
  await expect(page.locator("#defence-title")).toContainText("守備の形");
  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(page.locator("#page-title")).toContainText("战术基础");
  await expect(page.locator("#defence-title")).toContainText("防守阵型");
  await page.getByRole("button", { name: "English" }).click();
  const videos = page.locator("video");
  await expect(videos).toHaveCount(2);
  for (const [index, name] of ["defensive-shape", "attacking-buildup"].entries()) {
    const video = videos.nth(index);
    await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(1);
    const response = await request.get(`media/tactical-foundation/${name}.mp4`, { headers: { Range: "bytes=0-31" } });
    expect([200, 206]).toContain(response.status());
    expect(response.headers()["content-type"]).toContain("video/mp4");
    await video.evaluate(async (element) => { element.muted = true; await element.play(); });
    await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.1);
    await video.evaluate((element) => element.pause());
  }
  expect(errors).toEqual([]);
});

test("the footer names the build: commit link and relative time", async ({ page }) => {
  await page.goto("./");
  const badge = page.locator("#build-info");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/ · /); // "<sha> · <relative time>"
  await expect(badge.locator(".build-commit")).toHaveText(/^[0-9a-f]{7}$/);
  await expect(badge.locator(".build-commit")).toHaveAttribute("href", /\/commit\/[0-9a-f]{7}/);
  await expect(badge).toHaveAttribute("title", /\d{4}-\d{2}-\d{2}T/); // full sha · builtAt · node
});

for (const width of [390, 1440]) {
  test(`published index has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(page.locator("#season-record")).toContainText(/\d+–\d+–\d+/);
    expect(await fitsViewport(page)).toBe(true);
  });
}
