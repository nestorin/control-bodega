import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import NuevaRecepcionStep1 from "@/screens/NuevaRecepcionStep1"

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: null, canQuery: false }),
}))

vi.mock("@/hooks/useOcr", () => ({
  useOcr: () => ({
    runOcr: vi.fn(),
    loading: false,
    result: null,
    error: null,
    clear: vi.fn(),
  }),
}))

vi.mock("@/hooks/useFirestore", () => ({
  useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
}))

describe("NuevaRecepcionStep1 catalog loading contract", () => {
  it("renders supplier and logistics selectors when entered directly with loaded catalogs", () => {
    render(
      <NuevaRecepcionStep1
        onBack={vi.fn()}
        onContinue={vi.fn()}
        catalogos={{
          proveedores: [
            {
              id: "sup-1",
              nombre: "Proveedor Norte",
              contacto: "",
              telefono: "",
              email: "",
              tipo: "mercancia",
            },
            {
              id: "log-1",
              nombre: "Logística Veloz",
              contacto: "",
              telefono: "",
              email: "",
              tipo: "logistica",
            },
          ],
          productos: [
            {
              id: "prod-1",
              nombre: "Producto canónico",
              sku: "P-001",
              categoria: "Bebidas",
              unidad: "cajas",
              activo: true,
            },
          ],
        }}
        catalogosStatus={{ loading: false }}
      />,
    )

    expect(
      screen.getByRole("option", { name: "Proveedor Norte" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Logística Veloz" }),
    ).toBeInTheDocument()
  })
})
