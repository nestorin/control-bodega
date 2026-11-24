import { afterEach, describe, expect, it, vi } from "vitest";
import { generateShipmentEvidencePdf, type ShipmentEvidencePdfInput } from "./shipmentEvidencePdf";

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
    splitTextToSize(text: string, maxWidth: number) {
      // Simple mock: split by double space (our delimiter)
      return text.split("  ").filter(Boolean);
    }
    output() {
      return new Blob(["%PDF mock"], { type: "application/pdf" });
    }
  }

  return { MockJsPdf, state };
});

vi.mock("jspdf", () => ({ jsPDF: pdfMock.MockJsPdf }));

const baseInput: ShipmentEvidencePdfInput = {
  evidenceId: "EV-EMB-001",
  shipmentId: "EMB-001",
  date: "20/09/2026 · 14:30",
  client: "Súper Ahorro S.A. de C.V.",
  folio: "FAC-2024-0891",
  carrier: "Roberto Méndez",
  warehouse: "Tehuacan-1",
  responsible: "Juan Pérez",
  loadedTrailerPhotos: ["https://example.test/loaded1.jpg"],
  trailerBoxPhoto: "https://example.test/trailer-box.jpg",
  internalSealPhoto: "https://example.test/internal-seal.jpg",
  externalSealPhoto: "https://example.test/external-seal.jpg",
  signedDocumentPhoto: "https://example.test/signed.jpg",
  invoicePhoto: "https://example.test/invoice.jpg",
  items: [
    { productName: "Coca Cola regular 235ml", quantity: 4, unit: "tarimas" },
    { productName: "Agua mineral 355ml c/24", quantity: 2, unit: "tarimas" },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  pdfMock.state.texts.length = 0;
  pdfMock.state.images.length = 0;
  pdfMock.state.pages = 1;
  pdfMock.state.activePage = 1;
});

describe("generateShipmentEvidencePdf", () => {
  it("generates a PDF with shipment info, products table, and evidence photos", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          blob: async () => new window.Blob(["image-bytes"], { type: "image/jpeg" }),
        }) as Response,
    );

    const blob = await generateShipmentEvidencePdf(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(6); // 6 photos
    expect(blob.type).toBe("application/pdf");
    expect(pdfMock.state.images).toHaveLength(6);
    expect(pdfMock.state.texts.some((t) => t.includes("EVIDENCIA DE EMBARQUE"))).toBe(true);
    expect(pdfMock.state.texts.some((t) => t.includes("Súper Ahorro"))).toBe(true);
    expect(pdfMock.state.texts.some((t) => t.includes("Roberto Méndez"))).toBe(true);
    expect(pdfMock.state.texts.some((t) => t.includes("Coca Cola"))).toBe(true);
    expect(pdfMock.state.texts.some((t) => t.includes("FOTOS DE EVIDENCIA"))).toBe(true);
  });

  it("labels missing photos when not all images are attached", async () => {
    const incompleteInput = {
      ...baseInput,
      loadedTrailerPhotos: [],
      trailerBoxPhoto: null,
      internalSealPhoto: null,
      externalSealPhoto: null,
      signedDocumentPhoto: null,
      invoicePhoto: null,
    };

    const blob = await generateShipmentEvidencePdf(incompleteInput);

    expect(blob.type).toBe("application/pdf");
    expect(pdfMock.state.texts).toContain("No hay fotografías asociadas a esta evidencia.");
    expect(
      pdfMock.state.texts.some((t) => t.includes("Embarque cargado: fotografía no adjuntada.")),
    ).toBe(true);
    expect(
      pdfMock.state.texts.some((t) =>
        t.includes("Número de caja del tráiler: fotografía no adjuntada."),
      ),
    ).toBe(true);
    expect(pdfMock.state.texts.some((t) => t.includes("Factura: fotografía no adjuntada."))).toBe(
      true,
    );
  });

  it("rejects when an attached photo cannot be downloaded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      generateShipmentEvidencePdf({
        ...baseInput,
        loadedTrailerPhotos: ["https://example.test/bad.jpg"],
      }),
    ).rejects.toThrow("Evidence photo download failed (503)");
  });
});
