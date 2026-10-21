export interface ShipmentProductLike {
  id: string;
  productId?: string;
  nombre: string;
}

export interface CatalogProductLike {
  id: string;
  nombre: string;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function resolveShipmentProduct<T extends ShipmentProductLike>(
  product: T,
  catalog: CatalogProductLike[],
): T | null {
  const byId = catalog.find(
    (candidate) => candidate.id === product.productId || candidate.id === product.id,
  );
  const byName = catalog.find(
    (candidate) => normalized(candidate.nombre) === normalized(product.nombre),
  );
  const match = byId ?? byName;

  // Existing persisted shipments may reference a catalog that is not loaded;
  // retain those non-temporary IDs. New rows use p-* temporary IDs and must
  // resolve to a catalog product before advancing.
  if (!match && product.id.startsWith("p-")) return null;
  if (!match) return product.nombre.trim() ? product : null;

  return {
    ...product,
    id: match.id,
    productId: match.id,
    nombre: match.nombre,
  };
}

export function normalizeShipmentProducts<T extends ShipmentProductLike>(
  products: T[],
  catalog: CatalogProductLike[],
): T[] | null {
  const normalizedProducts = products.map((product) => resolveShipmentProduct(product, catalog));
  return normalizedProducts.every((product): product is T => product !== null)
    ? normalizedProducts
    : null;
}
