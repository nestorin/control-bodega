import { describe, expect, it } from "vitest";
import { buildTrackingKey, normalizeTrackingKey } from "@/services/labeling/trackingKey";

describe("labeling tracking keys", () => {
  it("builds a deterministic key from product, lot, and expiry", () => {
    expect(buildTrackingKey(" prod-1 ", " lote-a ", "2027-03-15")).toBe("prod-1|LOTE-A|2027-03-15");
  });

  it("normalizes an existing key without allowing empty components", () => {
    expect(normalizeTrackingKey(" prod-1 | lote-a | 2027-03-15 ")).toBe("prod-1|LOTE-A|2027-03-15");
    expect(() => buildTrackingKey("prod-1", "", "2027-03-15")).toThrow(
      "trackingKey components must not be empty",
    );
    expect(() => normalizeTrackingKey("prod-1||2027-03-15")).toThrow(
      "trackingKey components must not be empty",
    );
  });
});
