import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getReception, editReception, getSupplier } = vi.hoisted(() => ({
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
    receptions: { getById: getReception, editReception },
    suppliers: { getById: getSupplier },
  }),
}));

import EditarRecepcion from "@/screens/EditarRecepcion";

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

describe("EditarRecepcion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReception.mockResolvedValue(receptionDraft);
    getSupplier.mockResolvedValue({ id: "supplier-1", name: "Proveedor real", code: "P-01" });
    editReception.mockResolvedValue(receptionDraft);
  });

  it("loads canonical data and persists allowed draft changes through edit_reception", async () => {
    const onSave = vi.fn();
    render(
      <EditarRecepcion
        recId="reception-1"
        suppliers={suppliers}
        onBack={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(await screen.findByRole("heading", { name: "REC-1001" })).toBeInTheDocument();
    expect(screen.getByText("Producto real")).toBeInTheDocument();
    expect(screen.getByText("2 tarimas", { exact: false })).toBeInTheDocument();
    expect(screen.getByTitle("Código QR TQR-reception-1-001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(editReception).toHaveBeenCalledOnce());
    const args = editReception.mock.calls[0];
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
    getReception.mockResolvedValue({
      ...receptionDraft,
      status: "IN_PROGRESS",
      plannedPallets: receptionDraft.plannedPallets.map((pallet, index) => ({
        ...pallet,
        status: index === 0 ? "ACTIVE" : "PLANNED",
        activated: index === 0,
      })),
    });

    render(
      <EditarRecepcion
        recId="reception-1"
        suppliers={suppliers}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(await screen.findByText("Logística real")).toBeInTheDocument();
    expect(screen.getByText("15 cajas · 2 tarimas")).toBeInTheDocument();
    expect(screen.getByText(/solo se permiten cambios en borradores/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(editReception).not.toHaveBeenCalled();
  });
});
