import { beforeEach, describe, expect, it, vi } from "vitest"
import { httpsCallable } from "firebase/functions"
import { InventoryService } from "./inventoryService"

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}))

describe("InventoryService backend boundary", () => {
  beforeEach(() => vi.clearAllMocks())

  it("calls adjust_inventory and preserves the operation id", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } })
    vi.mocked(httpsCallable).mockReturnValue(callable as never)

    const service = new InventoryService({} as never, "org_exepa_001")
    await service.adjustStock(
      "wh_tehuacan_1",
      "CB0301",
      12,
      "RECEIPT",
      "LOT-1",
      undefined,
      "op-receipt-1",
      "ignored-client-actor",
    )

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "adjust_inventory")
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: "wh_tehuacan_1",
        productId: "CB0301",
        quantity: 12,
        movementType: "RECEIPT",
        operationId: "op-receipt-1",
      }),
    )
  })

  it("fails closed for unsupported direct movement types", async () => {
    const service = new InventoryService({} as never, "org_exepa_001")

    await expect(
      service.adjustStock(
        "wh_tehuacan_1",
        "CB0301",
        1,
        "SHIPMENT",
        undefined,
        undefined,
        "op-1",
      ),
    ).rejects.toThrow("dedicated authorized backend operation")
    expect(httpsCallable).not.toHaveBeenCalled()
  })

  it("uses the authorized import callable with the selected action", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } })
    vi.mocked(httpsCallable).mockReturnValue(callable as never)
    const service = new InventoryService({} as never, "org_exepa_001")
    await service.importInventory(
      [{ rowNumber: 2, productId: "p-1", warehouseId: "wh-1", quantity: 5 }],
      "REPLACE",
      "import-1",
    )
    expect(httpsCallable).toHaveBeenCalledWith(undefined, "import_inventory")
    expect(callable).toHaveBeenCalledWith({
      mode: "REPLACE",
      operationId: "import-1",
      rows: [{ productId: "p-1", warehouseId: "wh-1", quantity: 5 }],
    })
  })
})
