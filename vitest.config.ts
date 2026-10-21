import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.polyfill.ts", "./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Firestore emulator integration tests run only through `pnpm test:rules`.
    // Keeping them out of the unit suite prevents a missing emulator from
    // becoming skipped or misleading coverage.
    exclude: ["src/test/services/palletService.getByQR.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "vitest.setup.ts",
        "vitest.polyfill.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/**/*.d.ts",
        "src/App.tsx",
        "src/screens/**",
        "src/components/**",
        "src/hooks/**",
        "src/context/**",
        "src/lib/**",
        "src/config/**",
      ],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 44,
        statements: 40,
      },
    },
    globals: true,
    // Force development React build for act() support
    environmentOptions: {
      customExportConditions: ["development"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: "vmThreads",
    // Force NODE_ENV=development for test environment
    env: {
      NODE_ENV: "development",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  // Ensure react plugin uses development build
  define: {
    "process.env.NODE_ENV": '"development"',
  },
});
