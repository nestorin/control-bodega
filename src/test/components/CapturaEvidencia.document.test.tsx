import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    render(
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
    fireEvent.change(screen.getByLabelText("Orden de compra o factura (opcional)"), {
      target: { files: [new File(["pdf"], "order.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar evidencia" }));

    await waitFor(() => expect(mocks.saveEvidence).toHaveBeenCalledOnce());
    expect(mocks.saveEvidence.mock.calls[0][1]).toEqual({
      trailer:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/trailer.jpg",
      product:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/product.jpg",
      documentation:
        "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/documentation.pdf",
    });
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(3);
  });

  it("rejects unsupported documents before upload", async () => {
    render(
      <CapturaEvidencia
        onBack={vi.fn()}
        onContinue={vi.fn()}
        receptionId="reception-1"
        currentReception={{ warehouseId: "warehouse-1" }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Orden de compra o factura (opcional)"), {
      target: { files: [new File(["text"], "order.txt", { type: "text/plain" })] },
    });
    expect(screen.getByText(/El documento debe ser PDF/)).toBeInTheDocument();
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });
});
