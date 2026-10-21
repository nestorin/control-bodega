/**
 * Tests for ocrToReception domain mapper
 */

import { describe, it, expect } from "vitest";
import {
  ocrProductToReceptionLine,
  ocrResponseToReceptionLines,
  isOcrValidForReception,
} from "@/services/domain/ocrToReception";
import { createMockOcrProduct, createMockOcrResponse } from "@/test/utils/testUtils";

describe("ocrToReception - OCR → ReceptionLineState mapper", () => {
  it("converts OcrProduct to ReceptionLineState correctly", () => {
    const ocrProduct = createMockOcrProduct({
      linea: 1,
      codigo: "ABC-123",
      nombre: "AZUCAR",
      unidad: "CAJA",
      cantidad: 50,
      precio: 120,
      importe: 6000,
      confianza: 0.95,
    });

    const result = ocrProductToReceptionLine(ocrProduct);

    expect(result).toEqual({
      productId: null,
      codigo: "ABC-123",
      nombre: "AZUCAR",
      unidad: "CAJA",
      cantidad: 50,
      precio: 120,
      importe: 6000,
      estadoMatch: "sugerido",
    });
  });

  it("converts OcrResponse to ReceptionLineState array", () => {
    const ocrResponse = createMockOcrResponse({
      success: true,
      parsed: {
        folio: "OC-001",
        fecha: "2024-01-15",
        proveedor: "Proveedor Test",
        total: "1000.00",
        productos: [
          createMockOcrProduct({ linea: 1, nombre: "AZUCAR", cantidad: 50 }),
          createMockOcrProduct({ linea: 2, nombre: "CAFE", cantidad: 12 }),
        ],
      },
    });

    const result = ocrResponseToReceptionLines(ocrResponse);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      nombre: "AZUCAR",
      cantidad: 50,
      estadoMatch: "sugerido",
    });
    expect(result[1]).toMatchObject({
      nombre: "CAFE",
      cantidad: 12,
      estadoMatch: "sugerido",
    });
  });

  it("filters out products with cantidad <= 0", () => {
    const ocrResponse = createMockOcrResponse({
      parsed: {
        productos: [
          createMockOcrProduct({ linea: 1, cantidad: 10 }),
          createMockOcrProduct({ linea: 2, cantidad: 0 }),
          createMockOcrProduct({ linea: 3, cantidad: -5 }),
        ],
      },
    });

    const result = ocrResponseToReceptionLines(ocrResponse);
    expect(result).toHaveLength(1);
    expect(result[0].cantidad).toBe(10);
  });

  it("filters out products with empty nombre", () => {
    const ocrResponse = createMockOcrResponse({
      parsed: {
        productos: [
          createMockOcrProduct({ linea: 1, nombre: "VALIDO", cantidad: 10 }),
          createMockOcrProduct({ linea: 2, nombre: "", cantidad: 10 }),
          createMockOcrProduct({ linea: 3, nombre: "   ", cantidad: 10 }),
        ],
      },
    });

    const result = ocrResponseToReceptionLines(ocrResponse);
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe("VALIDO");
  });

  it("validates OCR for reception correctly", () => {
    const validOcr = createMockOcrResponse({
      success: true,
      parsed: {
        productos: [createMockOcrProduct({ cantidad: 10, nombre: "VALIDO" })],
      },
    });

    expect(isOcrValidForReception(validOcr)).toBe(true);
  });

  it("rejects invalid OCR responses", () => {
    // No success
    expect(isOcrValidForReception(createMockOcrResponse({ success: false }))).toBe(false);

    // No productos
    expect(
      isOcrValidForReception(createMockOcrResponse({ success: true, parsed: { productos: [] } })),
    ).toBe(false);

    // Productos sin cantidad válida
    expect(
      isOcrValidForReception(
        createMockOcrResponse({
          success: true,
          parsed: {
            productos: [createMockOcrProduct({ cantidad: 0, nombre: "TEST" })],
          },
        }),
      ),
    ).toBe(false);
  });
});
