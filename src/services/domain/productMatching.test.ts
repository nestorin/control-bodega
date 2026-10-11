import { describe, expect, it } from "vitest"
import { normalizeProductToken, resolveCatalogProduct } from "./productMatching"

const catalog = [
  {
    id: "prod-1",
    nombre: "Café Molido 500-g",
    sku: "SKU-500-G",
    unidad: "cajas",
    codigosProveedor: ["CAFE 500 G"],
  },
]

describe("product matching", () => {
  it("normalizes accents, spaces and separators", () => {
    expect(normalizeProductToken(" Café-Molído_500 g ")).toBe("CAFEMOLIDO500G")
  })

  it("resolves the canonical ID from an equivalent name or supplier code", () => {
    expect(
      resolveCatalogProduct(catalog, { name: "cafe molido 500 g" })?.id,
    ).toBe("prod-1")
    expect(resolveCatalogProduct(catalog, { code: "CAFE-500-G" })?.id).toBe(
      "prod-1",
    )
  })

  it("prefers an exact product ID and fails closed when unmatched", () => {
    expect(
      resolveCatalogProduct(catalog, { productId: "prod-1", code: "other" })
        ?.id,
    ).toBe("prod-1")
    expect(resolveCatalogProduct(catalog, { code: "unknown" })).toBeNull()
  })
})
