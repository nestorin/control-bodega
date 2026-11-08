import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
const requiredProductionFirebaseEnv = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_RECAPTCHA_SITE_KEY",
];

export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    const environment = loadEnv(mode, process.cwd(), "");
    const missing = requiredProductionFirebaseEnv.filter((name) => !environment[name]);

    if (missing.length > 0) {
      throw new Error(`Missing required production Firebase configuration: ${missing.join(", ")}`);
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // vendor-pdf (1MB) and vendor-firebase (662kB) are expected to be large.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React core
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }

            // Firebase ecosystem
            if (
              id.includes("firebase/app") ||
              id.includes("firebase/auth") ||
              id.includes("firebase/firestore") ||
              id.includes("firebase/storage") ||
              id.includes("firebase/functions") ||
              id.includes("firebase/database") ||
              id.includes("firebase/analytics") ||
              id.includes("firebase/performance")
            ) {
              return "vendor-firebase";
            }

            // PDF/ocr processing
            if (id.includes("pdfjs-dist") || id.includes("jspdf") || id.includes("html2canvas")) {
              return "vendor-pdf";
            }

            // ZXing QR scanning
            if (id.includes("@zxing/browser") || id.includes("@zxing/library")) {
              return "vendor-qr";
            }

            // UI components
            if (
              id.includes("lucide-react") ||
              id.includes("date-fns") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge")
            ) {
              return "vendor-ui";
            }

            // Default: let rolldown decide
          },
        },
      },
    },
  };
});
