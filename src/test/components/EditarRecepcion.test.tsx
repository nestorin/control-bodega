import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";

const mockServices = vi.hoisted(() => ({
  getReception: vi.fn(),
  editReception: vi.fn(),
  getSupplier: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: { uid: "user-1" }, canQuery: true }),
}));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    receptions: { getById: mockServices.getReception, editReception: mockServices.editReception },
    suppliers: { getById: mockServices.getSupplier },
  }),
}));
vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => true }));

import { renderWithAppProviders } from "../../test/utils/renderWithAppProviders";
import EditarRecepcion from "../../screens/EditarRecepcion";

const receptionDraft = {
  id: "reception-1",
  warehouseId: "warehouse-north",
  supplierId: "supplier-1",
  supplierName: "Proveedor real",
  supplierCode: "P-01",
  logisticsProvider: "Logística real",
  purchaseOrderNumber: "OC-1001",
  folio: "REC-1001",
  scheduledDate: "2026-10-30",
  status: "DRAFT",
  version: 4,
  palletCount: 2,
  productName: "Producto real",
  operationId: "operation-1",
  actorUserId: "user-1",
  plannedPallets: [
    {
      palletNumber: 1,
      lineIndex: 0,
      productId: "product-1",
      productName: "Producto real",
      quantity: 10,
      unit: "cajas",
      qrIdentifier: "TQR-reception-1-001",
      status: "PLANNED",
      activated: false,
    },
    {
      palletNumber: 2,
      lineIndex: 0,
      productId: "product-1",
      productName: "Producto real",
      quantity: 5,
      unit: "cajas",
      qrIdentifier: "TQR-reception-1-002",
      status: "PLANNED",
      activated: false,
    },
  ],
};

const suppliers = [
  {
    id: "supplier-1",
    nombre: "Proveedor real",
    contacto: "",
    telefono: "",
    email: "",
    tipo: "mercancia" as const,
  },
  {
    id: "logistics-1",
    nombre: "Logística real",
    contacto: "",
    telefono: "",
    email: "",
    tipo: "logistica" as const,
  },
];

const products = [
  {
    id: "product-1",
    nombre: "Producto real",
    sku: "REAL-01",
    categoria: "",
    unidad: "cajas" as const,
    activo: true,
  },
  {
    id: "product-2",
    nombre: "Producto nuevo",
    sku: "NEW-02",
    categoria: "",
    unidad: "piezas" as const,
    activo: true,
  },
];

describe("EditarRecepcion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getReception.mockResolvedValue(receptionDraft);
    mockServices.getSupplier.mockResolvedValue({
      id: "supplier-1",
      name: "Proveedor real",
      code: "P-01",
    });
    mockServices.editReception.mockResolvedValue(receptionDraft);
  });

  it("loads canonical data and persists allowed draft changes through edit_reception", async () => {
    const onSave = vi.fn();
    renderWithAppProviders(
      <EditarRecepcion
        recId="reception-1"
        suppliers={suppliers}
        products={products}
        onBack={vi.fn()}
        onSave={onSave}
      />,
      {
        editReceptionData: receptionDraft,
      },
    );

    expect(await screen.findByRole("heading", { name: "REC-1001" })).toBeInTheDocument();
    const productCard = screen.getByTestId("reception-product-card");
    expect(
      within(productCard).getByRole("textbox", { name: "Producto línea 1" }),
    ).toBeInTheDocument();
    expect(
      within(productCard).getByRole("button", { name: "Eliminar producto 1" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Producto real")).toBeInTheDocument();
    expect(screen.getByText("2 tarimas", { exact: false })).toBeInTheDocument();
    expect(screen.getByTitle("Código QR TQR-reception-1-001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mockServices.editReception).toHaveBeenCalledOnce());
    const args = mockServices.editReception.mock.calls[0];
    expect(args[0]).toBe("reception-1");
    expect(args[1]).toMatchObject({
      supplierId: "supplier-1",
      supplierName: "Proveedor real",
      logisticsProvider: "Logística real",
    });
    expect(args[2]).toEqual([
      { productId: "product-1", quantity: 15, unit: "cajas", palletsCreated: 0 },
    ]);
    expect(args[5]).toBe(4);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("renders accurate in-progress reception data as read-only", async () => {
    mockServices.getReception.mockResolvedValue({
      ...receptionDraft,
      status: "IN_PROGRESS",
      plannedPallets: receptionDraft.plannedPallets.map((pallet, index) => ({
        ...pallet,
        status: index === 0 ? "ACTIVE" : "PLANNED",
        activated: index === 0,
      })),
    });

    renderWithAppProviders(
      <EditarRecepcion
        recId="reception-1"
        suppliers={suppliers}
        products={products}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />,
      {
        editReceptionData: {
          ...receptionDraft,
          status: "IN_PROGRESS",
          plannedPallets: receptionDraft.plannedPallets.map((pallet, index) => ({
            ...pallet,
            status: index === 0 ? "ACTIVE" : "PLANNED",
            activated: index === 0,
          })),
        },
      },
    );

    expect(await screen.findByText("Logística real")).toBeInTheDocument();
    expect(screen.getByText("15 cajas · 2 tarimas")).toBeInTheDocument();
    expect(screen.getByText(/solo se permiten cambios en borradores/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(mockServices.editReception).not.toHaveBeenCalled();
  });

  it("selects a preloaded catalog product and persists its canonical ID and unit", async () => {
    renderWithAppProviders(
      <EditarRecepcion
        recId="reception-1"
        suppliers={suppliers}
        products={products}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />,
      {
        editReceptionData: receptionDraft,
      },
    );

    const input = await screen.findByRole("textbox", { name: "Producto línea 1" });
    fireEvent.change(input, { target: { value: "NEW-02" } });
    fireEvent.click(await screen.findByRole("button", { name: /Producto nuevo/ }));
    expect(input).toHaveValue("Producto nuevo");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(mockServices.editReception).toHaveBeenCalledOnce());
    expect(mockServices.editReception.mock.calls[0][1].plannedPallets[0]).toMatchObject({
      productId: "product-2",
      productName: "Producto nuevo",
      unit: "piezas",
    });
    expect(mockServices.editReception.mock.calls[0][2][0]).toMatchObject({
      productId: "product-2",
      unit: "piezas",
    });
  });

  it("does not save arbitrary product text without a catalog selection", async () => {
    renderWithAppProviders(
      <EditarRecepcion
        recId="reception-1"
        suppliers={suppliers}
        products={products}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />,
      {
        editReceptionData: receptionDraft,
      },
    );

    const input = await screen.findByRole("textbox", { name: "Producto línea 1" });
    fireEvent.change(input, { target: { value: "Producto inexistente" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Seleccioná cada producto del catálogo antes de guardar.",
    );
    expect(mockServices.editReception).not.toHaveBeenCalled();
  });
});
