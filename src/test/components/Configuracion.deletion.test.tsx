import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Configuracion, {
  type Almacen,
  type Conversion,
  type Producto,
  type Proveedor,
} from "@/screens/Configuracion";

const mocks = vi.hoisted(() => {
  const deleteProduct = vi.fn();
  const deleteSupplier = vi.fn();
  const services = {
    warehouses: {
      getCanonical: vi.fn().mockResolvedValue({ data: [] }),
    },
    products: {
      getAll: vi.fn().mockResolvedValue({
        data: [
          {
            id: "product-1",
            name: "Producto de prueba",
            sku: "SKU-1",
            category: "Bebidas",
            unit: "cajas",
            supplierCodes: [],
          },
        ],
      }),
      delete: deleteProduct,
    },
    suppliers: {
      getAll: vi.fn().mockResolvedValue({
        data: [
          {
            id: "supplier-1",
            name: "Proveedor de prueba",
            contact: "Contacto",
            phone: "",
            email: "",
            tipo: "logistica",
          },
        ],
      }),
      delete: deleteSupplier,
    },
    conversions: {
      getAll: vi.fn().mockResolvedValue({ data: [] }),
    },
    userMemberships: {
      getAllMembers: vi.fn().mockResolvedValue({
        data: [
          {
            id: "membership-1",
            userId: "user-1",
            displayName: "Ana Operadora",
            email: "ana@example.com",
            role: "ALMACENISTA",
            status: "ACTIVE",
            warehouseId: "warehouse-1",
          },
        ],
      }),
      updateRole: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    },
  };

  return { deleteProduct, deleteSupplier, services };
});

vi.mock("@/config/featureFlags", () => ({
  isFeatureEnabled: () => true,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  isPermissionDenied: () => false,
  useAuthorization: () => ({ canQuery: true }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => mocks.services,
}));

const initialAlmacenes: Almacen[] = [];
const initialConversiones: Conversion[] = [];

function Harness() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  return (
    <Configuracion
      productos={productos}
      setProductos={setProductos}
      proveedores={proveedores}
      setProveedores={setProveedores}
      conversiones={initialConversiones}
      setConversiones={vi.fn()}
      almacenes={initialAlmacenes}
      setAlmacenes={vi.fn()}
      onActivarAlmacen={vi.fn()}
    />
  );
}

describe("Configuracion catalog deletion", () => {
  it("keeps a product visible when Firestore deletion fails", async () => {
    const user = userEvent.setup();
    mocks.deleteProduct.mockRejectedValueOnce(new Error("delete failed"));
    render(<Harness />);

    await user.click(await screen.findByRole("tab", { name: "Alta de productos" }));
    const row = (await screen.findByText("Producto de prueba")).closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row!).getAllByRole("button").at(-1)!);

    await waitFor(() =>
      expect(mocks.deleteProduct).toHaveBeenCalledWith("product-1", "user", expect.any(String)),
    );
    expect(screen.getByText("Producto de prueba")).toBeInTheDocument();
  });

  it("keeps a supplier visible when Firestore deletion fails", async () => {
    const user = userEvent.setup();
    mocks.deleteSupplier.mockRejectedValueOnce(new Error("delete failed"));
    render(<Harness />);

    await user.click(await screen.findByRole("tab", { name: "Prov. Logística" }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(mocks.deleteSupplier).toHaveBeenCalledWith("supplier-1", "user", expect.any(String)),
    );
    expect(screen.getByText("Proveedor de prueba")).toBeInTheDocument();
  });

  it("offers mobile role and status controls without requiring a wide table", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Roles y usuarios" }));
    const mobileList = screen.getByLabelText("Usuarios y roles");
    expect(await within(mobileList).findByText("Ana Operadora")).toBeInTheDocument();
    expect(within(mobileList).getByText("ana@example.com")).toBeInTheDocument();

    await user.selectOptions(
      within(mobileList).getByRole("combobox", { name: "Cambiar rol de Ana Operadora" }),
      "SUPERVISOR",
    );
    await waitFor(() =>
      expect(mocks.services.userMemberships.updateRole).toHaveBeenCalledWith(
        "user-1",
        "SUPERVISOR",
        "current-user",
        expect.any(String),
      ),
    );
  });
});
