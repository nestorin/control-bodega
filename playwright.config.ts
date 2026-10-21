import { defineConfig, devices } from "@playwright/test"
// En modo MOCK (E2E), no necesitamos auth.setup - el mock provee usuario automáticamente
// El setup solo es necesario para tests con Firebase Auth real
// The E2E build is mock-auth by default. Real-auth runs are opt-in and must
// explicitly provide VITE_USE_MOCK_AUTH=false together with their emulators.
const isMockMode = process.env.VITE_USE_MOCK_AUTH !== "false"

const projects = isMockMode
  ? [
      {
        name: "chromium",
        use: { ...devices["Desktop Chrome"] },
      },
    ]
  : [
      {
        name: "setup",
        testMatch: /.*\.setup\.ts/,
        teardown: "cleanup",
      },
      {
        name: "chromium",
        use: {
          ...devices["Desktop Chrome"],
          storageState: "playwright/.auth/user.json",
        },
        dependencies: ["setup"],
      },
      {
        name: "cleanup",
        testMatch: /.*\.cleanup\.ts/,
      },
    ]

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/*.spec.ts"],
  // One-off diagnostic specs kept for reference but excluded from the suite.
  testIgnore: ["**/debug-*.spec.ts", "**/test-*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects,
  // Seeds emulator data (lotes + pallet) after webServers start and before tests.
  globalSetup: "./e2e/global-setup.ts",
  webServer: [
    {
      // The E2E build connects to the local emulators (see scripts/build-e2e.mjs);
      // without them the app logs ERR_CONNECTION_REFUSED and console-error
      // assertions fail. firebase.e2e.json loads firestore.e2e.rules (open
      // rules) because mock auth never authenticates against the Auth service.
      // The pre-kill loop clears orphaned emulator processes (Playwright kills
      // the CLI but the java child can survive, which would fail reuseExisting-
      // Server: false with "port already in use").
      command:
        "for p in $(lsof -nP -iTCP:8082 -iTCP:9100 -iTCP:9199 -sTCP:LISTEN -t 2>/dev/null); do kill -9 $p; done; firebase emulators:start --config firebase.e2e.json --only auth,firestore,storage --project demo-exepa-e2e",
      url: "http://127.0.0.1:8082",
      // Never reuse: a leftover emulator may hold the wrong rules file
      // (firestore.rules instead of firestore.e2e.rules).
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command:
        "node scripts/build-e2e.mjs && pnpm preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 180000,
    },
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
    },
  },
})
