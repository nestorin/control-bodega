import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getByWarehouse = vi.hoisted(() => vi.fn());

vi.mock("@/config/featureFlags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ user: { uid: "user-1" }, canQuery: true }),
  isPermissionDenied: () => false,
}));
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    lotesCaducidades: { getByWarehouse },
    inventory: { importInventory: vi.fn() },
  }),
}));

import LotesCaducidades from "@/screens/LotesCaducidades";
import { WAREHOUSE_IDS } from "@/config/warehouses";

const CSV_CONTENT = [
  "Articulo,U. med.,Existencia,Ultimo costo,Valor total",
  "CB0301 BEBIDA SABOR COLA 235ML C/24 PZS,CAJA,373,100,37300",
  "CL0101 LECHE EVAPORADA 360 GRS C/48 PZS,CAJA,336,200,67200",
].join("\n");

function uploadCsv() {
  const input = screen.getByLabelText("Archivo de inventario");
  const file = new File([CSV_CONTENT], "Tehuacan-2.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("inventory CSV import", () => {
  it("parses rows without a warehouse column using the selected warehouse", async () => {
    getByWarehouse.mockResolvedValue([]);
    render(<LotesCaducidades />);

    uploadCsv();

    // Regression: parseInventoryImport was called without warehouseId, so every
    // row failed with "Almacén no especificado" and validRows stayed empty.
    await waitFor(() => {
      expect(screen.getByText(/2 filas válidas/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Almacén no especificado/)).not.toBeInTheDocument();
    expect(screen.getByText("CB0301 BEBIDA SABOR COLA 235ML C/24 PZS")).toBeInTheDocument();
  });

  it("re-parses the stored file when the destination warehouse changes", async () => {
    getByWarehouse.mockResolvedValue([]);
    render(<LotesCaducidades />);

    uploadCsv();
    await screen.findByText(/2 filas válidas/);

    const select = screen.getByLabelText("Almacén destino para importación");
    expect(select).toHaveValue(WAREHOUSE_IDS.NORTH);

    fireEvent.change(select, { target: { value: WAREHOUSE_IDS.SOUTH } });

    await waitFor(() => {
      expect(screen.getAllByText(WAREHOUSE_IDS.SOUTH)).toHaveLength(2);
    });
    expect(screen.getByText(/2 filas válidas/)).toBeInTheDocument();
  });
});
