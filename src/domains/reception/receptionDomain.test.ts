import { describe, it, expect } from "vitest";
import {
  ocrProductsToMatchedProducts,
  calculateConversions,
  calculateTotalTarimas,
  buildReceptionDraft,
  validateReceptionDraft,
  CATALOGO_CONVERSIONES_DEFAULT,
} from "@/domains/reception/receptionDomain";
import type { OcrProduct, Producto, ReceptionLineState } from "@/types/domain";

// ===== FIXTURES =====

const mockOcrProducts: OcrProduct[] = [
  {
    linea: 1,
    codigo: "AZU001",
    nombre: "AZUCAR",
    unidad: "CAJA",
    cantidad: 50,
    precio: 120,
    importe: 6000,
    confianza: 0.95,
  },
  {
    linea: 2,
    codigo: "CAF002",
    nombre: "CAFE",
    unidad: "CAJA",
    cantidad: 12,
    precio: 450,
    importe: 5400,
    confianza: 0.92,
  },
  {
    linea: 3,
    codigo: "CHI003",
    nombre: "CHILE",
    unidad: "PIEZA",
    cantidad: 100,
    precio: 25,
    importe: 2500,
    confianza: 0.88,
  },
  {
    linea: 4,
    codigo: null,
    nombre: "PRODUCTO SIN CODIGO",
    unidad: "UNIDAD",
    cantidad: 0,
    precio: 100,
    importe: 0,
    confianza: 0.5,
  }, // debería filtrarse
];

const mockCatalog: Producto[] = [
  {
    id: "prod-1",
    nombre: "AZUCAR",
    codigosProveedor: ["AZU001", "AZU001-ALT"],
    tipo: "materia_prima",
    status: "ACTIVE",
  } as Producto,
  {
    id: "prod-2",
    nombre: "CAFE",
    codigosProveedor: ["CAF002"],
    tipo: "materia_prima",
    status: "ACTIVE",
  } as Producto,
  {
    id: "prod-3",
    nombre: "CHILE",
    codigosProveedor: ["CHI003"],
    tipo: "materia_prima",
    status: "ACTIVE",
  } as Producto,
];

// ReceptionLineState list for testing buildReceptionDraft (already processed, no OcrProduct)
const mockReceptionLines: ReceptionLineState[] = [
  {
    productId: "prod-1",
    codigo: "AZU001",
    nombre: "AZUCAR",
    unidad: "CAJA",
    cantidad: 50,
    precio: 120,
    importe: 6000,
    estadoMatch: "confirmado",
  },
  {
    productId: "prod-2",
    codigo: "CAF002",
    nombre: "CAFE",
    unidad: "CAJA",
    cantidad: 12,
    precio: 450,
    importe: 5400,
    estadoMatch: "confirmado",
  },
  {
    productId: "prod-3",
    codigo: "CHI003",
    nombre: "CHILE",
    unidad: "PIEZA",
    cantidad: 100,
    precio: 25,
    importe: 2500,
    estadoMatch: "confirmado",
  },
];

const mockState = {
  folio: "OC-2024-001",
  fecha: "2024-01-15T10:30:00",
  proveedor: "DULCES MEXICO SA DE CV",
  total: "13900.00",
  productos: mockReceptionLines, // Already processed ReceptionLineState[]
  warehouseId: "alm-001",
  supplierId: "sup-001",
  tarimasTotal: 0,
  conversiones: [],
};

