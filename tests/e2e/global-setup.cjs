console.log("[GlobalSetup] 🔧 GLOBAL SETUP FILE LOADED - Starting Test Infrastructure");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let emulatorProcess = null;
let devServerProcess = null;

async function waitForPort(host, port, timeoutMs = 30000) {
  const net = require("net");
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => socket.destroy());
      socket.once("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.connect(port, host);
    };
    tryConnect();
  });
}

async function checkEmulatorRunning() {
  try {
    // Read ports from config
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(process.cwd(), "config", "e2e-emulator-ports.json");
    const ports = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const firestorePort = ports.firestore || 8082;

    await waitForPort("localhost", firestorePort, 2000);
    return true;
  } catch {
    return false;
  }
}

async function startEmulators() {
  const alreadyRunning = await checkEmulatorRunning();
  if (alreadyRunning) {
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(process.cwd(), "config", "e2e-emulator-ports.json");
    const ports = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log(`✅ Emulators already running on port ${ports.firestore}`);
    return;
  }

  const configPath = path.join(process.cwd(), "config", "e2e-emulator-ports.json");
  const ports = JSON.parse(fs.readFileSync(configPath, "utf8"));
  console.log(
    `🚀 Starting Firebase Emulators (firestore:${ports.firestore}, auth:${ports.auth}, functions:${ports.functions})...`,
  );

  global.__EMULATOR_PROCESS__ = spawn(
    "pnpm",
    [
      "dlx",
      "firebase-tools@latest",
      "emulators:start",
      "--only",
      "firestore,functions,storage,auth",
      "--project",
      "demo-exepa-e2e",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: `localhost:${ports.firestore}`,
        GCLOUD_PROJECT: "demo-exepa-e2e",
      },
    },
  );
  emulatorProcess = global.__EMULATOR_PROCESS__;

  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (data) => {
      output += data.toString();
      if (output.includes("Firestore Emulator was started") || output.includes("running on")) {
        cleanup();
        console.log("✅ Emulators ready");
        resolve();
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      emulatorProcess?.stdout?.off("data", onData);
      emulatorProcess?.stderr?.off("data", onData);
      emulatorProcess?.off("error", onError);
    };
    emulatorProcess?.stdout?.on("data", onData);
    emulatorProcess?.stderr?.on("data", onData);
    emulatorProcess?.on("error", onError);

    setTimeout(() => {
      cleanup();
      if (output.includes("Firestore Emulator was started") || output.includes("running on")) {
        resolve();
      } else {
        reject(new Error("Emulator startup timeout"));
      }
    }, 60000);
  });
}

async function checkDevServerRunning() {
  try {
    console.log("[GlobalSetup] Checking dev server on port 5173...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch("http://localhost:5173", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const isRunning = response.ok;
    console.log(
      `[GlobalSetup] Dev server check on port 5173: ${
        isRunning ? "RUNNING" : "NOT RUNNING"
      } (status: ${response.status})`,
    );
    return isRunning;
  } catch (err) {
    console.log(`[GlobalSetup] Dev server check on port 5173 failed: ${err.message}`);
    return false;
  }
}

async function startDevServer() {
  const alreadyRunning = await checkDevServerRunning();
  if (alreadyRunning) {
    console.log("[GlobalSetup] ✅ Dev server already running on port 5173");
    return;
  }

  console.log("[GlobalSetup] 🚀 Starting Vite Dev Server on port 5173...");

  global.__DEV_SERVER_PROCESS__ = spawn("pnpm", ["dev", "--port", "5173"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VITE_FIRESTORE_EMULATOR: "true",
      VITE_FUNCTIONS_EMULATOR: "true",
      VITE_USE_NEW_RECEPTION_FLOW: "false",
      VITE_USE_FIREBASE_EMULATORS: "true",
      VITE_E2E_MODE: "true",
      VITE_E2E_AUTH_EMULATOR_PORT: "9100",
      VITE_E2E_FIRESTORE_EMULATOR_PORT: "8082",
      VITE_E2E_FUNCTIONS_EMULATOR_PORT: "5001",
      VITE_E2E_STORAGE_EMULATOR_PORT: "9199",
      VITE_E2E_OCR_URL: "http://localhost:5001/demo-exepa-e2e/us-central1/extract_ocr_secure",
      VITE_OCR_URL: "http://localhost:5001/demo-exepa-e2e/us-central1/extract_ocr_secure",
      VITE_FIREBASE_PROJECT_ID: "demo-exepa-e2e",
      VITE_FIREBASE_API_KEY: "demo-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-exepa-e2e.firebaseapp.com",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-exepa-e2e.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
      VITE_FIREBASE_APP_ID: "1:123456789:web:abcdef123456",
      VITE_USE_FIREBASE_EMULATORS: "true",
      VITE_E2E_MODE: "true",
      VITE_E2E_AUTH_EMULATOR_PORT: "9100",
      VITE_E2E_FIRESTORE_EMULATOR_PORT: "8082",
      VITE_E2E_FUNCTIONS_EMULATOR_PORT: "5001",
      VITE_E2E_STORAGE_EMULATOR_PORT: "9199",
    },
  });
  devServerProcess = global.__DEV_SERVER_PROCESS__;

  // Wait for server to be ready by polling the port
  console.log("[GlobalSetup] Waiting for dev server to be ready...");
  await waitForPort("localhost", 5173, 60000);
  console.log("[GlobalSetup] ✅ Dev server ready");
}

module.exports = async function globalSetup(config) {
  console.log("\n[GlobalSetup] 🔧 === GLOBAL SETUP: Starting Test Infrastructure ===\n");

  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(process.cwd(), "config", "e2e-emulator-ports.json");
  const ports = JSON.parse(fs.readFileSync(configPath, "utf8"));

  process.env.FIRESTORE_EMULATOR_HOST = `localhost:${ports.firestore}`;

  await startEmulators();
  await startDevServer();
  await waitForPort("localhost", ports.firestore, 5000);
  await waitForPort("localhost", 5173, 5000);

  console.log("\n[GlobalSetup] ✅ === Infrastructure Ready ===\n");
};
