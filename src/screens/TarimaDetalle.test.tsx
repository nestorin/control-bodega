import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateReceptionQrPngs, getByQR, getProduct, getReception, getSupplier } = vi.hoisted(
  () => ({
    generateReceptionQrPngs: vi.fn(),
    getByQR: vi.fn(),
    getProduct: vi.fn(),
    getReception: vi.fn(),
    getSupplier: vi.fn(),
  }),
);

vi.mock("@/services/receptionQr", () => ({ generateReceptionQrPngs }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    pallets: { getByQR },
    products: { getById: getProduct },
    receptions: { getById: getReception },
    suppliers: { getById: getSupplier },
  }),
}));

import TarimaDetalle from "@/screens/TarimaDetalle";

const QR_IDENTIFIER = "TQR-REC-2026-1035-003";
const QR_PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("TarimaDetalle QR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getByQR.mockResolvedValue({
      qrIdentifier: QR_IDENTIFIER,
      productId: "product-1",
      receptionId: "reception-1",
      createdAt: { toDate: () => new Date("2026-10-30T00:00:00Z") },
      expiryDate: { toDate: () => new Date("2027-10-30T00:00:00Z") },
      quantity: 10,
      unit: "cajas",
      status: "ACTIVE",
    });
    getProduct.mockResolvedValue({ name: "Agua mineral 600 ml", sku: "AGUA-600" });
    getReception.mockResolvedValue({ id: "reception-1", purchaseOrderId: "OC-24891" });
    getSupplier.mockResolvedValue({ name: "Proveedor", code: "P-01" });
    generateReceptionQrPngs.mockResolvedValue([QR_PNG]);
  });

  it("renders and prints a real QR image generated from the exact pallet identifier", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<TarimaDetalle onBack={vi.fn()} qrCode={QR_IDENTIFIER} />);

    const qrImage = await screen.findByAltText(`Código QR ${QR_IDENTIFIER}`);
    expect(generateReceptionQrPngs).toHaveBeenCalledWith([QR_IDENTIFIER]);
    expect(qrImage.getAttribute("src")).toBe(QR_PNG);

    fireEvent.click(screen.getByRole("button", { name: "Imprimir código QR" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
