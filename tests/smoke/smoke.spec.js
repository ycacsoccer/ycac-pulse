/* Post-deploy smoke against the PUBLISHED site (CI runs this right after
   actions/deploy-pages; locally: npm run test:smoke).

   1. build-info.json must report the pushed commit — proves the deployment
      actually propagated before anything else is asserted.
   2. The public pages render from live anon data: charts, KPIs, squad chips,
      player cards, a real profile — with wave 21's attendance surface gone.
   3. No horizontal overflow, no JS exceptions, and team-only pages still
      bounce anonymous visitors to the login gate. */
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
  await expect(page.locator("#tml-record")).toContainText(/\d+–\d+–\d+/);
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
  await expect(page.locator(".pcq")).toHaveCount(0); // wave 21: no appearance-% cells
  await expect(page.locator(".pc-tot").first()).toBeVisible();

  await page.locator(".player-card").first().click();
  await expect(page).toHaveURL(/player\.html\?id=/);
  await expect(page.locator("#profile-hero .ptile")).toHaveCount(3); // wave 21: attendance tile gone
  await expect(page.locator("#profile-timeline .timeline-entry").first()).toBeVisible();
  await expect(page.locator("#profile-positions svg")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("team-only pages still bounce anonymous visitors to the login gate", async ({ page }) => {
  await page.goto("./team.html");
  await expect(page).toHaveURL(/login\.html/);
});

for (const width of [390, 1440]) {
  test(`published index has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(page.locator("#tml-record")).toContainText(/\d+–\d+–\d+/);
    expect(await fitsViewport(page)).toBe(true);
  });
}
