import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const FLAGS_FILE = "config/firestore-domain-flags.env";
const SHARED_FLAG_LINE = /^VITE_FIRESTORE_[A-Z_]+=(true|false)$/;

// Parses the shared flag file into a map, skipping comments and blank lines.
const parseSharedFlags = (contents: string): Map<string, string> => {
  const flags = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    flags.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return flags;
};

describe("Firestore domain flags contract", () => {
  it("defines every Firestore domain flag declared in the feature flag source", () => {
    const featureFlagSource = repoFile("src/config/featureFlags.ts");
    const declaredFlags = new Set(featureFlagSource.match(/VITE_FIRESTORE_[A-Z_]+/g) ?? []);
    const sharedFlags = parseSharedFlags(repoFile(FLAGS_FILE));

    expect(declaredFlags.size).toBeGreaterThan(0);
    for (const flag of declaredFlags) {
      expect(sharedFlags.get(flag)).toMatch(/^(true|false)$/);
    }
  });

  it("defines only well-formed entries in the shared flag file", () => {
    const entries = repoFile(FLAGS_FILE)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toMatch(SHARED_FLAG_LINE);
    }
  });

  it("loads the shared flag file in the production workflow instead of hardcoding flags", () => {
    const workflow = repoFile(".github/workflows/ci-cd.yml");

    expect(workflow).toContain(FLAGS_FILE);
    expect(workflow).not.toMatch(/VITE_FIRESTORE_[A-Z_]+\s*:/);
  });

  it("loads the shared flag file in the E2E build instead of hardcoding flags", () => {
    const e2eBuildScript = repoFile("scripts/build-e2e.mjs");

    expect(e2eBuildScript).toContain(FLAGS_FILE);
    expect(e2eBuildScript).not.toMatch(/VITE_FIRESTORE_[A-Z_]+\s*:/);
  });
});
