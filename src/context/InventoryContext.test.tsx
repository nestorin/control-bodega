import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import {
  InventoryProvider,
  useInventoryContext,
  inventoryReducer,
  type InventoryState,
} from "./InventoryContext";
import type { Producto, Almacen } from "@/types";

// Mock everything using vi.hoisted to avoid hoisting issues
const {
  mockDb,
  MockInventoryService,
  mockGetInventarioAlmacen,
  mockCreateInventarioInicial,
  mockAumentarInventario,
  mockReducirInventario,
} = vi.hoisted(() => {
  const mockGetInventarioAlmacen = vi.fn();
  const mockCreateInventarioInicial = vi.fn();
  const mockAumentarInventario = vi.fn();
  const mockReducirInventario = vi.fn();

  class MockInventoryServiceClass {
    getInventarioAlmacen = mockGetInventarioAlmacen;
    createInventarioInicial = mockCreateInventarioInicial;
    aumentarInventario = mockAumentarInventario;
    reducirInventario = mockReducirInventario;
  }

  return {
    mockDb: {},
    MockInventoryService: MockInventoryServiceClass,
    mockGetInventarioAlmacen,
    mockCreateInventarioInicial,
    mockAumentarInventario,
    mockReducirInventario,
  };
});

// Mock Firebase
vi.mock("@/lib/firebase", () => ({
  db: mockDb,
  auth: null,
  app: null,
  functions: null,
}));

// Mock feature flags
vi.mock("@/config/featureFlags", () => ({
  FEATURE_FLAGS: {
    USE_FIRESTORE_INVENTARIO: true,
  },
  isFeatureEnabled: (flag: string) => flag === "USE_FIRESTORE_INVENTARIO",
}));

// Mock useOfflineQueue
vi.mock("@/hooks/useFirestore", () => ({
  useOfflineQueue: () => ({
    queue: [],
    isOnline: true,
    syncing: false,
    enqueue: vi.fn(),
    clearQueue: vi.fn(),
  }),
}));

// Mock InventoryService
vi.mock("@/services/firestore/inventoryService", () => ({
  InventoryService: MockInventoryService,
}));

// Test component that uses the context
function TestComponent() {
  const {
    inventario,
    almacenActivo,
    loading,
    error,
    inicializarInventarioAlmacen,
    handleActivarAlmacen,
    aumentarInventario,
    reducirInventario,
    getInventarioAlmacen,
    refreshInventarioAlmacen,
  } = useInventoryContext();

  return (
    <div>
      <div data-testid="loading">{loading ? "true" : "false"}</div>
      <div data-testid="error">{error?.message || "null"}</div>
      <div data-testid="almacen-activo">{almacenActivo?.id || "null"}</div>
      <div data-testid="inventario">{JSON.stringify(inventario)}</div>
      <button
        data-testid="btn-inicializar"
        onClick={() =>
          inicializarInventarioAlmacen("wh_test", [
            {
              id: "p1",
              nombre: "Prod 1",
              sku: "SKU1",
              categoria: "cat",
              unidad: "cajas",
              activo: true,
            },
          ])
        }
      >
        Inicializar
      </button>
      <button
        data-testid="btn-activar"
        onClick={() =>
          handleActivarAlmacen({
            id: "wh_test",
            nombre: "Test Warehouse",
            ubicacion: "Test",
            responsable: "Test",
            activo: true,
            creadoEn: "2024-01-01",
          })
        }
      >
        Activar
      </button>
      <button
        data-testid="btn-aumentar"
        onClick={() => aumentarInventario("wh_test", [{ productoId: "p1", cajas: 5 }])}
      >
        Aumentar
      </button>
      <button
        data-testid="btn-reducir"
        onClick={() => reducirInventario("wh_test", [{ productoId: "p1", cajas: 2 }])}
      >
        Reducir
      </button>
      <button data-testid="btn-get" onClick={() => getInventarioAlmacen("wh_test")}>
        Get
      </button>
      <button data-testid="btn-refresh" onClick={() => refreshInventarioAlmacen("wh_test")}>
        Refresh
      </button>
    </div>
  );
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<InventoryProvider orgId="org_test">{ui}</InventoryProvider>);
}

