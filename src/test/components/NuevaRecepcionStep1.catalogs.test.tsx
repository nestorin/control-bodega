import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NuevaRecepcionStep1 from "@/screens/NuevaRecepcionStep1";

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: null, canQuery: false }),
}));

vi.mock("@/hooks/useOcr", () => ({
  useOcr: () => ({
    runOcr: vi.fn(),
    loading: false,
    result: null,
    error: null,
    clear: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFirestore", () => ({
  useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
}));

describe("NuevaRecepcionStep1 catalog loading contract", () => {
  const catalogos = {
    proveedores: [
      {
        id: "sup-1",
        nombre: "Proveedor Norte",
        contacto: "",
        telefono: "",
        email: "",
        tipo: "mercancia" as const,
      },
      {
        id: "log-1",
        nombre: "Logística Veloz",
        contacto: "",
        telefono: "",
        email: "",
        tipo: "logistica" as const,
      },
    ],
    productos: [
      {
        id: "prod-1",
        nombre: "Producto canónico",
        sku: "P-001",
        categoria: "Bebidas",
        unidad: "cajas" as const,
        activo: true,
      },
    ],
  };

  it("transitions from catalog loading to loaded without changing hook order", () => {
    const { rerender } = render(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={catalogos}
        catalogosStatus={{ loading: true, error: null }}
      />,
    );

    expect(screen.getByText("Cargando catálogos…")).toBeInTheDocument();

    rerender(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={catalogos}
        catalogosStatus={{ loading: false, error: null }}
      />,
    );

    expect(screen.getByRole("option", { name: "Proveedor Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Logística Veloz" })).toBeInTheDocument();
  });

  it("renders supplier and logistics selectors when entered directly with loaded catalogs", () => {
    render(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={catalogos}
        catalogosStatus={{ loading: false }}
      />,
    );

    expect(screen.getByRole("option", { name: "Proveedor Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Logística Veloz" })).toBeInTheDocument();
  });

  it("keeps the order choice and continue callback wired", () => {
    const onContinue = vi.fn();

    render(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={onContinue}
        catalogos={catalogos}
        catalogosStatus={{ loading: false, error: null }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "No tengo OC" }));
    expect(screen.getByText(/Sin OC, la recepción se registrará sin folio/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        hasOC: false,
        proveedor: "Proveedor Norte",
      }),
    );
  });
});
