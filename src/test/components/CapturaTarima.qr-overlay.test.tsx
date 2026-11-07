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

  it("validates a manually entered planned pallet ID and rejects it after activation", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
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

    const manualId = screen.getByLabelText("Ingresar ID de tarima manualmente");
    fireEvent.change(manualId, { target: { value: firstQr } });
    fireEvent.click(screen.getByRole("button", { name: "Validar ID" }));
    expect(await screen.findByText("✓ QR Detectado")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Guardar y siguiente/ }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1550));
    });

    fireEvent.change(screen.getByLabelText("Ingresar ID de tarima manualmente"), {
      target: { value: firstQr },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validar ID" }));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(expect.stringContaining("ya está activo")),
    );
    expect(screen.queryByText("✓ QR Detectado")).not.toBeInTheDocument();
    alert.mockRestore();
  });

  it("rejects a manually entered ID that is not part of the reception plan", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    render(
      <CapturaTarima
        onBack={vi.fn()}
        onFinish={vi.fn()}
        almacenActivo={null}
        onAumentarInventario={vi.fn()}
        catalogos={{ productos: [] }}
        currentReception={{
          ocFolio: "OC-2026-001",
          tarimas: 1,
          proveedor: "Proveedor",
          proveedorLogistico: "Logística",
          plannedPallets: [
            {
              palletNumber: 1,
              lineIndex: 0,
              productId: "product-1",
              productName: "Producto",
              quantity: 10,
              unit: "cajas",
              qrIdentifier: firstQr,
              status: "PLANNED" as const,
            },
          ],
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ingresar ID de tarima manualmente"), {
      target: { value: "TQR-OC-2026-001-999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validar ID" }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining("no existe")));
    expect(screen.queryByText("✓ QR Detectado")).not.toBeInTheDocument();
    alert.mockRestore();
  });

  it("finishes the last pallet without leaving the save spinner active", async () => {
    const onFinish = vi.fn();
    render(
      <CapturaTarima
        onBack={vi.fn()}
        onFinish={onFinish}
        almacenActivo={null}
        onAumentarInventario={vi.fn()}
        catalogos={{ productos: [] }}
        currentReception={{
          ocFolio: "OC-2026-001",
          tarimas: 1,
          proveedor: "Proveedor",
          proveedorLogistico: "Logística",
          plannedPallets: [
            {
              palletNumber: 1,
              lineIndex: 0,
              productId: "product-1",
              productName: "Producto",
              quantity: 10,
              unit: "cajas",
              qrIdentifier: firstQr,
              status: "PLANNED" as const,
              lot: "LOT-1",
              expiryDate: "2027-12-31",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Guardar y siguiente/ }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Guardando...")).not.toBeInTheDocument();
  });
});
