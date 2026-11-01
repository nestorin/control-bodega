import { describe, expect, it } from "vitest";
import { createTarimaQrBatchPdf } from "./tarimaQrDownload";

describe("createTarimaQrBatchPdf", () => {
  it("creates a downloadable PDF containing the unique QR set", async () => {
    const pdf = await createTarimaQrBatchPdf([
      "TQR-REC-2026-1-001",
      "TQR-REC-2026-1-001",
      "TQR-REC-2026-1-002",
    ]);

    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(0);
  });

  it("rejects an empty QR set", async () => {
    await expect(createTarimaQrBatchPdf(["", "  "])).rejects.toThrow(
      "No hay códigos QR para descargar.",
    );
  });
});
