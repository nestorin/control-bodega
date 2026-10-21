import { describe, expect, it } from "vitest";
import {
  CANONICAL_WAREHOUSE_SEED,
  ORGANIZATION_ID,
  validateExistingWarehouse,
} from "./warehouseSeed";

describe("warehouse seed validation", () => {
  it("accepts an existing canonical warehouse without changes", () => {
    expect(
      validateExistingWarehouse(
        {
          ...CANONICAL_WAREHOUSE_SEED[0],
          organizationId: ORGANIZATION_ID,
        },
        CANONICAL_WAREHOUSE_SEED[0],
      ),
    ).toEqual([]);
  });

  it("reports conflicts instead of allowing an overwrite", () => {
    const errors = validateExistingWarehouse(
      {
        ...CANONICAL_WAREHOUSE_SEED[0],
        organizationId: ORGANIZATION_ID,
        name: "Otro nombre",
      },
      CANONICAL_WAREHOUSE_SEED[0],
    );
    expect(errors).toContain("name expected Tehuacan-1, found Otro nombre");
  });
});
