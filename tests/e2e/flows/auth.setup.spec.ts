import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { E2E_AUTH_STATE_PATH } from "../utils/auth-state";

const PROJECT_ID = "demo-exepa-e2e";
const USER_ID = "test-user-qa";
const EMAIL = "qa@exepa.com";
const PASSWORD = "test-password";
const emulatorPorts = JSON.parse(readFileSync("config/e2e-emulator-ports.json", "utf8"));
const AUTH_EMULATOR_HOST = `127.0.0.1:${emulatorPorts.auth}`;
const FIRESTORE_EMULATOR_HOST = `127.0.0.1:${emulatorPorts.firestore}`;
const FUNCTIONS_EMULATOR_HOST = `127.0.0.1:${emulatorPorts.functions}`;

function assertDemoProject(): void {
  const configuredProjectIds = [
    process.env.FIREBASE_PROJECT,
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.VITE_FIREBASE_PROJECT_ID,
  ].filter((value): value is string => Boolean(value));

  if (configuredProjectIds.some((projectId) => projectId !== PROJECT_ID)) {
    throw new Error(
      `E2E seeding is restricted to ${PROJECT_ID}; a different Firebase project is configured.`,
    );
  }

  if (process.env.FIREBASE_CONFIG) {
    const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG) as {
      projectId?: string;
    };
    if (firebaseConfig.projectId && firebaseConfig.projectId !== PROJECT_ID) {
      throw new Error(
        `E2E seeding is restricted to ${PROJECT_ID}; FIREBASE_CONFIG targets ${firebaseConfig.projectId}.`,
      );
    }
  }
}

async function waitForEmulator(url: string, name: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status < 500) return;
      lastError = new Error(`${name} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${name} did not become ready within 30 seconds`, {
    cause: lastError,
  });
}

