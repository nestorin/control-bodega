import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateEvidencePdf, downloadBlob } = vi.hoisted(() => ({
  generateEvidencePdf: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => false }));
vi.mock("@/lib/firebase", () => ({ db: null }));
vi.mock("@/hooks/useAuthorization", () => ({ useAuthorization: () => ({ canQuery: false }) }));
vi.mock("@/services/firestore", () => ({ createFirestoreServices: vi.fn() }));
vi.mock("@/services/evidencePdf", () => ({ generateEvidencePdf }));
vi.mock("@/services/pdfGenerator", () => ({ downloadBlob }));

import Evidencias from "./Evidencias";

describe("Evidencias downloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateEvidencePdf.mockResolvedValue(new Blob(["pdf"]));
  });

  it("exposes the evidence PDF action and downloads a generated report", async () => {
    render(<Evidencias />);
    fireEvent.click(screen.getAllByTitle("Opciones")[0]);
    fireEvent.click(screen.getByText("Descargar evidencia PDF"));

    await waitFor(() => expect(generateEvidencePdf).toHaveBeenCalledTimes(1));
    const report = generateEvidencePdf.mock.calls[0][0];
    expect(report).toMatchObject({
      evidenceId: "EV-24891",
      supplier: "Distribuidora del Norte",
      logisticsProvider: "Logística Veloz",
      purchaseOrderNumber: "OC-24891",
      receivedPalletCount: 20,
    });
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Evidencia-EV-24891.pdf");
  });
});
