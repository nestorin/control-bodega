import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TarimaDetalle from "@/screens/TarimaDetalle"

// Mock the firestore services
const mockPallets = { getByQR: vi.fn() }
const mockProducts = { getById: vi.fn() }
const mockSuppliers = { getById: vi.fn() }
const mockReceptions = { getById: vi.fn() }

vi.mock("@/services/firestore", () => ({
  createFirestoreServices: vi.fn(() => ({
    pallets: mockPallets,
    products: mockProducts,
    suppliers: mockSuppliers,
    receptions: mockReceptions,
  })),
  useFirestoreServices: vi.fn(() => ({
    pallets: mockPallets,
    products: mockProducts,
    suppliers: mockSuppliers,
    receptions: mockReceptions,
  })),
}))

describe("TarimaDetalle QR Component", () => {
  const mockOnBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockPallets.getByQR.mockReset()
    mockProducts.getById.mockReset()
    mockSuppliers.getById.mockReset()
    mockReceptions.getById.mockReset()
  })

  it("shows loading state when fetching", async () => {
    mockPallets.getByQR.mockImplementation(() => new Promise(() => {}))

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-24891-003" />)

    await waitFor(() => {
      expect(screen.getByText("Cargando tarima…")).toBeInTheDocument()
    })
  })

  it("renders detail when QR found with product and supplier join", async () => {
    mockPallets.getByQR.mockResolvedValue({
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

    mockProducts.getById.mockResolvedValue({
      name: "Manzana Gala",
      sku: "MANZ-GALA-1KG",
    })

    mockReceptions.getById.mockResolvedValue({
      supplierId: "sup_1",
      purchaseOrderId: "PO-123",
    })

    mockSuppliers.getById.mockResolvedValue({
      name: "Distribuidora del Norte",
      code: "PROV-001",
    })

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-24891-003" />)

    await waitFor(() => {
      expect(screen.getByText((content: string) => content.includes("Manzana Gala"))).toBeInTheDocument()
      expect(screen.getByText((content: string) => content.includes("LOTE-2024-001"))).toBeInTheDocument()
      expect(screen.getByText((content: string) => content.includes("Distribuidora del Norte"))).toBeInTheDocument()
    })
  })

  it("shows not-found state when QR returns null", async () => {
    mockPallets.getByQR.mockResolvedValue(null)

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-NOTFOUND-999" />)

    await waitFor(() => {
      expect(screen.getByText("Tarima no encontrada")).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /volver al escáner/i }),
      ).toBeInTheDocument()
    })
  })

  it("shows error state and retry button on failure", async () => {
    mockPallets.getByQR.mockRejectedValue(new Error("Network error"))

    render(<TarimaDetalle onBack={mockOnBack} qrCode="TQR-24891-003" />)

    await waitFor(() => {
      expect(screen.getByText((content: string) => content.includes("Error al cargar"))).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /reintentar/i }),
      ).toBeInTheDocument()
    })

    // Click retry
    mockPallets.getByQR.mockResolvedValueOnce({
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
    mockProducts.getById.mockResolvedValue({
      name: "Manzana Gala",
      sku: "MANZ-GALA-1KG",
    })
    mockSuppliers.getById.mockResolvedValue({
      name: "Distribuidora del Norte",
      code: "PROV-001",
    })

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }))

    await waitFor(() => {
      expect(screen.getByText((content: string) => content.includes("Manzana Gala"))).toBeInTheDocument()
    })
  })

  it("opens the reception reference without navigating back", async () => {
    const onViewReference = vi.fn()
    render(
      <TarimaDetalle
        onBack={mockOnBack}
        onViewReference={onViewReference}
        currentReception={{
          ocFolio: "OC-24891",
          tarimas: 12,
          proveedor: "Distribuidora del Norte",
          proveedorLogistico: "Logística Veloz",
        }}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /ver referencia/i }))

    expect(onViewReference).toHaveBeenCalledWith({
      recId: "OC-24891",
      tarimas: 12,
      proveedor: "Distribuidora del Norte",
      proveedorLogistico: "Logística Veloz",
    })
    expect(mockOnBack).not.toHaveBeenCalled()
  })

  it("uses legacy mode when no qrCode prop", () => {
    render(
      <TarimaDetalle
        onBack={mockOnBack}
        currentReception={{ ocFolio: "OC-24891", tarimas: 20 }}
      />,
    )

    // In legacy mode, the TARIMA label shows "TARIMA 03 / 09:42" (from receptionFolio time)
    // Text is split across elements, use function matcher
    expect(screen.getByText((content) => content.includes("TARIMA") && content.includes("03"))).toBeInTheDocument()
  })
})
