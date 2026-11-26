import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { getDocs, query, where, collectionGroup } from "firebase/firestore";
import { InventoryService } from "./inventoryService";

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual("firebase/firestore");
  return {
    ...actual,
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    collectionGroup: vi.fn(),
  };
});

describe("InventoryService backend boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls adjust_inventory and preserves the operation id", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    const service = new InventoryService({} as never, "org_exepa_001");
    await service.adjustStock(
      "wh_tehuacan_1",
      "CB0301",
      12,
      "RECEIPT",
      "LOT-1",
      undefined,
      "op-receipt-1",
      "ignored-client-actor",
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "adjust_inventory");
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: "wh_tehuacan_1",
        productId: "CB0301",
        quantity: 12,
        movementType: "RECEIPT",
        operationId: "op-receipt-1",
      }),
    );
  });

  it("fails closed for unsupported direct movement types", async () => {
    const service = new InventoryService({} as never, "org_exepa_001");

    await expect(
      service.adjustStock("wh_tehuacan_1", "CB0301", 1, "ADJUSTMENT", undefined, undefined, "op-1"),
    ).rejects.toThrow("dedicated authorized backend operation");
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("uses the authorized import callable with the selected action", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);
    const service = new InventoryService({} as never, "org_exepa_001");
    await service.importInventory(
      [{ rowNumber: 2, productId: "p-1", warehouseId: "wh-1", quantity: 5 }],
      "REPLACE",
      "import-1",
    );
    expect(httpsCallable).toHaveBeenCalledWith(undefined, "import_inventory");
    expect(callable).toHaveBeenCalledWith({
      mode: "REPLACE",
      operationId: "import-1",
      rows: [{ productId: "p-1", warehouseId: "wh-1", quantity: 5 }],
    });
  });

  // ============================================
  // New compatibility methods tests
  // ============================================

  describe("getInventarioAlmacen", () => {
    it("delegates to getWarehouseStock", async () => {
      const mockSnap = {
        docs: [
          {
            data: () => ({
              productId: "p1",
              quantity: 10,
              direction: "IN",
              movementType: "RECEIPT",
            }),
          },
          {
            data: () => ({
              productId: "p1",
              quantity: 3,
              direction: "OUT",
              movementType: "SHIPMENT",
            }),
          },
          {
            data: () => ({
              productId: "p2",
              quantity: 5,
              direction: "IN",
              movementType: "RECEIPT",
            }),
          },
        ],
      };
      vi.mocked(getDocs).mockResolvedValue(mockSnap as never);

      const service = new InventoryService({} as never, "org_exepa_001");
      const result = await service.getInventarioAlmacen("wh_test");

      expect(result).toEqual({ p1: 7, p2: 5 });
    });
  });

  describe("createInventarioInicial", () => {
    it("logs initialization and returns void", async () => {
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const service = new InventoryService({} as never, "org_exepa_001");
      await service.createInventarioInicial("wh_test", [
        {
          id: "p1",
          nombre: "Prod 1",
          sku: "SKU1",
          categoria: "cat",
          unidad: "cajas",
          activo: true,
        },
        {
          id: "p2",
          nombre: "Prod 2",
          sku: "SKU2",
          categoria: "cat",
          unidad: "cajas",
          activo: true,
        },
      ]);

      expect(consoleLog).toHaveBeenCalledWith(
        "[InventoryService] Initial inventory for wh_test with 2 products (implicit zero)",
      );
      consoleLog.mockRestore();
    });
  });

  describe("aumentarInventario", () => {
    it("calls batchAdjustStock with RECEIPT type", async () => {
      const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
      vi.mocked(httpsCallable).mockReturnValue(callable as never);

      const service = new InventoryService({} as never, "org_exepa_001");
      await service.aumentarInventario(
        "wh_test",
        [
          { productoId: "p1", cajas: 5 },
          { productoId: "p2", cajas: 3 },
        ],
        "op-increase-1",
        "user1",
      );

      // httpsCallable is called once to get the callable function
      expect(httpsCallable).toHaveBeenCalledTimes(1);
      // The returned callable is called twice (once per product)
      expect(callable).toHaveBeenCalledTimes(2);
      expect(callable).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: "wh_test",
          productId: "p1",
          quantity: 5,
          movementType: "RECEIPT",
          operationId: "op-increase-1:0",
        }),
      );
      expect(callable).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: "wh_test",
          productId: "p2",
          quantity: 3,
          movementType: "RECEIPT",
          operationId: "op-increase-1:1",
        }),
      );
    });
  });

  describe("reducirInventario", () => {
    it("calls adjustStock with SHIPMENT type for each product", async () => {
      const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
      vi.mocked(httpsCallable).mockReturnValue(callable as never);

      const service = new InventoryService({} as never, "org_exepa_001");
      await service.reducirInventario(
        "wh_test",
        [
          { productoId: "p1", cajas: 5 },
          { productoId: "p2", cajas: 3 },
        ],
        "op-decrease-1",
        "user1",
      );

      // httpsCallable is called once per product (inside the loop)
      expect(httpsCallable).toHaveBeenCalledTimes(2);
      // The returned callable is called twice (once per product)
      expect(callable).toHaveBeenCalledTimes(2);
      expect(callable).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: "wh_test",
          productId: "p1",
          quantity: 5,
          movementType: "SHIPMENT",
          operationId: "op-decrease-1:0",
        }),
      );
      expect(callable).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: "wh_test",
          productId: "p2",
          quantity: 3,
          movementType: "SHIPMENT",
          operationId: "op-decrease-1:1",
        }),
      );
    });
  });
});
