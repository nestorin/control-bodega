import { beforeEach, describe, expect, it, vi } from "vitest"
import { getFunctions, httpsCallable } from "firebase/functions"
import { PalletService, ReceptionService } from "./domainServices"

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}))

describe("Reception write services", () => {
  beforeEach(() => vi.clearAllMocks())

  it("saves evidence through the authorized callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } })
    vi.mocked(httpsCallable).mockReturnValue(callable as never)

    await new ReceptionService({} as never, "org_exepa_001").saveEvidence(
      "reception-op-1",
      { trailer: "data:image/jpeg;base64,abc" },
      "op-evidence-1",
    )

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "save_evidence")
    expect(callable).toHaveBeenCalledWith({
      receptionId: "reception-op-1",
      evidencePhotos: { trailer: "data:image/jpeg;base64,abc" },
      operationId: "op-evidence-1",
    })
  })

  it("confirms a reception through the authorized callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } })
    vi.mocked(httpsCallable).mockReturnValue(callable as never)

    await new ReceptionService({} as never, "org_exepa_001").confirmReception(
      "reception-op-1",
      "ignored-client-actor",
      "op-confirm-1",
    )

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "confirm_reception")
    expect(callable).toHaveBeenCalledWith({
      receptionId: "reception-op-1",
      operationId: "op-confirm-1",
    })
  })

  it("creates a reception through the callable without a second client write/read", async () => {
    const callable = vi
      .fn()
      .mockResolvedValue({ data: { receptionId: "reception-op-2" } })
    vi.mocked(httpsCallable).mockReturnValue(callable as never)

    const service = new ReceptionService({} as never, "org_exepa_001")
    const reception = await service.createReception(
      {
        warehouseId: "wh-1",
        status: "DRAFT",
        operationId: "op-reception-2",
        actorUserId: "ignored-client-actor",
      } as never,
      [
        {
          productId: "product-1",
          quantity: 4,
          unit: "cajas",
          palletsCreated: 0,
        } as never,
      ],
      "ignored-client-actor",
      "op-reception-2",
    )

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "create_reception")
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "op-reception-2",
        warehouseId: "wh-1",
        lines: [
          { productId: "product-1", quantity: 4, unit: "cajas", lot: null },
        ],
      }),
    )
    expect(reception.id).toBe("reception-op-2")
  })

  it("registers pallets through the callable and never falls back to client writes", async () => {
    const callable = vi
      .fn()
      .mockResolvedValue({ data: { palletId: "pallet-op-1" } })
    vi.mocked(httpsCallable).mockReturnValue(callable as never)

    const pallets = await new PalletService(
      {} as never,
      "org_exepa_001",
    ).createPalletsForReception(
      "reception-op-1",
      [
        {
          warehouseId: "wh-1",
          productId: "product-1",
          qrIdentifier: "QR-1",
          quantity: 3,
          unit: "cajas",
          status: "RECEIVED",
          lot: "LOT-1",
          expiryDate: null,
        },
      ],
      "ignored-client-actor",
      "op-pallet-1",
    )

    expect(httpsCallable).toHaveBeenCalledWith(
      undefined,
      "register_reception_pallet",
    )
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        receptionId: "reception-op-1",
        warehouseId: "wh-1",
        productId: "product-1",
        quantity: 3,
        operationId: "op-pallet-1",
      }),
    )
    expect(pallets[0].id).toBe("pallet-op-1")
  })
})
