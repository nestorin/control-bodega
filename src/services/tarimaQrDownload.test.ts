import { beforeEach, describe, expect, it, vi } from "vitest";

const { toString, toDataURL } = vi.hoisted(() => ({
  toString: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: { toString, toDataURL },
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210 } };
    addImage = vi.fn();
    setFontSize = vi.fn();
    text = vi.fn();
    output = vi.fn(() => new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  },
}));

import { createTarimaQrFile } from "@/services/tarimaQrDownload";

const QR_IDENTIFIER = "TQR-REC-2026-1035-003";
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

describe("createTarimaQrFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toString.mockResolvedValue(`<svg>${QR_IDENTIFIER}</svg>`);
    toDataURL.mockResolvedValue(PNG_DATA_URL);
  });

  it("creates a real SVG QR from the exact pallet identifier", async () => {
    const file = await createTarimaQrFile(QR_IDENTIFIER, "SVG");

    expect(toString).toHaveBeenCalledWith(QR_IDENTIFIER, expect.objectContaining({ type: "svg" }));
    expect(file.type).toBe("image/svg+xml;charset=utf-8");
    await expect(file.text()).resolves.toContain(QR_IDENTIFIER);
  });

  it("creates a PNG QR with the correct file signature and identifier input", async () => {
    const file = await createTarimaQrFile(QR_IDENTIFIER, "PNG");

    expect(toDataURL).toHaveBeenCalledWith(QR_IDENTIFIER, expect.any(Object));
    expect(file.type).toBe("image/png");
    expect([...new Uint8Array(await file.arrayBuffer()).slice(0, 4)]).toEqual([137, 80, 78, 71]);
  });

  it("converts the QR to a valid JPEG file", async () => {
    class FakeImage {
      naturalWidth = 512;
      naturalHeight = 512;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {}
    }
    vi.stubGlobal("Image", FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })),
    });

    const file = await createTarimaQrFile(QR_IDENTIFIER, "JPEG");

    expect(toDataURL).toHaveBeenCalledWith(QR_IDENTIFIER, expect.any(Object));
    expect(file.type).toBe("image/jpeg");
    expect(await file.text()).toBe("jpeg");
  });

  it("creates a valid PDF containing a QR generated from the exact identifier", async () => {
    const file = await createTarimaQrFile(QR_IDENTIFIER, "PDF");

    expect(toDataURL).toHaveBeenCalledWith(QR_IDENTIFIER, expect.any(Object));
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.4");
  });

  it("rejects missing identifiers instead of downloading a static placeholder", async () => {
    await expect(createTarimaQrFile("   ", "PNG")).rejects.toThrow(/identificador QR/);
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
