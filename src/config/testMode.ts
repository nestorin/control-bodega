// Build-time gate for URL-driven test deep links (?test=...).
// Enabled only in dev builds or in e2e builds, where scripts/build-e2e.mjs sets
// VITE_E2E_MODE=true. Mirrors the IS_MOCK_MODE pattern in src/context/AuthContext.tsx:
// production bundles are evaluated at build time and never read test mode from the URL.

// Structural slice of import.meta.env (TS cannot parse `typeof import.meta.env`).
export interface TestDeepLinkEnv {
  DEV: boolean;
  VITE_E2E_MODE?: string;
}

export function isTestDeepLinkEnabled(env: TestDeepLinkEnv): boolean {
  return env.DEV || env.VITE_E2E_MODE === "true";
}

export const testDeepLinksEnabled = isTestDeepLinkEnabled(import.meta.env);
