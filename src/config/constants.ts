/**
 * Shared Constants — God Component Refactor
 *
 * Centralized constants extracted from App.tsx to eliminate magic values
 * and provide a single source of truth for configuration.
 */

// ============================================
// Asset Paths
// ============================================

/** Base path for static assets */
export const ASSET_PATH_PREFIX = '/assets';

/** Asset filenames (imported as URLs by Vite) */
export const ASSETS = {
  PACKAGE: `${ASSET_PATH_PREFIX}/4cca0.svg`,
  WAREHOUSE_NAV: `${ASSET_PATH_PREFIX}/66fcc.svg`,
  CLIPBOARD_LIST_NAV: `${ASSET_PATH_PREFIX}/c2509.svg`,
  SCAN_QR_CODE_NAV: `${ASSET_PATH_PREFIX}/ba9e1.svg`,
  AVATAR: `${ASSET_PATH_PREFIX}/35fee.svg`,
  INDICADOR: `${ASSET_PATH_PREFIX}/08d70.svg`,
  ETIQUETADO_NAV: `${ASSET_PATH_PREFIX}/4cca0.svg`,
} as const;

// ============================================
// Organization Constants
// ============================================

/** Canonical organization ID */
export const ORGANIZATION_ID = 'org_exepa_001';

/** Canonical warehouse IDs */
export const CANONICAL_WAREHOUSE_IDS = {
  NORTH: 'wh_tehuacan_1',
  SOUTH: 'wh_tehuacan_2',
} as const;

// ============================================
// Time Constants
// ============================================

/** Default cache TTL in milliseconds (5 minutes) */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;