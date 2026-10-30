import { describe, expect, it } from "vitest";
import { buildAuthenticatedEvidenceLink, buildEvidenceShareMessage } from "./evidenceShare";

describe("evidence sharing", () => {
  it("creates an app-local evidence route without embedding a storage URL", () => {
    expect(
      buildAuthenticatedEvidenceLink("reception-123", "https://exepa-almacen-safe.web.app"),
    ).toBe("https://exepa-almacen-safe.web.app/?evidence=reception-123");
  });

  it("does not claim that WhatsApp contains attached photos", () => {
    const message = buildEvidenceShareMessage({
      receptionId: "reception-123",
      supplier: "ADELCO",
      item: "Leche",
      palletCount: 2,
      evidenceLink: "https://exepa-almacen-safe.web.app/?evidence=reception-123",
    });
    expect(message).toContain("vista protegida");
    expect(message).not.toContain("Fotos adjuntas");
  });
});
