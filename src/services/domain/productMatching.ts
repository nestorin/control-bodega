import type { Producto } from "@/types/domain";

/** Canonical comparison key for catalog identifiers, names and supplier codes. */
export function normalizeProductToken(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function resolveCatalogProduct(
  catalog: Producto[],
  refs: {
    productId?: string | null;
    name?: string | null;
    code?: string | null;
  },
): Producto | null {
  const id = refs.productId?.trim();
  if (id) {
    const byId = catalog.find((product) => product.id === id);
    if (byId) return byId;
  }

  const tokens = [refs.name, refs.code].map(normalizeProductToken).filter(Boolean);
  if (tokens.length === 0) return null;

  return (
    catalog.find((product) => {
      const productTokens = [product.nombre, product.sku, ...(product.codigosProveedor ?? [])]
        .map(normalizeProductToken)
        .filter(Boolean);
      return tokens.some((token) => productTokens.includes(token));
    }) ?? null
  );
}
