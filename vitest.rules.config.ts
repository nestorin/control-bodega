import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/test/firestore.rules.emulator.test.ts",
      "src/test/storage.rules.emulator.test.ts",
      "src/test/services/palletService.getByQR.test.ts",
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
