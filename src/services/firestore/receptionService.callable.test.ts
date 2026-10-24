import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctions, httpsCallable } from "firebase/functions";
import { PalletService, ReceptionService } from "./domainServices";

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

describe("Reception write services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves evidence through the authorized callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    await new ReceptionService({} as never, "org_exepa_001").saveEvidence(
      "reception-op-1",
      { trailer: "data:image/jpeg;base64,abc" },
      "op-evidence-1",
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "save_evidence");
    expect(callable).toHaveBeenCalledWith({
      receptionId: "reception-op-1",
      evidencePhotos: { trailer: "data:image/jpeg;base64,abc" },
      operationId: "op-evidence-1",
    });
  });

  it("confirms a reception through the authorized callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    await new ReceptionService({} as never, "org_exepa_001").confirmReception(
      "reception-op-1",
      "ignored-client-actor",
      "op-confirm-1",
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "confirm_reception");
    expect(callable).toHaveBeenCalledWith({
      receptionId: "reception-op-1",
      operationId: "op-confirm-1",
    });
  });

  it("validates a QR against its current reception without activating it", async () => {
    const callable = vi.fn().mockResolvedValue({
      data: {
        receptionId: "reception-op-1",
        palletId: "pallet-reception-op-1-001",
        qrIdentifier: "TQR-reception-op-1-001",
        status: "IN_CAPTURE",
        lot: "LOT-1",
        expiryDate: "2027-03-15",
        activated: false,
      },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    const result = await new ReceptionService({} as never, "org_exepa_001").validatePalletScan(
      "reception-op-1",
      "TQR-reception-op-1-001",
      "wh-1",
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "validate_reception_pallet_scan");
    expect(callable).toHaveBeenCalledWith({
      receptionId: "reception-op-1",
      qrIdentifier: "TQR-reception-op-1-001",
      warehouseId: "wh-1",
    });
    expect(result.activated).toBe(false);
    expect(result.status).toBe("IN_CAPTURE");
  });

  it("persists lot and expiry checkpoints through the authorized callable", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: "IN_CAPTURE" } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    await new ReceptionService({} as never, "org_exepa_001").savePalletCapture(
      "reception-op-1",
      "TQR-reception-op-1-001",
      "LOT-1",
      "2027-03-15",
      "checkpoint-1",
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "save_reception_pallet_capture");
    expect(callable).toHaveBeenCalledWith({
      receptionId: "reception-op-1",
      qrIdentifier: "TQR-reception-op-1-001",
      lot: "LOT-1",
      expiryDate: "2027-03-15",
      operationId: "checkpoint-1",
    });
  });

  it("creates a reception through the callable without a second client write/read", async () => {
    const plannedPallets = [
      {
        palletNumber: 1,
        lineIndex: 0,
        productId: "product-1",
        productName: "Agua mineral",
        quantity: 4,
        unit: "cajas",
        qrIdentifier: "TQR-reception-op-2-001",
        status: "PLANNED",
      },
    ];
    const callable = vi.fn().mockResolvedValue({
      data: {
        receptionId: "reception-op-2",
        folio: "REC-2026-1234",
        scheduledDate: "24/10/2026",
        purchaseOrderNumber: "OC-24891",
        supplierCode: "SUP-EFL",
        supplierName: "El Florido",
        logisticsProvider: "Transportes Herrera",
        plannedPallets,
      },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    const service = new ReceptionService({} as never, "org_exepa_001");
    const reception = await service.createReception(
      {
        warehouseId: "wh-1",
        status: "DRAFT",
        operationId: "op-reception-2",
        actorUserId: "ignored-client-actor",
        folio: "REC-2026-1234",
        scheduledDate: "24/10/2026",
        purchaseOrderNumber: "OC-24891",
        supplierCode: "SUP-EFL",
        supplierName: "El Florido",
        logisticsProvider: "Transportes Herrera",
        plannedPallets: [
          {
            palletNumber: 1,
            lineIndex: 0,
            productId: "product-1",
            productName: "Agua mineral",
            quantity: 4,
            unit: "cajas",
          },
        ],
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
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "create_reception");
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "op-reception-2",
        warehouseId: "wh-1",
        folio: "REC-2026-1234",
        scheduledDate: "24/10/2026",
        purchaseOrderNumber: "OC-24891",
        supplierCode: "SUP-EFL",
        supplierName: "El Florido",
        logisticsProvider: "Transportes Herrera",
        plannedPallets: [
          {
            palletNumber: 1,
            lineIndex: 0,
            productId: "product-1",
            productName: "Agua mineral",
            quantity: 4,
            unit: "cajas",
          },
        ],
        lines: [{ productId: "product-1", quantity: 4, unit: "cajas", lot: null }],
      }),
    );
    expect(reception.id).toBe("reception-op-2");
    expect(reception.plannedPallets).toEqual(plannedPallets);
    expect(reception.folio).toBe("REC-2026-1234");
    expect(reception.supplierName).toBe("El Florido");
    expect(reception.logisticsProvider).toBe("Transportes Herrera");
  });

  it("registers pallets through the callable and never falls back to client writes", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { palletId: "pallet-op-1" } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    const pallets = await new PalletService({} as never, "org_exepa_001").createPalletsForReception(
      "reception-op-1",
      [
        {
          warehouseId: "wh-1",
          productId: "product-1",
          qrIdentifier: "TQR-reception-op-1-001",
          quantity: 3,
          unit: "cajas",
          status: "RECEIVED",
          lot: "LOT-1",
          expiryDate: null,
        },
      ],
      "ignored-client-actor",
      "op-pallet-1",
    );

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "register_reception_pallet");
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        receptionId: "reception-op-1",
        warehouseId: "wh-1",
        productId: "product-1",
        qrIdentifier: "TQR-reception-op-1-001",
        quantity: 3,
        operationId: "op-pallet-1",
        lot: "LOT-1",
        expiryDate: null,
      }),
    );
    expect(pallets[0].id).toBe("pallet-op-1");
  });
});
