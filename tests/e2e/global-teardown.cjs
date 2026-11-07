const { spawn } = require("child_process");

module.exports = async function globalTeardown() {
  console.log("\n🛑 === GLOBAL TEARDOWN: Cleaning Up ===\n");

  if (global.__DEV_SERVER_PROCESS__) {
    global.__DEV_SERVER_PROCESS__.kill();
    console.log("✅ Dev server killed");
  }
  if (global.__EMULATOR_PROCESS__) {
    global.__EMULATOR_PROCESS__.kill();
    console.log("✅ Emulator killed");
  }

  // Also try to kill any remaining processes on our ports
  await new Promise((resolve) => {
    const killer = spawn("pkill", ["-f", "firebase.*emulators:start"], {
      stdio: "ignore",
    });
    killer.on("close", () => resolve());
  });
  await new Promise((resolve) => {
    const killer = spawn("pkill", ["-f", "vite.*dev.*5173"], {
      stdio: "ignore",
    });
    killer.on("close", () => resolve());
  });

  await new Promise((r) => setTimeout(r, 1000));
  console.log("\n✅ Cleanup complete\n");
};
