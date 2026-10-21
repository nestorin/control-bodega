// Feature Flags for incremental Firestore rollout
// Controlled via Vite env vars: VITE_FIRESTORE_CATALOGOS=true, etc.

export const FEATURE_FLAGS = {
  // Catalogs are authoritative in Firestore. Keep this domain enabled in
  // production even when the hosting build omits local .env files.
  USE_FIRESTORE_CATALOGOS: import.meta.env.VITE_FIRESTORE_CATALOGOS !== "false",
  USE_FIRESTORE_RECEPCIONES: import.meta.env.VITE_FIRESTORE_RECEPCIONES === "true",
  USE_FIRESTORE_EVIDENCIAS: import.meta.env.VITE_FIRESTORE_EVIDENCIAS === "true",
  USE_FIRESTORE_INVENTARIO: import.meta.env.VITE_FIRESTORE_INVENTARIO === "true",
  USE_FIRESTORE_LOTES: import.meta.env.VITE_FIRESTORE_LOTES === "true",
  USE_FIRESTORE_EMBARQUES: import.meta.env.VITE_FIRESTORE_EMBARQUES === "true",
  USE_FIRESTORE_OFFLINE_QUEUE: import.meta.env.VITE_FIRESTORE_OFFLINE_QUEUE === "true",
  USE_NEW_RECEPTION_FLOW: import.meta.env.VITE_USE_NEW_RECEPTION_FLOW !== "false",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag];
}

export function getEnabledFlags(): FeatureFlagKey[] {
  return Object.entries(FEATURE_FLAGS)
    .filter(([, v]) => v)
    .map(([k]) => k as FeatureFlagKey);
}

// Debug helper
if (import.meta.env.DEV) {
  console.log("🔧 Feature Flags:", FEATURE_FLAGS);
}
