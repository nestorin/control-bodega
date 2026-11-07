import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getBlob: vi.fn(), downloadBlob: vi.fn() }));

vi.mock("@/lib/firebase", () => ({ storage: {} }));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  getBlob: mocks.getBlob,
}));
vi.mock("@/services/pdfGenerator", () => ({ downloadBlob: mocks.downloadBlob }));

import EvidenciaDetalle from "@/screens/EvidenciaDetalle";
import { mapReceptionEvidence } from "@/screens/Evidencias";

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

    render(<EvidenciaDetalle evidencia={evidence} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar documento" }));

    await waitFor(() => expect(mocks.getBlob).toHaveBeenCalledWith(documentPath));
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Documento-reception-1.pdf");
  });
});
