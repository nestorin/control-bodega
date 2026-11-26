import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInventory } from "./useInventory";
import { InventoryProvider } from "@/context/InventoryContext";
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

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <InventoryProvider orgId="org_test">{children}</InventoryProvider>
);

describe("useInventory", () => {
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

  it("returns initial state", () => {
    const { result } = renderHook(() => useInventory(), { wrapper });
    expect(result.current.inventario).toEqual({});
    expect(result.current.almacenActivo).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("initializes inventory async", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10, p2: 5 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10, p2: 5 } });
      expect(result.current.loading).toBe(false);
    });
  });

  it("activates warehouse async", async () => {
    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.activarAlmacen(mockAlmacen);
    });

    expect(result.current.almacenActivo).toEqual(mockAlmacen);
  });

  it("increases inventory async with validation", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    await act(async () => {
      await result.current.aumentarInventario("wh_test", [{ productoId: "p1", cajas: 5 }]);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 15 } });
      expect(mockAumentarInventario).toHaveBeenCalledWith(
        "wh_test",
        [{ productoId: "p1", cajas: 5 }],
        expect.any(String),
        "user",
      );
    });
  });

  it("filters out non-positive cajas when increasing", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await act(async () => {
      await result.current.aumentarInventario("wh_test", [
        { productoId: "p1", cajas: 5 },
        { productoId: "p2", cajas: 0 }, // Should be filtered
        { productoId: "p3", cajas: -1 }, // Should be filtered
      ]);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 15 } });
      expect(consoleWarn).toHaveBeenCalledWith(
        "[useInventory] Some products had non-positive cajas, filtering them out",
      );
      expect(mockAumentarInventario).toHaveBeenCalledWith(
        "wh_test",
        [{ productoId: "p1", cajas: 5 }], // Only valid product
        expect.any(String),
        "user",
      );
    });

    consoleWarn.mockRestore();
  });

  it("does nothing when all cajas are non-positive for increase", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    await act(async () => {
      await result.current.aumentarInventario("wh_test", [
        { productoId: "p1", cajas: 0 },
        { productoId: "p2", cajas: -1 },
      ]);
    });

    // Should not call service
    expect(mockAumentarInventario).not.toHaveBeenCalled();
    expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
  });

  it("decreases inventory async with validation", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    await act(async () => {
      await result.current.reducirInventario("wh_test", [{ productoId: "p1", cajas: 3 }]);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 7 } });
      expect(mockReducirInventario).toHaveBeenCalledWith(
        "wh_test",
        [{ productoId: "p1", cajas: 3 }],
        expect.any(String),
        "user",
      );
    });
  });

  it("filters out non-positive cajas when decreasing", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await act(async () => {
      await result.current.reducirInventario("wh_test", [
        { productoId: "p1", cajas: 3 },
        { productoId: "p2", cajas: 0 }, // Should be filtered
        { productoId: "p3", cajas: -1 }, // Should be filtered
      ]);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 7 } });
      expect(consoleWarn).toHaveBeenCalledWith(
        "[useInventory] Some products had non-positive cajas, filtering them out",
      );
      expect(mockReducirInventario).toHaveBeenCalledWith(
        "wh_test",
        [{ productoId: "p1", cajas: 3 }], // Only valid product
        expect.any(String),
        "user",
      );
    });

    consoleWarn.mockRestore();
  });

  it("does nothing when all cajas are non-positive for decrease", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    await act(async () => {
      await result.current.reducirInventario("wh_test", [
        { productoId: "p1", cajas: 0 },
        { productoId: "p2", cajas: -1 },
      ]);
    });

    // Should not call service
    expect(mockReducirInventario).not.toHaveBeenCalled();
    expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
  });

  it("gets inventory for warehouse", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10, p2: 5 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10, p2: 5 } });
    });

    const stock = result.current.getInventarioAlmacen("wh_test");
    expect(stock).toEqual({ p1: 10, p2: 5 });

    // Non-existent warehouse returns empty
    const emptyStock = result.current.getInventarioAlmacen("wh_unknown");
    expect(emptyStock).toEqual({});
  });

  it("refreshes inventory from Firestore", async () => {
    mockGetInventarioAlmacen.mockResolvedValueOnce({ p1: 10 }).mockResolvedValueOnce({ p1: 20 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.inventario).toEqual({ wh_test: { p1: 10 } });
    });

    await act(async () => {
      await result.current.refreshInventarioAlmacen("wh_test");
    });

    await waitFor(() => {
      expect(mockGetInventarioAlmacen).toHaveBeenCalledTimes(2);
      expect(result.current.inventario).toEqual({ wh_test: { p1: 20 } });
    });
  });

  it("exposes loading and error state", async () => {
    mockGetInventarioAlmacen.mockResolvedValue({ p1: 10 });

    const { result } = renderHook(() => useInventory(), { wrapper });

    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it("handles service failure gracefully with fallback", async () => {
    mockGetInventarioAlmacen.mockRejectedValue(new Error("Firestore error"));

    const { result } = renderHook(() => useInventory(), { wrapper });

    // The error is caught internally and fallback is used
    await act(async () => {
      await result.current.inicializarInventario("wh_test", mockProductos);
    });

    // Should not throw, but use fallback (initializes all products to 0)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      // Error state is set temporarily but cleared after fallback
      expect(result.current.inventario).toEqual({ wh_test: { p1: 0, p2: 0 } });
    });
  });
});
