import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./flows",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  timeout: 120000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      // The auth setup writes E2E_AUTH_STATE_PATH. Keep it as an explicit
      // dependency so authenticated flows never start with a stale/missing
      // storage state while the emulators are already running.
      name: "setup",
      testMatch: /auth\.setup\.spec\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.spec\.ts/,
    },
  ],
  globalSetup: "./global-setup.cjs",
  globalTeardown: "./global-teardown.cjs",
});
