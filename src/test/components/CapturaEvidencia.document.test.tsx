import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadBytes: vi.fn(),
  deleteObject: vi.fn(),
  saveEvidence: vi.fn(),
}));

vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/firebase", () => ({ db: {}, storage: {} }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ canQuery: true, user: { uid: "user-1" } }),
}));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({ receptions: { saveEvidence: mocks.saveEvidence } }),
}));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  uploadBytes: mocks.uploadBytes,
  deleteObject: mocks.deleteObject,
}));

import { renderWithAppProviders } from "../utils/renderWithAppProviders";
import CapturaEvidencia from "@/screens/CapturaEvidencia";

describe("CapturaEvidencia document upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadBytes.mockResolvedValue({});
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.saveEvidence.mockResolvedValue(undefined);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview") });
  });

  it("persists the separate PDF path with the existing photos", async () => {
    renderWithAppProviders(
      <CapturaEvidencia
        onBack={vi.fn()}
        onContinue={vi.fn()}
        receptionId="reception-1"
        currentReception={{ warehouseId: "warehouse-1" }}
      />,
    );

    const files = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(files[0], {
      target: { files: [new File(["trailer"], "trailer.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.change(files[1], {
      target: { files: [new File(["product"], "product.jpg", { type: "image/jpeg" })] },
    });
    // 3rd photo slot is now the supplier invoice (camera)
    fireEvent.change(files[2], {
      target: { files: [new File(["invoice"], "invoice.jpg", { type: "image/jpeg" })] },
    });
    // Purchase order (optional) - 4th file input
    fireEvent.change(screen.getByLabelText("Orden de compra (opcional)"), {
      target: { files: [new File(["pdf"], "order.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar evidencia" }));

    await waitFor(() => expect(mocks.saveEvidence).toHaveBeenCalledOnce());
    expect(mocks.saveEvidence.mock.calls[0][1]).toEqual({
      trailer:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/trailer.jpg",
      product:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/product.jpg",
      purchaseOrder:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/purchase-order.pdf",
      supplierInvoice:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/supplier-invoice.jpg",
    });
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(4);
  });

  it("rejects unsupported documents before upload", async () => {
    renderWithAppProviders(
      <CapturaEvidencia
        onBack={vi.fn()}
        onContinue={vi.fn()}
        receptionId="reception-1"
        currentReception={{ warehouseId: "warehouse-1" }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Orden de compra (opcional)"), {
      target: { files: [new File(["text"], "order.txt", { type: "text/plain" })] },
    });
    expect(screen.getByText(/El documento debe ser PDF/)).toBeInTheDocument();
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });
});
