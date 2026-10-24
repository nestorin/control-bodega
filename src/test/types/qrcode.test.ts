import { describe, it, expect } from "vitest";
import {
  parseTarimaQR,
  isValidTarimaQR,
  buildTarimaQR,
  type TarimaQRCode,
  type ParsedQR,
} from "@/types/qrcode";

describe("Tarima QR Code Types", () => {
  describe("parseTarimaQR", () => {
    it("parses valid QR code with numeric OC number", () => {
      const result = parseTarimaQR("TQR-24891-003");
      expect(result).toEqual({ ocNumber: "24891", tarimaIndex: 3 });
    });

    it("parses valid QR code with alphanumeric OC number", () => {
      const result = parseTarimaQR("TQR-ABC123-001");
      expect(result).toEqual({ ocNumber: "ABC123", tarimaIndex: 1 });
    });

    it("parses a canonical QR code bound to a hyphenated reception ID", () => {
      const result = parseTarimaQR("TQR-reception-op-reception-20261024-001");
      expect(result).toEqual({ ocNumber: "reception-op-reception-20261024", tarimaIndex: 1 });
    });

    it("returns null for non-3-digit index", () => {
      const result = parseTarimaQR("TQR-24891-3");
      expect(result).toBeNull();
    });

    it("returns null for wrong prefix", () => {
      const result = parseTarimaQR("QR-24891-003");
      expect(result).toBeNull();
    });

    it("returns null for missing index", () => {
      const result = parseTarimaQR("TQR-24891");
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = parseTarimaQR("");
      expect(result).toBeNull();
    });
  });

  describe("isValidTarimaQR", () => {
    it("returns true for valid QR code", () => {
      const result = isValidTarimaQR("TQR-24891-003");
      expect(result).toBe(true);
    });

    it("accepts canonical reception IDs while retaining legacy OC identifiers", () => {
      expect(isValidTarimaQR("TQR-reception-op-reception-20261024-001")).toBe(true);
      expect(isValidTarimaQR("TQR-24891-003")).toBe(true);
    });

    it("returns false for invalid QR code", () => {
      const result = isValidTarimaQR("invalid");
      expect(result).toBe(false);
    });

    it("returns false for wrong prefix", () => {
      const result = isValidTarimaQR("QR-24891-003");
      expect(result).toBe(false);
    });

    it("returns false for non-3-digit index", () => {
      const result = isValidTarimaQR("TQR-24891-3");
      expect(result).toBe(false);
    });
  });

  describe("buildTarimaQR", () => {
    it("builds QR code with numeric OC number", () => {
      const result = buildTarimaQR("24891", 3);
      expect(result).toBe("TQR-24891-003");
    });

    it("builds QR code with alphanumeric OC number and pads index", () => {
      const result = buildTarimaQR("ABC", 12);
      expect(result).toBe("TQR-ABC-012");
    });

    it("builds canonical QR IDs from stable reception document IDs", () => {
      expect(buildTarimaQR("reception-op-reception-20261024", 1)).toBe(
        "TQR-reception-op-reception-20261024-001",
      );
    });

    it("pads single digit index to 3 digits", () => {
      const result = buildTarimaQR("OC1", 1);
      expect(result).toBe("TQR-OC1-001");
    });

    it("handles double digit index", () => {
      const result = buildTarimaQR("OC1", 12);
      expect(result).toBe("TQR-OC1-012");
    });

    it("handles triple digit index", () => {
      const result = buildTarimaQR("OC1", 123);
      expect(result).toBe("TQR-OC1-123");
    });
  });

  describe("Type guards", () => {
    it("isValidTarimaQR narrows type to TarimaQRCode", () => {
      const qr: string = "TQR-24891-003";
      if (isValidTarimaQR(qr)) {
        const typed: TarimaQRCode = qr;
        expect(typed).toBe("TQR-24891-003");
      }
    });
  });
});
