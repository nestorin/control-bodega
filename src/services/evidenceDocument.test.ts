import { describe, expect, it } from "vitest";
import { evidenceDocumentPath, validateEvidenceDocument } from "./evidenceDocument";

describe("evidence document", () => {
  it("accepts a bounded PDF and builds its protected path", () => {
    const file = new File(["invoice"], "invoice.pdf", { type: "application/pdf" });
    expect(validateEvidenceDocument(file)).toBeNull();
    expect(evidenceDocumentPath("org-1", "warehouse-1", "reception-1", file)).toBe(
      "organizations/org-1/warehouses/warehouse-1/receptions/reception-1/evidence/documentation.pdf",
    );
  });

  it("rejects unsupported or oversized files", () => {
    expect(
      validateEvidenceDocument(new File(["text"], "invoice.txt", { type: "text/plain" })),
    ).toMatch(/PDF, JPG, PNG o WebP/);
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "invoice.pdf", {
      type: "application/pdf",
    });
    expect(validateEvidenceDocument(oversized)).toMatch(/10 MB/);
  });
});
