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
});
