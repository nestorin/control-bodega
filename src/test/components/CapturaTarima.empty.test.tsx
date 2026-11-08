import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => false,
}));

vi.mock("@/lib/firebase", () => ({
  db: null,
  storage: null,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    accessStatus: "UNAUTHENTICATED",
    profile: null,
    canQuery: false,
  }),
}));

import CapturaTarima from "@/screens/CapturaTarima";

describe("CapturaTarima empty state", () => {
  it("renders the safe empty state and keeps the back callback wired", () => {
    const onBack = vi.fn();

    render(
      <CapturaTarima
        onBack={onBack}
        onFinish={vi.fn()}
        almacenActivo={null}
        onAumentarInventario={vi.fn()}
        catalogos={{ productos: [] }}
        currentReception={null}
      />,
    );

    expect(screen.getByText("No hay recepción activa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver al inicio" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("returns from an active QR capture and keeps navigation under the parent callback", () => {
    const onBack = vi.fn();

    render(
      <CapturaTarima
        onBack={onBack}
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
              quantity: 2,
              unit: "cajas",
              qrIdentifier: "TQR-OC-2026-001-001",
              status: "PLANNED",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Regresar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
