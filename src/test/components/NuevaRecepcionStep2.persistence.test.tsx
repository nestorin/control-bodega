import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NuevaRecepcionStep2 from "@/screens/NuevaRecepcionStep2";

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: null, canQuery: false }),
}));

describe("NuevaRecepcionStep2 persistence contract", () => {
  it("keeps a valid selected product and advances without rejecting it", () => {
    const onContinue = vi.fn();
    const onBack = vi.fn();
    render(
      <NuevaRecepcionStep2
        onBack={onBack}
        onContinue={onContinue}
        catalogos={{
          proveedores: [],
          productos: [
            {
              id: "firestore-product-1",
              nombre: "Producto canónico",
              sku: "P-001",
              categoria: "Bebidas",
              unidad: "cajas",
              activo: true,
            },
          ],
        }}
        catalogosStatus={{ loading: false }}
        initialData={{
          hasOC: true,
          ocFolio: "OC-1",
          tarimas: "1",
          proveedor: "Proveedor Norte",
          proveedorLogistico: "Logística Veloz",
          productos: [
            {
              productId: "firestore-product-1",
              codigo: "P-001",
              nombre: "Producto canónico",
              unidad: "cajas",
              cantidad: 4,
              importe: 0,
              estadoMatch: "sugerido",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Producto canónico/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Crear recepción" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
