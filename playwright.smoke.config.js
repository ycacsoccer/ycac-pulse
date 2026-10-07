/* Playwright config — post-deploy SMOKE against the published site.
   No webServer, no mocks: this runs in CI right after actions/deploy-pages,
   and locally with `npm run test:smoke`. Set SMOKE_BASE_URL to aim it at a
   staging host; set SMOKE_COMMIT to make the propagation check mandatory. */
const { defineConfig, devices } = require("@playwright/test");

const BASE_URL = process.env.SMOKE_BASE_URL || "https://ycacsoccer.github.io/ycac-pulse/";

module.exports = defineConfig({
  testDir: "tests/smoke",
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
