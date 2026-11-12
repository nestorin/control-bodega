import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectId = "demo-exepa-e2e";
const emulatorPorts = JSON.parse(
  readFileSync(new URL("../config/e2e-emulator-ports.json", import.meta.url), "utf8"),
);
const ocrEmulatorUrl = `http://127.0.0.1:${emulatorPorts.functions}/${projectId}/us-central1`;
const useMockAuth = process.env.VITE_USE_MOCK_AUTH !== "false";

// The Firestore domain flags live in a single shared file that the production
// Hosting build also consumes. Reading it here keeps the E2E bundle on exactly
// the configuration production ships, so the E2E suite can no longer validate a
// build that differs from the deployed one.
const firestoreDomainFlagsFile = new URL("../config/firestore-domain-flags.env", import.meta.url);

function readFirestoreDomainFlags(url) {
  const filePath = fileURLToPath(url);
  const contents = readFileSync(url, "utf8");
  const flags = {};
  let lineNumber = 0;

  for (const rawLine of contents.split(/\r?\n/)) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(VITE_FIRESTORE_[A-Z_]+)=(true|false)$/.exec(line);
    if (!match) {
      throw new Error(
        `Malformed Firestore domain flag on line ${lineNumber} of ${filePath}: "${rawLine}"`,
      );
    }
    flags[match[1]] = match[2];
  }

  if (Object.keys(flags).length === 0) {
    throw new Error(`No Firestore domain flags are defined in ${filePath}`);
  }

  return flags;
}

const firestoreDomainFlags = readFirestoreDomainFlags(firestoreDomainFlagsFile);

for (const [name, value] of Object.entries({
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  FIREBASE_PROJECT: process.env.FIREBASE_PROJECT,
})) {
  if (value && value !== projectId) {
    throw new Error(`E2E build is restricted to ${projectId}; ${name} points to ${value}.`);
  }
}

if (process.env.FIREBASE_CONFIG) {
  const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
  if (firebaseConfig.projectId && firebaseConfig.projectId !== projectId) {
    throw new Error(
      `E2E build is restricted to ${projectId}; FIREBASE_CONFIG points to ${firebaseConfig.projectId}.`,
    );
  }
}

const child = spawnSync("pnpm", ["run", "build"], {
  stdio: "inherit",
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    CI: process.env.CI,
    VITE_USE_FIREBASE_EMULATORS: "true",
    VITE_E2E_MODE: "true",
    VITE_E2E_AUTH_EMULATOR_PORT: String(emulatorPorts.auth),
    VITE_E2E_FIRESTORE_EMULATOR_PORT: String(emulatorPorts.firestore),
    VITE_E2E_FUNCTIONS_EMULATOR_PORT: String(emulatorPorts.functions),
    VITE_E2E_STORAGE_EMULATOR_PORT: String(emulatorPorts.storage),
    VITE_USE_MOCK_AUTH: String(useMockAuth),
    VITE_FIREBASE_API_KEY: "demo-e2e-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: projectId,
    VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
    VITE_FIREBASE_APP_ID: "1:000000000000:web:e2e",
    VITE_RECAPTCHA_SITE_KEY: "e2e-recaptcha-site-key",
    VITE_OCR_URL: ocrEmulatorUrl,
    VITE_SENTRY_DSN: "",
    ...firestoreDomainFlags,
    VITE_USE_NEW_RECEPTION_FLOW: "true",
  },
});

if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
