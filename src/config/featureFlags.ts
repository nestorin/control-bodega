// Feature Flags for incremental Firestore rollout
// Controlled via Vite env vars: VITE_FIRESTORE_CATALOGOS=true, etc.

import { normalizeWarehouseId, WAREHOUSE_IDS } from "@/config/warehouses";

export const FEATURE_FLAGS = {
  ENABLE_LABELING_UI: import.meta.env.VITE_ENABLE_LABELING_UI === "true",
  // Catalogs are authoritative in Firestore. Keep this domain enabled in
  // production even when the hosting build omits local .env files.
  USE_FIRESTORE_CATALOGOS: import.meta.env.VITE_FIRESTORE_CATALOGOS !== "false",
  USE_FIRESTORE_LABELING_CATALOGOS: import.meta.env.VITE_FIRESTORE_LABELING_CATALOGOS !== "false",
  // Recepciones are persisted through the callable backend. Keep the
  // canonical path enabled in production unless explicitly disabled.
  USE_FIRESTORE_RECEPCIONES: import.meta.env.VITE_FIRESTORE_RECEPCIONES !== "false",
  USE_FIRESTORE_EVIDENCIAS: import.meta.env.VITE_FIRESTORE_EVIDENCIAS === "true",
  USE_FIRESTORE_INVENTARIO: import.meta.env.VITE_FIRESTORE_INVENTARIO === "true",
  // Lote projections are the canonical inventory read model. Keep this on by
  // default so production builds without local .env files do not render an empty inventory screen.
  USE_FIRESTORE_LOTES: import.meta.env.VITE_FIRESTORE_LOTES !== "false",
  USE_FIRESTORE_EMBARQUES: import.meta.env.VITE_FIRESTORE_EMBARQUES === "true",
  USE_FIRESTORE_OFFLINE_QUEUE: import.meta.env.VITE_FIRESTORE_OFFLINE_QUEUE === "true",
  USE_NEW_RECEPTION_FLOW: import.meta.env.VITE_USE_NEW_RECEPTION_FLOW !== "false",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag];
}

/**
 * The Etiquetado UI is a warehouse-scoped pilot. Membership access alone is
 * not enough: the current warehouse must be the pilot warehouse as well.
 */
export function isLabelingUiEnabledForWarehouse(
  warehouseId: string | null | undefined,
  enabled = isFeatureEnabled("ENABLE_LABELING_UI"),
): boolean {
  return enabled && normalizeWarehouseId(warehouseId) === WAREHOUSE_IDS.LABELING_PILOT;
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
