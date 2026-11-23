import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadBytes = vi.hoisted(() => vi.fn());
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  uploadBytes,
}));

import { shipmentEvidencePath, uploadShipmentEvidence } from "./shipmentEvidence";

describe("shipment evidence storage", () => {
  beforeEach(() => uploadBytes.mockReset().mockResolvedValue({}));

  it("builds a warehouse-scoped persistent path", () => {
    const file = new File(["photo"], "invoice.png", { type: "image/png" });
    expect(
      shipmentEvidencePath(
        "org-1",
        "warehouse-2",
        "shipment-3",
        "invoice",
        file,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toBe(
      "organizations/org-1/warehouses/warehouse-2/shipments/shipment-3/evidence/invoice.png",
    );
  });

  it("uploads loaded-trailer evidence without returning a blob URL", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "photo-1" });
    const file = new File(["photo"], "load.webp", { type: "image/webp" });
    const path = await uploadShipmentEvidence(
      {} as never,
      "org-1",
      "warehouse-2",
      "shipment-3",
      "loadedTrailer",
      file,
    );
    expect(path).toContain("/loaded-photo-1.webp");
    expect(path).not.toMatch(/^blob:/);
    expect(uploadBytes).toHaveBeenCalledWith(path, file, { contentType: "image/webp" });
  });
});
