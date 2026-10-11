import { describe, expect, it } from "vitest"
import snapshot from "../../data/catalog/tehuacan-1-inventory-2026-10-04.json"

describe("Tehuacan-1 inventory snapshot", () => {
  it("preserves the extracted catalog and inventory totals", () => {
    expect(snapshot.warehouse).toEqual({
      id: "wh_tehuacan_1",
      name: "Tehuacan-1",
    })
    expect(snapshot.snapshotDate).toBe("2026-10-04")
    expect(snapshot.products).toHaveLength(11)
    expect(snapshot.inventorySnapshot).toHaveLength(11)
    expect(
      snapshot.inventorySnapshot.reduce(
        (total, row) => total + row.quantity,
        0,
      ),
    ).toBe(33643)
    expect(snapshot.totalExistence).toBe(33643)
  })

  it("records evidenced piece conversions without inventing palletization", () => {
    const detergent = snapshot.products.find(
      (product) => product.sku === "NDE0101",
    )
    expect(detergent?.unit).toBe("Pieza")
    expect(
      snapshot.products.filter((product) => product.unit === "Pieza"),
    ).toHaveLength(1)
    expect(snapshot.conversions).toHaveLength(11)
    expect(
      snapshot.conversions.map((conversion) => conversion.piezasPorCaja),
    ).toEqual([24, 6, 24, 48, 48, 24, 12, 1, 2, 4, 2])
    expect(
      snapshot.conversions.map((conversion) => conversion.cajasPorTarima),
    ).toEqual([90, 39, 60, 48, 48, 128, 60, 80, 64, 60, 40])
  })
})
