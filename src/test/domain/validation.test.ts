/**
 * Tests for validation domain service
 */

import { describe, it, expect } from "vitest";
import {
  validateReceptionLine,
  validateConversion,
  validateReceptionDraft,
  toPersistedProduct,
  toPersistedConversion,
} from "@/services/domain/validation";
import type { ReceptionLineState, ReceptionConversion } from "@/types/domain";

describe("validation - Domain validation guards", () => {
  const validLine = {
    productId: "prod-1",
    codigo: "AZU001",
    nombre: "AZUCAR",
    unidad: "CAJA",
    cantidad: 50,
    precio: 120,
    importe: 6000,
    estadoMatch: "confirmado" as const,
  };

  const validConversion = {
    producto: "AZUCAR",
    codigo: "AZU001",
    unidades: 50,
    cajas: 50,
    cajasPorTarima: 50,
    tarimas: 1,
    stickers: 4,
    conversionMatch: true,
  };

  describe("validateReceptionLine", () => {
    it("validates correct line", () => {
      const result = validateReceptionLine(validLine);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty nombre", () => {
      const result = validateReceptionLine({ ...validLine, nombre: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Nombre del producto es requerido");
    });

    it("rejects cantidad <= 0", () => {
      expect(validateReceptionLine({ ...validLine, cantidad: 0 }).valid).toBe(false);
      expect(validateReceptionLine({ ...validLine, cantidad: -1 }).valid).toBe(false);
    });

    it("rejects negative precio", () => {
      const result = validateReceptionLine({ ...validLine, precio: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Precio no puede ser negativo");
    });

    it("rejects negative importe", () => {
      const result = validateReceptionLine({ ...validLine, importe: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Importe no puede ser negativo");
    });

    it("rejects invalid estadoMatch", () => {
      const result = validateReceptionLine({
        ...validLine,
        estadoMatch: "invalido" as any,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Estado de match inválido");
    });
  });

  describe("validateConversion", () => {
    it("validates correct conversion", () => {
      const result = validateConversion(validConversion);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty producto", () => {
      const result = validateConversion({ ...validConversion, producto: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Producto es requerido");
    });

    it("rejects negative values", () => {
      expect(validateConversion({ ...validConversion, cajas: -1 }).valid).toBe(false);
      expect(validateConversion({ ...validConversion, cajasPorTarima: 0 }).valid).toBe(false);
      expect(validateConversion({ ...validConversion, tarimas: -1 }).valid).toBe(false);
      expect(validateConversion({ ...validConversion, stickers: -1 }).valid).toBe(false);
    });
  });

  describe("validateReceptionDraft", () => {
    const validDraft = {
      folio: "OC-001",
      fecha: "2024-01-15",
      proveedor: "Proveedor Test",
      proveedorLogistico: "Logistica Test",
      lineas: [validLine],
      warehouseId: "wh-1",
      supplierId: "sup-1",
      tarimasTotal: 2,
      conversiones: [validConversion],
    };

    it("validates complete valid draft", () => {
      const result = validateReceptionDraft(validDraft);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing folio", () => {
      const result = validateReceptionDraft({ ...validDraft, folio: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Folio es requerido");
    });

    it("rejects missing fecha", () => {
      const result = validateReceptionDraft({ ...validDraft, fecha: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Fecha es requerida");
    });

    it("rejects missing proveedor", () => {
      const result = validateReceptionDraft({ ...validDraft, proveedor: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Proveedor es requerido");
    });

    it("rejects missing proveedorLogistico", () => {
      const result = validateReceptionDraft({
        ...validDraft,
        proveedorLogistico: "",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Proveedor logístico es requerido");
    });

    it("rejects missing warehouseId", () => {
      const result = validateReceptionDraft({
        ...validDraft,
        warehouseId: null,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Almacén destino es requerido");
    });

    it("rejects missing supplierId", () => {
      const result = validateReceptionDraft({ ...validDraft, supplierId: null });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Proveedor logístico (ID) es requerido");
    });

    it("rejects empty lineas", () => {
      const result = validateReceptionDraft({ ...validDraft, lineas: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Al menos un producto es requerido");
    });

    it("rejects lineas with cantidad <= 0", () => {
      const draft = { ...validDraft, lineas: [{ ...validLine, cantidad: 0 }] };
      const result = validateReceptionDraft(draft);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Producto 1: Cantidad debe ser mayor a 0");
    });

    it("rejects tarimasTotal <= 0", () => {
      const result = validateReceptionDraft({ ...validDraft, tarimasTotal: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Total de tarimas debe ser mayor a 0");
    });

    it("rejects invalid conversion", () => {
      const draft = {
        ...validDraft,
        conversiones: [{ ...validConversion, cajas: -1 }],
      };
      const result = validateReceptionDraft(draft);
      expect(result.valid).toBe(false);
    });
  });

  describe("toPersistedProduct", () => {
    it("converts valid line to persisted format", () => {
      const result = toPersistedProduct(validLine);
      expect(result).toEqual({
        productId: "prod-1",
        codigo: "AZU001",
        nombre: "AZUCAR",
        unidad: "CAJA",
        cantidad: 50,
        precio: 120,
        importe: 6000,
        estadoMatch: "confirmed",
      });
    });

    it("converts sugerido to unmatched", () => {
      const result = toPersistedProduct({
        ...validLine,
        estadoMatch: "sugerido",
      });
      expect(result.estadoMatch).toBe("unmatched");
    });

    it("converts manual to unmatched", () => {
      const result = toPersistedProduct({ ...validLine, estadoMatch: "manual" });
      expect(result.estadoMatch).toBe("unmatched");
    });

    it("throws on invalid line", () => {
      expect(() => toPersistedProduct({ ...validLine, nombre: "" })).toThrow(
        "Línea inválida para persistir",
      );
    });
  });

  describe("toPersistedConversion", () => {
    it("converts valid conversion to persisted format", () => {
      const result = toPersistedConversion(validConversion);
      expect(result).toEqual({
        producto: "AZUCAR",
        codigo: "AZU001",
        unidades: 50,
        cajas: 50,
        cajasPorTarima: 50,
        tarimas: 1,
        stickers: 4,
        conversionMatch: true,
      });
    });

    it("throws on invalid conversion", () => {
      expect(() => toPersistedConversion({ ...validConversion, cajas: -1 })).toThrow(
        "Conversión inválida para persistir",
      );
    });
  });
});
