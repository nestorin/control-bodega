import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEvidencePdfViewModel,
  generateEvidencePdf,
  type EvidencePdfInput,
} from "./evidencePdf";

const pdfMock = vi.hoisted(() => {
  const state = { texts: [] as string[], images: [] as unknown[][], pages: 1, activePage: 1 };
  class MockJsPdf {
    internal = { pageSize: { getWidth: () => 210 } };
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    line() {}
    text(value: string) {
      state.texts.push(value);
    }
    addPage() {
      state.pages += 1;
    }
    getNumberOfPages() {
      return state.pages;
    }
    setPage(page: number) {
      state.activePage = page;
    }
    addImage(...args: unknown[]) {
      state.images.push(args);
    }
    output() {
      return new Blob(["%PDF mock"], { type: "application/pdf" });
    }
  }

  return { MockJsPdf, state };
});

vi.mock("jspdf", () => ({ jsPDF: pdfMock.MockJsPdf }));

const baseInput: EvidencePdfInput = {
  evidenceId: "EV-20260920-730",
  receptionId: "reception-20260920",
  date: "20/09/2026 · 22:07",
  item: "Agua mineral",
  supplier: "El Florido",
  logisticsProvider: "Logística Veloz",
  purchaseOrderNumber: "OC-AUTO",
  receivedPalletCount: 2,
  pallets: [
    { palletNumber: 1, lot: "LT-A", expiryDate: "2027-03-15" },
    { palletNumber: 2, lot: "LT-B", expiryDate: new Date("2027-04-15T00:00:00.000Z") },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  pdfMock.state.texts.length = 0;
  pdfMock.state.images.length = 0;
  pdfMock.state.pages = 1;
  pdfMock.state.activePage = 1;
});

describe("buildEvidencePdfViewModel", () => {
  it("includes receipt identity, supplier, order, count, photos, and separate pallet lot/expiry", () => {
    const view = buildEvidencePdfViewModel({
      ...baseInput,
      trailerPhoto: "https://example.test/trailer.jpg",
      productPhoto: "https://example.test/product.png",
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

  it("generates a one-page PDF and labels missing photos when no images are attached", async () => {
    const blob = await generateEvidencePdf({
      ...baseInput,
      trailerPhoto: null,
      productPhoto: null,
    });

    expect(blob.type).toBe("application/pdf");
    expect(pdfMock.state.pages).toBe(1);
    expect(pdfMock.state.texts).toContain("No hay fotografías asociadas a esta evidencia.");
    expect(pdfMock.state.texts).toContain("Mercancía en tráiler: fotografía no adjuntada.");
    expect(pdfMock.state.texts.some((text) => text.includes("EV-20260920-730"))).toBe(true);
  });

  it("fetches and embeds both evidence photos in the generated PDF", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          blob: async () => new window.Blob(["image-bytes"], { type: "image/png" }),
        }) as Response,
    );

    const blob = await generateEvidencePdf({
      ...baseInput,
      trailerPhoto: "https://example.test/trailer.png",
      productPhoto: "https://example.test/product.png",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(blob.type).toBe("application/pdf");
    expect(pdfMock.state.images).toHaveLength(2);
    expect(pdfMock.state.images.map((image) => image[1])).toEqual(["PNG", "PNG"]);
  });

  it("rejects when an attached photo cannot be downloaded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      generateEvidencePdf({ ...baseInput, trailerPhoto: "https://example.test/unavailable.jpg" }),
    ).rejects.toThrow("Evidence photo download failed (503)");
  });

  it("adds pages when the per-pallet lot and expiry table exceeds one page", async () => {
    const pallets = Array.from({ length: 60 }, (_, index) => ({
      palletNumber: index + 1,
      lot: `LOT-${index + 1}`,
      expiryDate: "2027-03-15",
    }));
    const blob = await generateEvidencePdf({
      ...baseInput,
      receivedPalletCount: pallets.length,
      pallets,
    });

    expect(blob.type).toBe("application/pdf");
    expect(pdfMock.state.pages).toBeGreaterThan(1);
    expect(pdfMock.state.activePage).toBe(pdfMock.state.pages);
  });
});
