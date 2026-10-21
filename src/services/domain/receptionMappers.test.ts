import { describe, expect, it } from "vitest";
import { matchReceptionLinesToCatalog, ocrResponseToReceptionLines } from "./ocrToReception";
import { programacionToAppReception } from "./programacionToApp";

describe("reception boundary mappers", () => {
  it("normalizes OCR products into UI lines and matches catalog products", () => {
    const response = {
      success: true,
      ocr: { blocks: [], full_text: "" },
      parsed: {
        folio: "OC-1",
        fecha: null,
        proveedor: "Proveedor",
        total: null,
        productos: [
          {
            linea: 1,
            codigo: "SKU-1",
            nombre: "Azucar",
            unidad: "cajas",
            cantidad: 2,
            precio: 10,
            importe: 20,
            confianza: 1,
          },
        ],
        lineas_detectadas: [],
      },
      tipo: "oc" as const,
    };
    const lines = ocrResponseToReceptionLines(response);
    const matched = matchReceptionLinesToCatalog(lines, [
      { id: "p1", nombre: "Azucar", sku: "SKU-1", codigosProveedor: ["SKU-1"] },
    ]);
    expect(matched[0]).toMatchObject({
      productId: "p1",
      estadoMatch: "confirmado",
    });
  });

  it("maps wizard output to App state with a derived pallet total", () => {
    const state = programacionToAppReception({
      hasOC: true,
      ocFolio: "OC-1",
      tarimas: "2",
      proveedor: "P",
      proveedorLogistico: "L",
      productos: [],
      conversionesTabla: [
        {
          producto: "A",
          codigo: null,
          unidades: 1,
          cajas: 2,
          cajasPorTarima: 2,
          tarimas: 1,
          stickers: 4,
          conversionMatch: true,
        },
      ],
    });
    expect(state.tarimasTotal).toBe(1);
    expect(state.conversiones).toHaveLength(1);
  });
});
