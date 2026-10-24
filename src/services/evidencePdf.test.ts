import { describe, expect, it } from "vitest";
import { buildEvidencePdfViewModel } from "./evidencePdf";

describe("buildEvidencePdfViewModel", () => {
  it("includes receipt identity, supplier, order, count, photos, and separate pallet lot/expiry", () => {
    const view = buildEvidencePdfViewModel({
      evidenceId: "EV-20260920-730",
      receptionId: "reception-20260920",
      date: "20/09/2026 · 22:07",
      item: "Agua mineral",
      supplier: "El Florido",
      logisticsProvider: "Logística Veloz",
      purchaseOrderNumber: "OC-AUTO",
      receivedPalletCount: 2,
      trailerPhoto: "https://example.test/trailer.jpg",
      productPhoto: "https://example.test/product.png",
      pallets: [
        { palletNumber: 1, lot: "LT-A", expiryDate: "2027-03-15" },
        { palletNumber: 2, lot: "LT-B", expiryDate: new Date("2027-04-15T00:00:00.000Z") },
      ],
    });

    expect(view).toMatchObject({
      evidenceId: "EV-20260920-730",
      receptionId: "reception-20260920",
      supplier: "El Florido",
      logisticsProvider: "Logística Veloz",
      purchaseOrderNumber: "OC-AUTO",
      receivedPalletCount: 2,
      trailerPhoto: "https://example.test/trailer.jpg",
      productPhoto: "https://example.test/product.png",
    });
    expect(view.palletRows).toHaveLength(2);
    expect(view.palletRows[0]).toEqual({ pallet: "1/2", lot: "LT-A", expiry: expect.any(String) });
    expect(view.palletRows[1]).toEqual({ pallet: "2/2", lot: "LT-B", expiry: expect.any(String) });
    expect(view.palletRows[0].lot).not.toBe(view.palletRows[1].lot);
  });

  it("uses explicit fallbacks when a reception has no pallet metadata", () => {
    const view = buildEvidencePdfViewModel({
      evidenceId: "EV-legacy",
      receptionId: "legacy",
      date: "",
      item: "Producto",
      supplier: "Proveedor",
      logisticsProvider: "Transporte",
      purchaseOrderNumber: "OC-1",
      receivedPalletCount: 1,
      lot: "LT-LEGACY",
      expiryDate: "2027-01-01",
      pallets: [{ palletNumber: 1 }],
    });
    expect(view.palletRows[0].lot).toBe("LT-LEGACY");
    expect(view.palletRows[0].expiry).not.toBe("Sin dato");
  });
});
