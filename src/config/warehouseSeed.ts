import { WAREHOUSE_IDS } from "./warehouses"

export const ORGANIZATION_ID = "org_exepa_001"

export const CANONICAL_WAREHOUSE_SEED = [
  { id: WAREHOUSE_IDS.NORTH, code: "WH-TEHUACAN-1", name: "Tehuacan-1" },
  { id: WAREHOUSE_IDS.SOUTH, code: "WH-TEHUACAN-2", name: "Tehuacan-2" },
] as const

export type WarehouseSeed = typeof CANONICAL_WAREHOUSE_SEED[number]

export function validateExistingWarehouse(
  existing: Record<string, unknown>,
  expected: WarehouseSeed,
): string[] {
  const errors: string[] = []
  for (const [field, value] of Object.entries(expected)) {
    if (existing[field] !== value) {
      errors.push(
        `${field} expected ${String(value)}, found ${String(existing[field])}`,
      )
    }
  }
  if (existing.organizationId !== ORGANIZATION_ID) {
    errors.push(
      `organizationId expected ${ORGANIZATION_ID}, found ${String(existing.organizationId)}`,
    )
  }
  return errors
}
