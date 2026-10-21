/**
 * Canonical warehouse identities used by the application.
 *
 * The ID is an immutable Firestore reference; `name` is display-only and may
 * be changed without changing memberships or operational records.
 */
export const WAREHOUSE_IDS = {
  NORTH: "wh_tehuacan_1",
  SOUTH: "wh_tehuacan_2",
} as const;

export type WarehouseId = (typeof WAREHOUSE_IDS)[keyof typeof WAREHOUSE_IDS];

export interface WarehouseDefinition {
  id: WarehouseId;
  name: string;
}

export const WAREHOUSES: readonly WarehouseDefinition[] = [
  { id: WAREHOUSE_IDS.NORTH, name: "Tehuacan-1" },
  { id: WAREHOUSE_IDS.SOUTH, name: "Tehuacan-2" },
];

/**
 * Compatibility aliases found in local fixtures and older memberships.
 * These are read-only migration aliases; new writes must use canonical IDs.
 */
const WAREHOUSE_ALIASES: Record<string, WarehouseId> = {
  "almacen-001": WAREHOUSE_IDS.NORTH,
  "almacen-002": WAREHOUSE_IDS.SOUTH,
  alm_norte: WAREHOUSE_IDS.NORTH,
  alm_sur: WAREHOUSE_IDS.SOUTH,
  "ALM-001": WAREHOUSE_IDS.NORTH,
  "ALM-002": WAREHOUSE_IDS.SOUTH,
  "warehouse-1": WAREHOUSE_IDS.NORTH,
  "warehouse-2": WAREHOUSE_IDS.SOUTH,
};

const canonicalIds = new Set<string>(Object.values(WAREHOUSE_IDS));

export function normalizeWarehouseId(value: string | null | undefined): WarehouseId | null {
  if (!value) return null;
  if (canonicalIds.has(value)) return value as WarehouseId;
  return WAREHOUSE_ALIASES[value] ?? null;
}

export function getWarehouseName(value: string | null | undefined): string | null {
  const id = normalizeWarehouseId(value);
  return WAREHOUSES.find((warehouse) => warehouse.id === id)?.name ?? null;
}
