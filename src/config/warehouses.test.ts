import { describe, expect, it } from "vitest";
import { getWarehouseName, normalizeWarehouseId, WAREHOUSE_IDS } from "./warehouses";

describe("warehouse identity", () => {
  it.each([
    ["ALM-001", WAREHOUSE_IDS.NORTH],
    ["almacen-001", WAREHOUSE_IDS.NORTH],
    ["alm_norte", WAREHOUSE_IDS.NORTH],
    ["warehouse-1", WAREHOUSE_IDS.NORTH],
    ["ALM-002", WAREHOUSE_IDS.SOUTH],
    ["almacen-002", WAREHOUSE_IDS.SOUTH],
    ["warehouse-2", WAREHOUSE_IDS.SOUTH],
  ])("normalizes %s to %s", (legacyId, canonicalId) => {
    expect(normalizeWarehouseId(legacyId)).toBe(canonicalId);
  });

  it("does not treat an unknown ID as a valid warehouse", () => {
    expect(normalizeWarehouseId("warehouse-unknown")).toBeNull();
    expect(getWarehouseName("warehouse-unknown")).toBeNull();
  });

  it("keeps display names separate from stable IDs", () => {
    expect(getWarehouseName(WAREHOUSE_IDS.NORTH)).toBe("Tehuacan-1");
    expect(getWarehouseName("ALM-001")).toBe("Tehuacan-1");
  });
});
