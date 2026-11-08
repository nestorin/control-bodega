import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CapturaEvidencia from "@/screens/CapturaEvidencia";

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: vi.fn(() => ({
    user: null,
    profile: null,
    canQuery: true,
  })),
}));

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: vi.fn(() => false),
}));

describe("CapturaEvidencia inherited data", () => {
  it("prefills provider, product, lot and expiry and carries them forward", async () => {
    const onContinue = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test") });
    const user = userEvent.setup();
    render(
      <CapturaEvidencia
        onBack={vi.fn()}
        onContinue={onContinue}
        currentReception={{
          proveedor: "Proveedor Norte",
          productos: [{ nombre: "Producto Demo" }],
          tarimas: 3,
          lote: "LOT-001",
          caducidad: "2027-01-15",
        }}
      />,
    );

    expect(screen.getByDisplayValue("Proveedor Norte")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Producto Demo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("LOT-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2027-01-15")).toBeInTheDocument();

    const files = Array.from(document.querySelectorAll('input[type="file"]'));
    fireEvent.change(files[0], {
      target: {
        files: [new File(["x"], "trailer.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.change(files[1], {
      target: {
        files: [new File(["x"], "product.jpg", { type: "image/jpeg" })],
      },
    });

    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        form: expect.objectContaining({
          proveedor: "Proveedor Norte",
          item: "Producto Demo",
          lote: "LOT-001",
          caducidad: "2027-01-15",
        }),
      }),
    );
  });
});
