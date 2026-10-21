import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import EditarRecepcion from "@/screens/EditarRecepcion"

describe("EditarRecepcion read-only mode", () => {
  it("preserves reception data and keeps Editar recepción disabled", () => {
    render(
      <EditarRecepcion
        recId="OC-24891"
        readOnly
        initialData={{
          tarimas: 12,
          proveedor: "Distribuidora del Norte",
          proveedorLogistico: "Logística Veloz",
        }}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByDisplayValue("12")).toHaveAttribute("readonly")
    expect(screen.getByDisplayValue("Distribuidora del Norte")).toHaveAttribute(
      "readonly",
    )
    expect(screen.getByDisplayValue("Logística Veloz")).toHaveAttribute(
      "readonly",
    )
    expect(screen.getByRole("button", { name: "Editar recepción" })).toBeDisabled()
  })
})