describe("InventoryContext", () => {
  const mockProductos: Producto[] = [
    { id: "p1", nombre: "Prod 1", sku: "SKU1", categoria: "cat", unidad: "cajas", activo: true },
    { id: "p2", nombre: "Prod 2", sku: "SKU2", categoria: "cat", unidad: "cajas", activo: true },
  ];

  const mockAlmacen: Almacen = {
    id: "wh_test",
    nombre: "Test Warehouse",
    ubicacion: "Test",
    responsable: "Test",
    activo: true,
    creadoEn: "2024-01-01",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInventarioAlmacen.mockResolvedValue({});
    mockCreateInventarioInicial.mockResolvedValue(undefined);
    mockAumentarInventario.mockResolvedValue(undefined);
    mockReducirInventario.mockResolvedValue(undefined);
  });

  it("provides initial state", () => {
    renderWithProvider(<TestComponent />);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toHaveTextContent("null");
    expect(screen.getByTestId("almacen-activo")).toHaveTextContent("null");
    expect(screen.getByTestId("inventario")).toHaveTextContent("{}");
  });

  it("initializes inventory from Firestore", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10, p2: 5 });

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      expect(mockGetInventarioAlmacen).toHaveBeenCalledWith("wh_test");
      expect(mockCreateInventarioInicial).not.toHaveBeenCalled(); // Stock exists, no init needed
    });

    await waitFor(() => {
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":10,"p2":5}');
    });
  });

  it("creates initial inventory when Firestore returns empty", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({});

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      expect(mockCreateInventarioInicial).toHaveBeenCalledWith(
        "wh_test",
        expect.arrayContaining([expect.objectContaining({ id: "p1" })]),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":0}');
    });
  });

  it("activates warehouse", async () => {
    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-activar").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("almacen-activo")).toHaveTextContent("wh_test");
    });
  });

  it("increases inventory optimistically and calls service", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":10}');
    });

    await act(async () => {
      await screen.getByTestId("btn-aumentar").click();
    });

    await waitFor(() => {
      // Optimistic update should be immediate
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":15}');
      expect(mockAumentarInventario).toHaveBeenCalledWith(
        "wh_test",
        [{ productoId: "p1", cajas: 5 }],
        expect.any(String),
        "user",
      );
    });
  });

  it("decreases inventory optimistically and calls service", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":10}');
    });

    await act(async () => {
      await screen.getByTestId("btn-reducir").click();
    });

    await waitFor(() => {
      // Optimistic update should be immediate
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":8}');
      expect(mockReducirInventario).toHaveBeenCalledWith(
        "wh_test",
        [{ productoId: "p1", cajas: 2 }],
        expect.any(String),
        "user",
      );
    });
  });

  it("prevents negative stock locally in reducer", () => {
    // Test the reducer directly for negative stock prevention
    const stateWithStock: InventoryState = {
      inventario: { wh_test: { p1: 1 } },
      almacenActivo: null,
      loading: false,
      error: null,
      cacheVersion: { wh_test: 1 },
    };

    const action = {
      type: "REDUCIR_INVENTARIO" as const,
      payload: { almacenId: "wh_test", productos: [{ productoId: "p1", cajas: 5 }] },
    };

    const newState = inventoryReducer(stateWithStock, action);
    // Should not go below 0
    expect(newState.inventario.wh_test.p1).toBe(0);
  });

  it("gets inventory for warehouse", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10, p2: 5 });

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":10,"p2":5}');
    });

    await act(async () => {
      await screen.getByTestId("btn-get").click();
    });

    // getInventarioAlmacen is synchronous, just verify it doesn't throw
    expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":10,"p2":5}');
  });

  it("refreshes inventory from Firestore", async () => {
    mockGetInventarioAlmacen.mockResolvedValueOnce({ p1: 10 }).mockResolvedValueOnce({ p1: 20 });

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":10}');
    });

    await act(async () => {
      await screen.getByTestId("btn-refresh").click();
    });

    await waitFor(() => {
      expect(mockGetInventarioAlmacen).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":20}');
    });
  });

  it("handles service errors gracefully with fallback", async () => {
    mockGetInventarioAlmacen.mockRejectedValue(new Error("Firestore error"));

    renderWithProvider(<TestComponent />);
    await act(async () => {
      await screen.getByTestId("btn-inicializar").click();
    });

    await waitFor(() => {
      // Should fallback to local initialization
      expect(screen.getByTestId("inventario")).toHaveTextContent('{"p1":0}');
      // Error should be cleared after fallback
      expect(screen.getByTestId("error")).toHaveTextContent("null");
    });
  });

  it("prevents duplicate initialization calls", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    renderWithProvider(<TestComponent />);
    await act(async () => {
      // Click initialize twice rapidly
      const btn = screen.getByTestId("btn-inicializar");
      btn.click();
      btn.click();
      // Wait for both promises to settle
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      // Should only call service once
      expect(mockGetInventarioAlmacen).toHaveBeenCalledTimes(1);
    });
  });
});

// Need to import renderHook for the negative stock test
import { renderHook } from "@testing-library/react";
