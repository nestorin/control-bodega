/**
 * Tests for receptionMappers service
 */

import { describe, it, expect } from "vitest"
import {
  getReceptionOcrDocumentType,
  mapOcrProductsToReceptionForm,
  mapReceptionFormToPersistence,
} from "@/services/receptionMappers"
import { createMockOcrProduct } from "@/test/utils/testUtils"

describe("receptionMappers - Service mappers", () => {
  const mockCatalog = [
    {
      id: "prod-1",
      nombre: "AZUCAR",
      codigosProveedor: ["AZU001"],
      sku: "AZU001",
      unidad: "cajas",
      tipo: "materia_prima",
      status: "ACTIVE",
    },
    {
      id: "prod-2",
      nombre: "CAFE",
      codigosProveedor: ["CAF002"],
      sku: "CAF002",
      unidad: "cajas",
      tipo: "materia_prima",
      status: "ACTIVE",
    },
  ]

  describe("getReceptionOcrDocumentType", () => {
    it("returns 'oc' when hasOC is true", () => {
      expect(getReceptionOcrDocumentType(true)).toBe("oc")
    })

    it("returns 'cfdi' when hasOC is false", () => {
      expect(getReceptionOcrDocumentType(false)).toBe("cfdi")
    })
  })

  describe("mapOcrProductsToReceptionForm", () => {
    it("maps OCR products to reception form with catalog match", () => {
      const ocrProducts = [
        createMockOcrProduct({
          linea: 1,
          codigo: "AZU001",
          nombre: "AZUCAR",
          cantidad: 50,
          precio: 120,
          importe: 6000,
        }),
        createMockOcrProduct({
          linea: 2,
          codigo: "CAF002",
          nombre: "CAFE",
          cantidad: 12,
          precio: 450,
          importe: 5400,
        }),
        createMockOcrProduct({
          linea: 3,
          codigo: "XYZ999",
          nombre: "NO EXISTE",
          cantidad: 10,
          precio: 100,
          importe: 1000,
        }),
      ]

      const result = mapOcrProductsToReceptionForm(ocrProducts, mockCatalog)

      expect(result).toHaveLength(3)
      expect(result[0]).toMatchObject({
        productId: "prod-1",
        codigo: "AZU001",
        nombre: "AZUCAR",
        cantidad: 50,
        estadoMatch: "confirmado",
      })
      expect(result[1]).toMatchObject({
        productId: "prod-2",
        codigo: "CAF002",
        nombre: "CAFE",
        cantidad: 12,
        estadoMatch: "confirmado",
      })
      expect(result[2]).toMatchObject({
        productId: null,
        nombre: "NO EXISTE",
        cantidad: 10,
        estadoMatch: "sugerido",
      })
    })

    it("filters out products with cantidad <= 0", () => {
      const ocrProducts = [
        createMockOcrProduct({ linea: 1, cantidad: 10 }),
        createMockOcrProduct({ linea: 2, cantidad: 0 }),
        createMockOcrProduct({ linea: 3, cantidad: -5 }),
      ]

      const result = mapOcrProductsToReceptionForm(ocrProducts, mockCatalog)
      expect(result).toHaveLength(1)
    })

    it("matches by codigo proveedor when nombre doesn't match", () => {
      const ocrProducts = [
        createMockOcrProduct({
          linea: 1,
          codigo: "AZU001-ALT",
          nombre: "AZUCAR REFINADA",
          cantidad: 5,
        }),
      ]

      const result = mapOcrProductsToReceptionForm(ocrProducts, mockCatalog)
      expect(result[0].productId).toBe("prod-1")
      expect(result[0].estadoMatch).toBe("confirmado")
    })

    it("matches a Firestore product by SKU when supplier codes are absent", () => {
      const result = mapOcrProductsToReceptionForm(
        [
          createMockOcrProduct({
            codigo: "CB0301",
            nombre: "BEBIDA DESCRITA POR OCR",
          }),
        ],
        [
          {
            id: "firestore-product-1",
            nombre: "BEBIDA CANÓNICA",
            sku: "CB0301",
            unidad: "cajas",
          },
        ],
      )

      expect(result[0]).toMatchObject({
        productId: "firestore-product-1",
        estadoMatch: "confirmado",
      })
    })
  })

  describe("mapReceptionFormToPersistence", () => {
    it("creates correct persistence structure", () => {
      const products = [
        {
          productId: "prod-1",
          codigo: "AZU001",
          nombre: "AZUCAR",
          unidad: "CAJA",
          cantidad: 50,
          importe: 6000,
          estadoMatch: "confirmado",
        },
        {
          productId: "prod-2",
          codigo: "CAF002",
          nombre: "CAFE",
          unidad: "CAJA",
          cantidad: 12,
          importe: 5400,
          estadoMatch: "confirmado",
        },
      ]

      const result = mapReceptionFormToPersistence({
        products,
        warehouseId: "wh-1",
        supplierId: "sup-1",
        actorUserId: "user-1",
        operationId: "op-123",
      })

      expect(result.reception).toEqual({
        status: "DRAFT",
        warehouseId: "wh-1",
        supplierId: "sup-1",
        actorUserId: "user-1",
        operationId: "op-123",
      })

      expect(result.lines).toHaveLength(2)
      expect(result.lines[0]).toEqual({
        productId: "prod-1",
        quantity: 50,
        unit: "CAJA",
        palletsCreated: 0,
      })
      expect(result.lines[1]).toEqual({
        productId: "prod-2",
        quantity: 12,
        unit: "CAJA",
        palletsCreated: 0,
      })
    })

    it("filters out unmatched products", () => {
      const products = [
        {
          productId: "prod-1",
          codigo: "AZU001",
          nombre: "AZUCAR",
          unidad: "CAJA",
          cantidad: 50,
          importe: 6000,
          estadoMatch: "confirmado",
        },
        {
          productId: null,
          codigo: "XYZ",
          nombre: "NO MATCH",
          unidad: "CAJA",
          cantidad: 10,
          importe: 1000,
          estadoMatch: "sugerido",
        },
      ]

      const result = mapReceptionFormToPersistence({
        products,
        warehouseId: "wh-1",
        supplierId: "sup-1",
        actorUserId: "user-1",
        operationId: "op-123",
      })

      expect(result.lines).toHaveLength(1)
      expect(result.lines[0].productId).toBe("prod-1")
    })

    it("persists a valid selected product ID even when OCR match state is suggested", () => {
      const result = mapReceptionFormToPersistence({
        products: [
          {
            productId: "firestore-product-1",
            codigo: "CB0301",
            nombre: "BEBIDA CANÓNICA",
            unidad: "cajas",
            cantidad: 4,
            importe: 0,
            estadoMatch: "sugerido",
          },
        ],
        warehouseId: "wh-1",
        actorUserId: "user-1",
        operationId: "op-selected-product",
      })

      expect(result.lines).toEqual([
        {
          productId: "firestore-product-1",
          quantity: 4,
          unit: "cajas",
          palletsCreated: 0,
        },
      ])
    })

    it("handles empty products array", () => {
      const result = mapReceptionFormToPersistence({
        products: [],
        warehouseId: "wh-1",
        supplierId: "sup-1",
        actorUserId: "user-1",
        operationId: "op-123",
      })

      expect(result.lines).toHaveLength(0)
    })
  })
})

// Mock data helpers
function createMockOcrProduct(overrides = {}) {
  return {
    linea: 1,
    codigo: "AZU001",
    nombre: "AZUCAR",
    unidad: "CAJA",
    cantidad: 50,
    precio: 120,
    importe: 6000,
    confianza: 0.95,
    ...overrides,
  }
}

const mockCatalog = [
  {
    id: "prod-1",
    nombre: "AZUCAR",
    codigosProveedor: ["AZU001"],
    sku: "AZU001",
    tipo: "materia_prima",
    status: "ACTIVE",
  },
  {
    id: "prod-2",
    nombre: "CAFE",
    codigosProveedor: ["CAF002"],
    sku: "CAF002",
    tipo: "materia_prima",
    status: "ACTIVE",
  },
]
