import { describe, expect, it } from "vitest";
import { generateReceptionQrPngs } from "@/services/receptionQr";

describe("generateReceptionQrPngs", () => {
  it("generates real PNG QR images from the exact pallet identifiers", async () => {
    const ids = ["TQR-REC-2026-9469-001", "TQR-REC-2026-9469-002"];

    const images = await generateReceptionQrPngs(ids);

    expect(images).toHaveLength(ids.length);
    for (const image of images) {
      expect(image).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    }
  });

  it("returns no images for an empty pallet plan", async () => {
    await expect(generateReceptionQrPngs([])).resolves.toEqual([]);
  });
});
