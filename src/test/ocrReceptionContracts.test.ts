import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { normalizeOcrResponse } from "@/services/domain/ocrMapper"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import {
  getReceptionOcrDocumentType,
  mapOcrProductsToReceptionForm,
  mapReceptionFormToPersistence,
} from "@/services/receptionMappers"

describe("OCR application contract", () => {
  it("normalizes backend and compatibility product fields once", () => {
    const result = normalizeOcrResponse(
      {
        success: true,
        ocr: { blocks: [], full_text: "OC" },
        parsed: {
          proveedor_posible: "Proveedor Norte",
          productos: [
            {
              linea: 1,
              codigo: "ABC-1",
              nombre: "Producto A",
              unidad: "cajas",
              cantidad: 12,
              precio: 10,
              importe: 120,
              confianza: 0.9,
            },
            {
              linea: 2,
              codigo: "ABC-2",
              nombre: "Producto B",
              unidad: "piezas",
              cantidad: 24,
              precio: 5,
              importe: 120,
              confianza: 0.8,
            },
          ],
        },
      },
      "oc",
    )

    expect(result.parsed.proveedor).toBe("Proveedor Norte")
    expect(result.parsed.productos).toMatchObject([
      { unidad: "cajas", cantidad: 12 },
      { unidad: "piezas", cantidad: 24 },
    ])
    expect(result.parsed.productos[0]).not.toHaveProperty("unidades")
    expect(result.parsed.productos[0]).not.toHaveProperty("u_med")
  })

  it("selects OC vs CFDI explicitly", () => {
    expect(getReceptionOcrDocumentType(true)).toBe("oc")
    expect(getReceptionOcrDocumentType(false)).toBe("cfdi")
  })
})

describe("reception UI/domain boundaries", () => {
  const catalog = [
    {
      id: "product-1",
      nombre: "Agua Mineral",
      sku: "SKU-1",
      unidad: "cajas",
      codigosProveedor: ["SUP-1"],
    },
  ]

  it("maps canonical OCR products to the reception form", () => {
    const [product] = mapOcrProductsToReceptionForm(
      [
        {
          linea: 1,
          codigo: "sup-1",
          nombre: "Texto OCR",
          unidad: "piezas",
          cantidad: 8,
          precio: 3,
          importe: 24,
          confianza: 0.9,
        },
      ],
      catalog,
    )

    expect(product).toEqual({
      productId: "product-1",
      codigo: "SKU-1",
      nombre: "Agua Mineral",
      unidad: "cajas",
      cantidad: 8,
      importe: 24,
      estadoMatch: "confirmado",
    })
  })

  it("creates a DRAFT persistence request without UI-only fields", () => {
    const products = mapOcrProductsToReceptionForm([], catalog)
    products.push({
      productId: "product-1",
      codigo: "SKU-1",
      nombre: "Agua Mineral",
      unidad: "cajas",
      cantidad: 8,
      importe: 24,
      estadoMatch: "confirmado",
    })
    const request = mapReceptionFormToPersistence({
      products,
      warehouseId: WAREHOUSE_IDS.NORTH,
      supplierId: "supplier-1",
      actorUserId: "user-1",
      operationId: "operation-1",
    })

    expect(request.reception).toEqual({
      warehouseId: WAREHOUSE_IDS.NORTH,
      supplierId: "supplier-1",
      status: "DRAFT",
      actorUserId: "user-1",
      operationId: "operation-1",
    })
    expect(request.lines).toEqual([
      {
        productId: "product-1",
        quantity: 8,
        unit: "cajas",
        palletsCreated: 0,
      },
    ])
    expect(request.reception).not.toHaveProperty("proveedor")
    expect(request.reception).not.toHaveProperty("productos")
  })
})

describe("reception preview rules contract", () => {
  it("limits DRAFT preview updates to validated metadata", () => {
    const rules = readFileSync("firestore.rules", "utf8")
    const previewRule = rules.match(
      /function isValidDraftPreviewUpdate\(\) \{([\s\S]*?)\n        \}/,
    )?.[1]

    expect(previewRule).toContain("resource.data.status == 'DRAFT'")
    expect(previewRule).toContain(
      "request.auth.uid == resource.data.actorUserId",
    )
    expect(previewRule).toContain(
      ".hasOnly(['invoicePreviewPath', 'invoicePreviewUrl', 'updatedAt'])",
    )
    expect(previewRule).toContain("'receptions/' + receptionId")
    expect(
      rules.match(/isValidReception\(request\.resource\.data\)/g),
    ).toHaveLength(2)
  })
})