test("creates a real Auth Emulator session with an active Firestore membership", async ({
  page,
  context,
}) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("[EARLY CONSOLE ERROR]", msg.text());
    }
  });
  page.on("pageerror", (err) => {
    console.log("[EARLY PAGE ERROR]", err.message);
  });
  page.on("requestfailed", (req) => {
    console.log("[EARLY REQUEST FAILED]", req.url(), req.failure()?.errorText);
  });
  assertDemoProject();
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
  await waitForEmulator(`http://${AUTH_EMULATOR_HOST}`, "Firebase Auth Emulator");
  await waitForEmulator(`http://${FIRESTORE_EMULATOR_HOST}`, "Firestore Emulator");
  await waitForEmulator(`http://${FUNCTIONS_EMULATOR_HOST}`, "Functions Emulator");

  const adminApp = initializeApp({ projectId: PROJECT_ID }, "playwright-e2e-seed");
  try {
    const auth = getAuth(adminApp);
    try {
      const userRecord = await auth.createUser({
        uid: USER_ID,
        email: EMAIL,
        password: PASSWORD,
        displayName: "Playwright E2E Admin",
        emailVerified: true,
      });
      console.log("✅ User created in Auth emulator:", userRecord.uid);
    } catch (err) {
      if (err.code === "auth/uid-already-exists") {
        console.log("✅ User already exists, continuing...");
      } else {
        console.error("❌ Failed to create user:", err.code, err.message);
        throw err;
      }
    }

    const membership = getFirestore(adminApp).doc(`organizations/org_exepa_001/users/${USER_ID}`);
    await membership.set({
      userId: USER_ID,
      organizationId: "org_exepa_001",
      role: "OPERATOR",
      status: "ACTIVE",
      warehouseId: "wh_tehuacan_1",
      warehouseIds: ["wh_tehuacan_1"],
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    });
    console.log("[AUTH SETUP] Membership created in Firestore");
    const seededMembership = await membership.get();
    console.log("[AUTH SETUP] Seeded membership:", seededMembership.data());
    expect(seededMembership.data()).toMatchObject({
      userId: USER_ID,
      organizationId: "org_exepa_001",
      role: "OPERATOR",
      status: "ACTIVE",
    });
  } finally {
    await deleteApp(adminApp);
  }

  await page.goto("/login");
  // Debug: wait for page to load
  await page.waitForTimeout(5000);
  console.log("[AUTH SETUP] Current URL after goto:", page.url());
  console.log("[AUTH SETUP] Page title:", await page.title());

  await page.goto("/login");
  // Debug: wait for page to load
  await page.waitForTimeout(5000);
  console.log("[AUTH SETUP] Current URL after goto:", page.url());
  console.log("[AUTH SETUP] Page title:", await page.title());

  await page.goto("/login");
  // Debug: wait for page to load
  await page.waitForTimeout(5000);
  console.log("[AUTH SETUP] Current URL after goto:", page.url());
  console.log("[AUTH SETUP] Page title:", await page.title());

  // Monitor network requests
  page.on("response", (response) => {
    if (response.status() >= 400) {
      console.log("[AUTH SETUP] Failed request:", response.url(), response.status());
    }
  });

  // Debug: wait for page to load
  await page.waitForTimeout(5000);
  console.log("[AUTH SETUP] Current URL after goto:", page.url());
  console.log("[AUTH SETUP] Page title:", await page.title());

  // Debug: listen for console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("[AUTH SETUP] Console error:", msg.text());
    }
  });
  page.on("pageerror", (err) => {
    console.log("[AUTH SETUP] Page error:", err.message);
  });

  // Debug: log page content
  const pageContent = await page.content();
  console.log("[AUTH SETUP] Page content length:", pageContent.length);

  // Check if login form exists
  const emailInput = page.locator('input[type="email"]');
  const isVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);
  console.log("[AUTH SETUP] Email input visible:", isVisible);

  if (!isVisible) {
    const previewContent = await page.content();
    console.log("[AUTH SETUP] Page content preview:", previewContent.substring(0, 1000));
  }

  await page.locator('input[type="email"]').fill(EMAIL);

  // Debug: listen for console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("[AUTH SETUP] Console error:", msg.text());
    }
  });
  page.on("pageerror", (err) => {
    console.log("[AUTH SETUP] Page error:", err.message);
  });

  // Debug: check environment variables
  const envVars = await page.evaluate(() => {
    return {
      VITE_OCR_URL: (window as any).__VITE_OCR_URL,
      VITE_USE_FIREBASE_EMULATORS: (window as any).__VITE_USE_FIREBASE_EMULATORS,
      VITE_E2E_OCR_URL: (window as any).__VITE_E2E_OCR_URL,
    };
  });
  console.log("[AUTH SETUP] Env vars:", JSON.stringify(envVars, null, 2));

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  // Debug: wait and check for errors
  await page.waitForTimeout(3000);
  const currentUrl = page.url();
  console.log("[AUTH SETUP] Current URL after login click:", currentUrl);

  // Check for error messages
  const errorMessages = await page.locator('[role="alert"], .text-red, .bg-red').allTextContents();
  console.log("[AUTH SETUP] Error messages:", errorMessages);

  // Debug: log all buttons
  const buttons = await page.locator("button").allTextContents();
  console.log("[AUTH SETUP] Buttons after login:", buttons);

  // Check if still on login page
  if (page.url().includes("/login")) {
    // Check for error toast/message
    const pageContent2 = await page.content();
    console.log("[AUTH SETUP] Still on login page. Page length:", pageContent2.length);

    // Try to find any error message
    const errorText = await page
      .locator("text=/error|incorrect|inválido|wrong/i")
      .allTextContents();
    console.log("[AUTH SETUP] Possible error text:", errorText);
  }

  // Wait for navigation to complete and sidebar to render
  await page.waitForURL(/\/home|\//, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
    timeout: 30_000,
  });

  await mkdir(dirname(E2E_AUTH_STATE_PATH), { recursive: true });
  await context.storageState({ path: E2E_AUTH_STATE_PATH, indexedDB: true });
});
