/**
 * Tests for zodSchemas validation
 */

import { describe, it, expect } from "vitest";
import {
  validateReceptionData,
  validateReceptionDoc,
  validateReceptionLine,
  ReceptionDataSchema,
  ReceptionDocSchema,
  ReceptionLineSchema,
} from "@/services/firestore/zodSchemas";

describe("zodSchemas - Firestore validation schemas", () => {
  const validReceptionDoc = {
    id: "rec_123",
    folio: "OC-2024-001",
    fecha: "2024-01-15",
    proveedor: "Proveedor S.A. de C.V.",
    proveedorLogistico: "Logística Express",
    warehouseId: "alm_norte",
    supplierId: "prov_001",
    total: "625.00",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  };

  const validReceptionLine = {
    id: "line_123",
    productId: "prod_123",
    codigo: "ABC123",
    nombre: "Producto de prueba",
    unidad: "cajas",
    cantidad: 10,
    precio: 50.0,
    importe: 500.0,
    estadoMatch: "confirmado",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  };

  const validConversion = {
    producto: "Producto de prueba",
    codigo: "ABC123",
    unidades: 100,
    cajas: 10,
    cajasPorTarima: 10,
    tarimas: 1,
    stickers: 4,
    conversionMatch: true,
  };

  const validReceptionData = {
    folio: "OC-2024-001",
    fecha: "2024-01-15",
    proveedor: "Proveedor S.A. de C.V.",
    proveedorLogistico: "Logística Express",
    warehouseId: "alm_norte",
    supplierId: "prov_001",
    total: "625.00",
    lineas: [validReceptionLine],
    tarimasTotal: 1,
    conversiones: [validConversion],
  };

  describe("validateReceptionData", () => {
    it("validates complete reception data", () => {
      const result = validateReceptionData(validReceptionData);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("rejects missing folio", () => {
      const result = validateReceptionData({ ...validReceptionData, folio: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some((e) => e.includes("folio"))).toBe(true);
    });

    it("rejects invalid fecha format", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        fecha: "15-01-2024",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects missing proveedor", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        proveedor: "",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects missing warehouseId", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        warehouseId: "",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects missing supplierId", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        supplierId: "",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects empty lineas", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        lineas: [],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects line with cantidad <= 0", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        lineas: [{ ...validReceptionData.lineas[0], cantidad: 0 }],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects invalid estadoMatch", () => {
      const result = validateReceptionData({
        ...validReceptionData,
        lineas: [{ ...validReceptionData.lineas[0], estadoMatch: "invalido" }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateReceptionDoc", () => {
    it("validates complete reception doc", () => {
      const result = validateReceptionDoc(validReceptionDoc);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid fecha format", () => {
      const result = validateReceptionDoc({
        ...validReceptionDoc,
        fecha: "15-01-2024",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = validateReceptionDoc({ ...validReceptionDoc, folio: "" });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateReceptionLine", () => {
    it("validates complete reception line", () => {
      const result = validateReceptionLine(validReceptionLine);
      expect(result.valid).toBe(true);
    });

    it("rejects empty nombre", () => {
      const result = validateReceptionLine({
        ...validReceptionLine,
        nombre: "",
      });
      expect(result.valid).toBe(false);
    });

    it("rejects negative cantidad", () => {
      const result = validateReceptionLine({
        ...validReceptionLine,
        cantidad: -1,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects invalid estadoMatch", () => {
      const result = validateReceptionLine({
        ...validReceptionLine,
        estadoMatch: "invalido" as any,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("Schema parsing", () => {
    it("parses valid data with ReceptionDataSchema", () => {
      const parsed = ReceptionDataSchema.parse(validReceptionData);
      expect(parsed.folio).toBe("OC-2024-001");
      expect(parsed.lineas).toHaveLength(1);
    });

    it("parses valid doc with ReceptionDocSchema", () => {
      const parsed = ReceptionDocSchema.parse(validReceptionDoc);
      expect(parsed.folio).toBe("OC-2024-001");
    });

    it("parses valid line with ReceptionLineSchema", () => {
      const parsed = ReceptionLineSchema.parse(validReceptionLine);
      expect(parsed.nombre).toBe("Producto de prueba");
    });
  });
});
