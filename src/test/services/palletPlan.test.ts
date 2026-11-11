/**
 * Tests for the shared pallet splitting rule (palletPlan service).
 *
 * The rule is duplicated by no other module on purpose: creation and editing
 * must derive the same pallet split, otherwise a multi-tarima line collapses
 * into a single pallet and the printed QR labels desync from the stored plan.
 */

import { describe, expect, it } from "vitest";
import {
  buildPalletPlan,
  findCajasPorTarima,
  palletCountForLine,
  type PalletPlanLine,
} from "@/services/palletPlan";

const conversiones = [
  { producto: "Producto Real", cajasPorTarima: 10 },
  { producto: "Producto Sin Conversion", cajasPorTarima: 0 },
  { producto: "Producto Ratio Invalido", cajasPorTarima: Number.NaN },
  { producto: "Producto Ratio Infinito", cajasPorTarima: Number.POSITIVE_INFINITY },
];

function makeLine(overrides: Partial<PalletPlanLine> = {}): PalletPlanLine {
  return {
    lineIndex: 0,
    productId: "product-1",
    productName: "Producto Real",
    quantity: 25,
    unit: "cajas",
    ...overrides,
  };
}

describe("buildPalletPlan", () => {
  it("splits a line with a known ratio into chunks of that size", () => {
    const plan = buildPalletPlan([makeLine({ lineIndex: 2, quantity: 25, cajasPorTarima: 10 })]);

    expect(plan).toHaveLength(3);
    expect(plan.map((entry) => entry.quantity)).toEqual([10, 10, 5]);
    expect(plan.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(25);
    expect(plan.map((entry) => entry.palletNumber)).toEqual([1, 2, 3]);
    expect(plan.map((entry) => entry.lineIndex)).toEqual([2, 2, 2]);
  });

  it("preserves the existing pallet count when the ratio is unknown", () => {
    const plan = buildPalletPlan([
      makeLine({ quantity: 15, cajasPorTarima: undefined, pallets: 2 }),
    ]);

    expect(plan).toHaveLength(2);
    expect(plan.map((entry) => entry.quantity)).toEqual([8, 7]);
    expect(plan.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(15);
    expect(plan.map((entry) => entry.palletNumber)).toEqual([1, 2]);
  });

  it("keeps pallet numbers sequential across lines and preserves each line index", () => {
    const plan = buildPalletPlan([
      makeLine({ lineIndex: 0, quantity: 25, cajasPorTarima: 10 }),
      makeLine({
        lineIndex: 1,
        productId: "product-2",
        productName: "Producto Sin Conversion",
        quantity: 15,
        cajasPorTarima: undefined,
        pallets: 2,
      }),
    ]);

    expect(plan.map((entry) => entry.palletNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.map((entry) => entry.lineIndex)).toEqual([0, 0, 0, 1, 1]);
    expect(plan.map((entry) => entry.quantity)).toEqual([10, 10, 5, 8, 7]);
    expect(plan.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(40);
  });

  it("falls back to a single pallet with quantity 0", () => {
    const plan = buildPalletPlan([makeLine({ quantity: 0, cajasPorTarima: 10 })]);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ palletNumber: 1, lineIndex: 0, quantity: 0 });
  });

  it("falls back to a single pallet with quantity 0 when neither ratio nor count is known", () => {
    const plan = buildPalletPlan([
      makeLine({ quantity: 0, cajasPorTarima: undefined, pallets: undefined }),
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ palletNumber: 1, lineIndex: 0, quantity: 0 });
  });

  it("never emits negative or non-finite quantities for invalid input", () => {
    const negativePlan = buildPalletPlan([makeLine({ quantity: -5, cajasPorTarima: 10 })]);
    const notFinitePlan = buildPalletPlan([
      makeLine({ quantity: Number.POSITIVE_INFINITY, cajasPorTarima: 10 }),
    ]);

    expect(negativePlan).toHaveLength(1);
    expect(negativePlan[0].quantity).toBe(0);
    expect(notFinitePlan).toHaveLength(1);
    expect(notFinitePlan[0].quantity).toBe(0);
  });
});

describe("palletCountForLine", () => {
  it("uses the ratio to count the pallets of a line", () => {
    expect(palletCountForLine(25, 10, undefined)).toBe(3);
  });

  it("preserves the fallback pallet count when the ratio is unknown", () => {
    expect(palletCountForLine(15, undefined, 2)).toBe(2);
  });

  it("never returns less than one pallet", () => {
    expect(palletCountForLine(0, 10, undefined)).toBe(1);
    expect(palletCountForLine(15, undefined, undefined)).toBe(1);
  });
});

describe("findCajasPorTarima", () => {
  it("returns the catalog ratio for a known product", () => {
    expect(findCajasPorTarima("Producto Real", conversiones)).toBe(10);
  });

  it("returns undefined when the product has no conversion entry", () => {
    expect(findCajasPorTarima("Producto Desconocido", conversiones)).toBeUndefined();
  });

  it("returns undefined when the conversion ratio is not a positive finite number", () => {
    expect(findCajasPorTarima("Producto Sin Conversion", conversiones)).toBeUndefined();
    expect(findCajasPorTarima("Producto Ratio Invalido", conversiones)).toBeUndefined();
    expect(findCajasPorTarima("Producto Ratio Infinito", conversiones)).toBeUndefined();
  });

  it("matches product names ignoring case and surrounding whitespace", () => {
    expect(findCajasPorTarima("  producto real  ", conversiones)).toBe(10);
    expect(findCajasPorTarima("PRODUCTO REAL", conversiones)).toBe(10);
  });
});
