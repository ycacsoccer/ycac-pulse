/* Playwright config — local E2E, fully mocked API (tests/e2e/).
   Starts scripts/serve-static.js on 4173 and runs Chromium against it: no
   Supabase credentials, no network, deterministic fixtures. */
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4319",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/serve-static.js --port 4319",
    url: "http://127.0.0.1:4319/index.html",
    // never borrow somebody else's server: if the port is busy, fail loudly
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
