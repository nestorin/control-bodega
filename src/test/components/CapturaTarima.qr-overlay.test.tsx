import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scannerHarness = vi.hoisted(() => ({
  onDecode: null as null | ((result: { getText: () => string } | undefined) => void),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    static listVideoInputDevices = vi
      .fn()
      .mockResolvedValue([{ deviceId: "camera-1", label: "rear" }]);
    reset = vi.fn();
    decodeFromVideoDevice = vi.fn(
      async (
        _deviceId: string,
        _video: HTMLVideoElement,
        onDecode: (result: { getText: () => string } | undefined) => void,
      ) => {
        scannerHarness.onDecode = onDecode;
        return { stop: vi.fn() };
      },
    );
  },
}));

vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => false }));
vi.mock("@/lib/firebase", () => ({ db: null, storage: null }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ accessStatus: "UNAUTHENTICATED", profile: null, canQuery: false }),
}));

import CapturaTarima from "@/screens/CapturaTarima";

const firstQr = "TQR-OC-2026-001-001";

describe("CapturaTarima QR overlay", () => {
  beforeEach(() => {
    scannerHarness.onDecode = null;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("clears the detected QR overlay when save advances to the next pallet", async () => {
    render(
      <CapturaTarima
        onBack={vi.fn()}
        onFinish={vi.fn()}
        almacenActivo={null}
        onAumentarInventario={vi.fn()}
        catalogos={{ productos: [] }}
        currentReception={{
          ocFolio: "OC-2026-001",
          tarimas: 2,
          proveedor: "Proveedor",
          proveedorLogistico: "Logística",
          plannedPallets: [1, 2].map((palletNumber) => ({
            palletNumber,
            lineIndex: 0,
            productId: "product-1",
            productName: "Producto",
            quantity: 10,
            unit: "cajas",
            qrIdentifier: `TQR-OC-2026-001-${String(palletNumber).padStart(3, "0")}`,
            status: "PLANNED" as const,
            lot: "LOT-1",
            expiryDate: "2027-12-31",
          })),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Activar cámara" }));
    await waitFor(() => expect(scannerHarness.onDecode).toBeTruthy());
    await act(async () => {
      scannerHarness.onDecode?.({ getText: () => firstQr });
    });
    expect(await screen.findByText("✓ QR Detectado")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Guardar y siguiente/ }));
    await waitFor(() => expect(screen.getByText("✓ QR Detectado")).toBeInTheDocument());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1550));
    });

    expect(screen.queryByText("✓ QR Detectado")).not.toBeInTheDocument();
    expect(screen.getByText(/ID: TQR-OC-2026-001-002/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar cámara" })).toBeInTheDocument();
  });
});
