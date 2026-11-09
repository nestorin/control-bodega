import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";

const mocks = vi.hoisted(() => ({ getBlob: vi.fn(), downloadBlob: vi.fn() }));

vi.mock("@/lib/firebase", () => ({ storage: {} }));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  getBlob: mocks.getBlob,
}));
vi.mock("@/services/pdfGenerator", () => ({ downloadBlob: mocks.downloadBlob }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: { uid: "user-1" }, canQuery: true }),
  isPermissionDenied: () => false,
}));
vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => true }));

import { renderWithAppProviders } from "../../test/utils/renderWithAppProviders";
import EvidenciaDetalle from "../../screens/EvidenciaDetalle";
import { mapReceptionEvidence } from "../../screens/Evidencias";

describe("evidence document display", () => {
  it("maps and downloads the protected purchase-order document separately from photos", async () => {
    const documentPath =
      "organizations/org_exepa_001/warehouses/warehouse-1/receptions/reception-1/evidence/documentation.pdf";
    const evidence = mapReceptionEvidence({
      id: "reception-1",
      evidencePhotos: {
        trailer: "photo-trailer",
        product: "photo-product",
        documentation: documentPath,
      },
    });
    expect(evidence.documento).toBe(documentPath);
    mocks.getBlob.mockResolvedValueOnce(new Blob(["pdf"], { type: "application/pdf" }));

    renderWithAppProviders(<EvidenciaDetalle />, {
      currentReception: {
        id: "reception-1",
        ocFolio: "OC-12345",
        tarimas: 5,
      } as any,
      initialReceptionState: {
        selectedEvidencia: {
          id: "evidence-1",
          fotoTrailer: "photo-trailer",
          fotoProducto: "photo-product",
          documento: documentPath,
          proveedor: "Proveedor Test",
          proveedorLogistico: "Logistica Test",
          item: "Item Test",
          tarimas: 5,
          caducidad: "2025-12-31",
          lote: "LOTE-1",
          ocFolio: "OC-12345",
          fecha: "2025-01-15",
          hora: "10:00",
          estado: "COMPLETADA",
          color: "#3276a8",
          bg: "#e8f2f7",
          img: "/assets/check.svg",
          receptionId: "reception-1",
          evidenceId: "evidence-1",
          purchaseOrderNumber: "OC-12345",
          pallets: [],
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Descargar documento" }));

    await waitFor(() => expect(mocks.getBlob).toHaveBeenCalledWith(documentPath));
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Documento-reception-1.pdf");
  });
});
