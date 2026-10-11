import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TarimaDetalle from "@/screens/TarimaDetalle"

// Mock the firestore services
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: vi.fn(() => ({
    pallets: { getByQR: vi.fn() },
    products: { getById: vi.fn() },
    suppliers: { getById: vi.fn() },
  })),
  useFirestoreServices: vi.fn(() => ({
    pallets: { getByQR: vi.fn() },
    products: { getById: vi.fn() },
    suppliers: { getById: vi.fn() },
  })),
}))

import { useFirestoreServices } from "@/services/firestore"

describe("TarimaDetalle QR Component", () => {
  const mockOnBack = vi.fn()
  let mockGetByQR = vi.fn()
  let mockGetProductById = vi.fn()
  let mockGetSupplierById = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetByQR = vi.fn()
    mockGetProductById = vi.fn()
    mockGetSupplierById = vi.fn()
    ;(useFirestoreServices as any).mockReturnValue({
      pallets: { getByQR: mockGetByQR },
      products: { getById: mockGetProductById },
      suppliers: { getById: mockGetSupplierById },
    })
  })

  it("shows loading state when fetching", async () => {
    mockGetByQR.mockImplementation(() => new Promise(() => {}))

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-24891-003" />)

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument()
    })
  })

  it("renders detail when QR found with product and supplier join", async () => {
    mockGetByQR.mockResolvedValue({
      qrIdentifier: "TQR-24891-003",
      productId: "prod_1",
      lot: "LOTE-2024-001",
      quantity: 40,
      unit: "cajas",
      expiryDate: { toDate: () => new Date("2027-03-15") },
      status: "RECEIVED",
      createdAt: { toDate: () => new Date("2026-09-19") },
      receptionId: "rec_1",
    })

    mockGetProductById.mockResolvedValue({
      name: "Manzana Gala",
      sku: "MANZ-GALA-1KG",
    })

    mockGetSupplierById.mockResolvedValue({
      name: "Distribuidora del Norte",
      code: "PROV-001",
    })

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-24891-003" />)

    await waitFor(() => {
      expect(screen.getByText("Manzana Gala")).toBeInTheDocument()
      expect(screen.getByText("LOTE-2024-001")).toBeInTheDocument()
      expect(screen.getByText("Distribuidora del Norte")).toBeInTheDocument()
    })
  })

  it("shows not-found state when QR returns null", async () => {
    mockGetByQR.mockResolvedValue(null)

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-NOTFOUND-999" />)

    await waitFor(() => {
      expect(screen.getByText("Tarima no encontrada")).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /volver al escáner/i }),
      ).toBeInTheDocument()
    })
  })

  it("shows error state and retry button on failure", async () => {
    mockGetByQR.mockRejectedValue(new Error("Network error"))

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-24891-003" />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /reintentar/i }),
      ).toBeInTheDocument()
    })

    // Click retry
    mockGetByQR.mockResolvedValueOnce({
      qrIdentifier: "TQR-24891-003",
      productId: "prod_1",
      lot: "LOTE-2024-001",
      quantity: 40,
      unit: "cajas",
      expiryDate: { toDate: () => new Date("2027-03-15") },
      status: "RECEIVED",
      createdAt: { toDate: () => new Date("2026-09-19") },
      receptionId: "rec_1",
    })
    mockGetProductById.mockResolvedValue({
      name: "Manzana Gala",
      sku: "MANZ-GALA-1KG",
    })
    mockGetSupplierById.mockResolvedValue({
      name: "Distribuidora del Norte",
      code: "PROV-001",
    })

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }))

    await waitFor(() => {
      expect(screen.getByText("Manzana Gala")).toBeInTheDocument()
    })
  })

  it("uses legacy mode when no qrCode prop", () => {
    render(
      <TarimaDetalle
        onBack={mockOnBack}
        currentReception={{ ocFolio: "OC-24891", tarimas: 20 }}
      />,
    )

    expect(screen.getByText("TQR-24891-003")).toBeInTheDocument()
  })
})
