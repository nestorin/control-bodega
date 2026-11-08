import { describe, expect, it } from "vitest";
import {
  buildBackfillPlan,
  expiryMonthKey,
  lotProjectionId,
} from "../../../scripts/backfill-expiry-lots";

const organizationId = "org_exepa_001";
const productNames = new Map([["product-1", "Agua mineral"]]);

function pallet(id: string, quantity: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `organizations/${organizationId}/receptions/reception-1/pallets/${id}`,
    data: {
      organizationId,
      warehouseId: "wh_tehuacan_1",
      productId: "product-1",
      status: "RECEIVED",
      quantity,
      unit: "cajas",
      lot: "LOT-001",
      expiryDate: "2027-03-15",
      ...overrides,
    },
  };
}

function receipt(
  id: string,
  palletId: string,
  quantity: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    data: {
      organizationId,
      movementType: "RECEIPT",
      palletId,
      warehouseId: "wh_tehuacan_1",
      productId: "product-1",
      quantity,
      unit: "cajas",
      lot: "LOT-001",
      expiryDate: "2027-03-15",
      ...overrides,
    },
  };
}

describe("expiry lot backfill planning", () => {
  it("uses the same deterministic id and month key as the reception callable", () => {
    expect(lotProjectionId("wh_tehuacan_1", "product-1", "LOT-001", "2027-03-15")).toBe(
      "lot-973bdd82c1c670f3bd5e038c86d51c2c",
    );
    expect(expiryMonthKey("2027-03-15")).toBe("Mar-27");
  });

  it("aggregates reconciled receipt pallets once by warehouse/product/lot/expiry", () => {
    const plan = buildBackfillPlan({
      organizationId,
      pallets: [pallet("pallet-1", 24), pallet("pallet-2", 6)],
      receiptMovements: [
        receipt("movement-1", "pallet-1", 24),
        receipt("movement-2", "pallet-2", 6),
      ],
      productNames,
      existingLotIdentities: new Set(),
    });

    expect(plan.issues).toEqual([]);
    expect(plan.projections).toHaveLength(1);
    expect(plan.projections[0]).toMatchObject({ cajas: 30, monthKey: "Mar-27" });
    expect(plan.projections[0].palletIds).toEqual(["pallet-1", "pallet-2"]);
  });

  it("blocks the complete group rather than writing a partial lot when one receipt is missing", () => {
    const plan = buildBackfillPlan({
      organizationId,
      pallets: [pallet("pallet-1", 24), pallet("pallet-2", 6)],
      receiptMovements: [receipt("movement-1", "pallet-1", 24)],
      productNames,
      existingLotIdentities: new Set(),
    });

    expect(plan.projections).toEqual([]);
    expect(plan.issues.map((issue) => issue.reason)).toContain("missing_receipt_movement");
    expect(plan.issues.map((issue) => issue.reason)).toContain(
      "projection_blocked_by_incomplete_source_group",
    );
  });

  it("does not propose a projection where any semantic expiry lot already exists", () => {
    const plan = buildBackfillPlan({
      organizationId,
      pallets: [pallet("pallet-1", 24)],
      receiptMovements: [receipt("movement-1", "pallet-1", 24)],
      productNames,
      existingLotIdentities: new Set([
        ["wh_tehuacan_1", "product-1", "LOT-001", "2027-03-15"].join("\0"),
      ]),
    });

    expect(plan.projections).toEqual([]);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "semantic_expiry_lot_already_exists" }),
      ]),
    );
  });
});
