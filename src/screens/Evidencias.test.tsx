import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ReceptionProvider, UIProvider } from "@/context";

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
// Use the real router implementation so navigation and location probes work.
vi.mock("react-router-dom", async () => await vi.importActual("react-router-dom"));

import Evidencias from "./Evidencias";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-pathname">{location.pathname}</span>;
}

// The screen reads reception flow state (ReceptionProvider + UIProvider) and
// navigates through react-router, so the test mounts the same stack.
function renderEvidencias() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ReceptionProvider>
        <UIProvider>
          <LocationProbe />
          <Evidencias />
        </UIProvider>
      </ReceptionProvider>
    </MemoryRouter>,
  );
}

describe("Evidencias downloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateEvidencePdf.mockResolvedValue(new Blob(["pdf"]));
  });

  it("exposes the evidence PDF action and downloads a generated report", async () => {
    renderEvidencias();
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

  it("opens the evidence detail when an evidence row is clicked without throwing", async () => {
    renderEvidencias();

    // Regression: the row handler used to call useReceptionFlow() inside the
    // click callback, which threw an invalid hook call at runtime.
    expect(() => fireEvent.click(screen.getByText("EV-24891"))).not.toThrow();

    await waitFor(() =>
      expect(screen.getByTestId("location-pathname")).toHaveTextContent("/evidencia-detalle"),
    );
  });
});
