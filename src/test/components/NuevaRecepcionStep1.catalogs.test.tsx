import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { ReceptionProvider } from "@/context/ReceptionContext";
import { CatalogosProvider } from "@/context/CatalogosContext";
import { InventoryProvider } from "@/context/InventoryContext";
import { UIProvider } from "@/context/UIContext";

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

import NuevaRecepcionStep1 from "@/screens/NuevaRecepcionStep1";

const renderWithProviders = (ui: React.ReactElement, initialReceptionState = {}) => {
  return render(
    <ReceptionProvider initialState={initialReceptionState}>
      <CatalogosProvider canQuery={true}>
        <InventoryProvider>
          <UIProvider>{ui}</UIProvider>
        </InventoryProvider>
      </CatalogosProvider>
    </ReceptionProvider>,
  );
};

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

describe("NuevaRecepcionStep1 catalog loading contract", () => {
  it("transitions from catalog loading to loaded without changing hook order", () => {
    // First render with loading=true
    const { unmount } = renderWithProviders(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={catalogos}
        catalogosStatus={{ loading: true, error: null }}
      />,
      {},
    );

    expect(screen.getByText("Cargando catálogos…")).toBeInTheDocument();
    unmount();

    // Second render with loading=false
    renderWithProviders(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={catalogos}
        catalogosStatus={{ loading: false, error: null }}
      />,
      {},
    );

    expect(screen.getByRole("option", { name: "Proveedor Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Logística Veloz" })).toBeInTheDocument();
  });

  it("renders supplier and logistics selectors when entered directly with loaded catalogs", () => {
    renderWithProviders(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={catalogos}
        catalogosStatus={{ loading: false, error: null }}
      />,
      {},
    );

    expect(screen.getByRole("option", { name: "Proveedor Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Logística Veloz" })).toBeInTheDocument();
  });

  it("keeps the order choice and continue callback wired", () => {
    const onContinue = vi.fn();

    const initialState = {
      currentReception: {
        proveedor: "Proveedor Norte",
        productos: [{ nombre: "Producto canónico" }],
        tarimas: 3,
        lote: "LOT-001",
        caducidad: "2027-01-15",
      },
      sessionState: "planning",
    };

    renderWithProviders(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={onContinue}
        catalogos={catalogos}
        catalogosStatus={{ loading: false, error: null }}
      />,
      initialState,
    );

    fireEvent.click(screen.getByRole("button", { name: "No tengo OC" }));
    expect(screen.getByText(/Sin OC, la recepción se registrará sin folio/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        hasOC: false,
        proveedor: "Proveedor Norte",
      }),
    );
  });
});