describe("receptionDomain - Lógica pura de dominio", () => {
  describe("ocrProductsToMatchedProducts", () => {
    it("debe coincidir productos por nombre exacto", () => {
      const result = ocrProductsToMatchedProducts(mockOcrProducts, mockCatalog);

      expect(result).toHaveLength(3); // el de cantidad 0 se filtra
      expect(result[0].productId).toBe("prod-1");
      expect(result[0].estadoMatch).toBe("confirmado");
      expect(result[1].productId).toBe("prod-2");
      expect(result[1].estadoMatch).toBe("confirmado");
      expect(result[2].productId).toBe("prod-3");
      expect(result[2].estadoMatch).toBe("confirmado");
    });

    it("debe filtrar productos con cantidad <= 0", () => {
      const result = ocrProductsToMatchedProducts(mockOcrProducts, mockCatalog);
      const sinCantidad = result.find((p) => p.nombre === "PRODUCTO SIN CODIGO");
      expect(sinCantidad).toBeUndefined();
    });

    it("debe marcar como 'sugerido' productos no encontrados en catálogo", () => {
      const ocrSinMatch: OcrProduct[] = [
        {
          linea: 1,
          codigo: "XYZ999",
          nombre: "NO EXISTE",
          unidad: "CAJA",
          cantidad: 10,
          precio: 100,
          importe: 1000,
          confianza: 0.8,
        },
      ];
      const result = ocrProductsToMatchedProducts(ocrSinMatch, mockCatalog);
      expect(result).toHaveLength(1);
      expect(result[0].productId).toBeNull();
      expect(result[0].estadoMatch).toBe("sugerido");
    });

    it("debe coincidir por código de proveedor", () => {
      const ocrConCodigo: OcrProduct[] = [
        {
          linea: 1,
          codigo: "AZU001-ALT",
          nombre: "AZUCAR REFINADA",
          unidad: "CAJA",
          cantidad: 5,
          precio: 120,
          importe: 600,
          confianza: 0.9,
        },
      ];
      const result = ocrProductsToMatchedProducts(ocrConCodigo, mockCatalog);
      expect(result[0].productId).toBe("prod-1");
      expect(result[0].estadoMatch).toBe("confirmado");
    });
  });

  describe("calculateConversions", () => {
    it("debe calcular tarimas y stickers correctamente", () => {
      const matched = ocrProductsToMatchedProducts(mockOcrProducts, mockCatalog);
      const conversions = calculateConversions(matched, CATALOGO_CONVERSIONES_DEFAULT);

      expect(conversions).toHaveLength(3);

      // AZUCAR: 50 cajas / 50 por tarima = 1 tarima, 4 stickers
      const azucar = conversions.find((c) => c.producto === "AZUCAR");
      expect(azucar).toBeDefined();
      expect(azucar!.cajas).toBe(50);
      expect(azucar!.cajasPorTarima).toBe(50);
      expect(azucar!.tarimas).toBe(1);
      expect(azucar!.stickers).toBe(4);
      expect(azucar!.conversionMatch).toBe(true);

      // CAFE: 12 cajas / 12 por tarima = 1 tarima, 4 stickers
      const cafe = conversions.find((c) => c.producto === "CAFE");
      expect(cafe).toBeDefined();
      expect(cafe!.cajas).toBe(12);
      expect(cafe!.cajasPorTarima).toBe(12);
      expect(cafe!.tarimas).toBe(1);
      expect(cafe!.stickers).toBe(4);
      expect(cafe!.conversionMatch).toBe(true);

      // CHILE: 100 cajas / 15 por tarima = 7 tarimas, 28 stickers
      const chile = conversions.find((c) => c.producto === "CHILE");
      expect(chile).toBeDefined();
      expect(chile!.cajas).toBe(100);
      expect(chile!.cajasPorTarima).toBe(15);
      expect(chile!.tarimas).toBe(7); // ceil(100/15)
      expect(chile!.stickers).toBe(28);
      expect(chile!.conversionMatch).toBe(true);
    });

    it("debe usar default (10 cajas/tarima) para productos sin conversión", () => {
      const matchedSinConv = [
        {
          productId: "prod-x",
          codigo: "XXX",
          nombre: "PRODUCTO NUEVO",
          unidad: "CAJA",
          cantidad: 25,
          precio: 100,
          importe: 2500,
          estadoMatch: "confirmado" as const,
        },
      ];
      const conversions = calculateConversions(matchedSinConv, CATALOGO_CONVERSIONES_DEFAULT);

      expect(conversions).toHaveLength(1);
      expect(conversions[0].cajasPorTarima).toBe(10); // default
      expect(conversions[0].tarimas).toBe(3); // ceil(25/10)
      expect(conversions[0].conversionMatch).toBe(false);
    });

    it("debe filtrar solo productos 'confirmado'", () => {
      const matchedMixto = [
        {
          productId: "prod-1",
          codigo: "AZU001",
          nombre: "AZUCAR",
          unidad: "CAJA",
          cantidad: 10,
          precio: 120,
          importe: 1200,
          estadoMatch: "confirmado" as const,
        },
        {
          productId: null,
          codigo: "XYZ",
          nombre: "NO CONFIRMADO",
          unidad: "CAJA",
          cantidad: 5,
          precio: 100,
          importe: 500,
          estadoMatch: "sugerido" as const,
        },
        {
          productId: null,
          codigo: null,
          nombre: "MANUAL",
          unidad: "CAJA",
          cantidad: 3,
          precio: 200,
          importe: 600,
          estadoMatch: "manual" as const,
        },
      ];
      const conversions = calculateConversions(matchedMixto, CATALOGO_CONVERSIONES_DEFAULT);
      expect(conversions).toHaveLength(1);
      expect(conversions[0].producto).toBe("AZUCAR");
    });
  });

  describe("calculateTotalTarimas", () => {
    it("debe sumar tarimas de todas las conversiones", () => {
      const conversions = [
        { producto: "A", tarimas: 2, stickers: 8 } as any,
        { producto: "B", tarimas: 5, stickers: 20 } as any,
        { producto: "C", tarimas: 1, stickers: 4 } as any,
      ];
      expect(calculateTotalTarimas(conversions)).toBe(8);
    });

    it("debe devolver 0 para array vacío", () => {
      expect(calculateTotalTarimas([])).toBe(0);
    });
  });

  describe("buildReceptionDraft", () => {
    it("debe construir draft completo con todos los campos", () => {
      const draft = buildReceptionDraft(mockState, CATALOGO_CONVERSIONES_DEFAULT);

      expect(draft.folio).toBe("OC-2024-001");
      expect(draft.fecha).toBe("2024-01-15T10:30:00");
      expect(draft.proveedor).toBe("DULCES MEXICO SA DE CV");
      expect(draft.total).toBe("13900.00");
      expect(draft.warehouseId).toBe("alm-001");
      expect(draft.supplierId).toBe("sup-001");
      expect(draft.lineas).toHaveLength(3);
      expect(draft.conversiones).toHaveLength(3);
      expect(draft.tarimasTotal).toBeGreaterThan(0);
    });
  });

  describe("validateReceptionDraft", () => {
    it("debe validar draft completo correctamente", () => {
      const draft = buildReceptionDraft(mockState, CATALOGO_CONVERSIONES_DEFAULT);
      const result = validateReceptionDraft(draft);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("debe rechazar draft sin folio", () => {
      const draft = {
        ...buildReceptionDraft(mockState, mockCatalog, CATALOGO_CONVERSIONES_DEFAULT),
        folio: "",
      };
      const result = validateReceptionDraft(draft);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Folio es requerido");
    });

    it("debe rechazar draft sin almacén", () => {
      const draft = {
        ...buildReceptionDraft(mockState, mockCatalog, CATALOGO_CONVERSIONES_DEFAULT),
        warehouseId: null,
      };
      const result = validateReceptionDraft(draft);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Almacén es requerido");
    });

    it("debe rechazar draft sin líneas", () => {
      const draft = {
        ...buildReceptionDraft(mockState, mockCatalog, CATALOGO_CONVERSIONES_DEFAULT),
        lineas: [],
      };
      const result = validateReceptionDraft(draft);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Debe haber al menos un producto");
    });

    it("debe detectar productos sin cantidad", () => {
      const draft = buildReceptionDraft(mockState, mockCatalog, CATALOGO_CONVERSIONES_DEFAULT);
      draft.lineas[0].cantidad = 0;
      const result = validateReceptionDraft(draft);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("1 producto(s) sin cantidad");
    });
  });
});
