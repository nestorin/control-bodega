// vitest.polyfill.ts - Runs BEFORE any test files or setup files
// Polyfill WritableStream for MSW (required in JSDOM)
if (typeof globalThis.WritableStream === "undefined") {
  // @ts-ignore
  const { WritableStream } = require("stream/web");
  globalThis.WritableStream = WritableStream;
}
