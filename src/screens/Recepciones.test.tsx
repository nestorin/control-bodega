import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => false,
}))

vi.mock("@/hooks/useFirestore", () => ({
  useCollection: () => ({
    data: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  useOfflineQueue: () => ({ enqueue: vi.fn(), isOnline: true }),
}))

vi.mock("@/lib/firebase", () => ({ db: null }))

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    canQuery: false,
    canAccessWarehouse: () => false,
  }),
  isPermissionDenied: () => false,
}))

import Recepciones from "./Recepciones"

describe("Recepciones presentation", () => {
  it("renders local reception cards and keeps selection wired", () => {
    const onSelectTarima = vi.fn()
    const onEdit = vi.fn()

    render(<Recepciones onSelectTarima={onSelectTarima} onEdit={onEdit} />)

    expect(screen.getByText("OC-24891")).toBeInTheDocument()
    expect(screen.getAllByText("Completada").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Con incidencia").length).toBeGreaterThan(0)

    fireEvent.click(
      screen.getByRole("button", { name: "Abrir recepción OC-24891" }),
    )
    expect(onSelectTarima).toHaveBeenCalledWith("OC-24891")

    fireEvent.click(screen.getAllByTitle("Opciones")[0])
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    expect(onEdit).toHaveBeenCalledWith("OC-24891")
  })

  it("supports keyboard activation of a reception card", () => {
    const onSelectTarima = vi.fn()

    render(<Recepciones onSelectTarima={onSelectTarima} onEdit={vi.fn()} />)

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Abrir recepción OC-24850" }),
      { key: "Enter" },
    )

    expect(onSelectTarima).toHaveBeenCalledWith("OC-24850")
  })
})
