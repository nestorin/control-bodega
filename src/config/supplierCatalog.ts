import type { Proveedor } from "@/screens/Configuracion";

export const ORGANIZATION_ID = "org_exepa_001";

export const CANONICAL_SUPPLIER_SEED = [
  ["sup_smart_final", "SUP-SNF", "SMART & FINAL"],
  ["sup_el_florido", "SUP-EFL", "EL FLORIDO"],
  ["sup_adelco", "SUP-ADC", "ADELCO"],
  ["sup_adelco_tijuana", "SUP-ADT", "ADELCO TIJUANA"],
  ["sup_soriana", "SUP-SOR", "SORIANA"],
  ["sup_mas_bodega", "SUP-MBD", "MAS BODEGA"],
  ["sup_sams", "SUP-SAM", "SAMS"],
  ["sup_monrich", "SUP-MON", "MONRICH"],
] as const;

export const CANONICAL_LOGISTICS_SUPPLIER_SEED = [
  ["log_veloz", "LOG-VELOZ", "LOGÍSTICA VELOZ"],
  ["log_sur", "LOG-SUR", "LOGÍSTICA SUR"],
] as const;

export type SupplierSeed = (typeof CANONICAL_SUPPLIER_SEED)[number];
export type LogisticsSupplierSeed = (typeof CANONICAL_LOGISTICS_SUPPLIER_SEED)[number];

export const ALL_CANONICAL_SUPPLIER_SEED = [
  ...CANONICAL_SUPPLIER_SEED.map(([id, code, name]) => [id, code, name, "mercancia"] as const),
  ...CANONICAL_LOGISTICS_SUPPLIER_SEED.map(
    ([id, code, name]) => [id, code, name, "logistica"] as const,
  ),
];

export const CANONICAL_SUPPLIER_LOCAL: Proveedor[] = ALL_CANONICAL_SUPPLIER_SEED.map(
  ([id, , nombre, tipo]) => ({
    id,
    nombre,
    contacto: "",
    telefono: "",
    email: "",
    tipo,
  }),
);

export type SupplierType = "mercancia" | "logistica";

export function normalizeSupplierType(
  value: unknown,
  fallback: SupplierType = "mercancia",
): SupplierType {
  return value === "logistica" || value === "mercancia" ? value : fallback;
}

/**
 * Merge records returned by Firestore without inventing documents locally.
 *
 * `fallback` is intentionally opt-in. Production catalogs are authoritative;
 * canonical local data may only be supplied by an explicitly configured mock
 * or fixture caller. A remote record without `tipo` can still inherit the
 * type of a fallback record with the same ID.
 */
export function mergeSupplierCatalog(remote: Proveedor[], fallback: Proveedor[] = []): Proveedor[] {
  const fallbackById = new Map(fallback.map((supplier) => [supplier.id, supplier]));
  const merged = new Map(fallback.map((supplier) => [supplier.id, supplier]));
  remote.forEach((supplier) => {
    const base = fallbackById.get(supplier.id);
    merged.set(supplier.id, {
      ...base,
      ...supplier,
      tipo: normalizeSupplierType(supplier.tipo, base?.tipo),
    });
  });
  return Array.from(merged.values());
}

export function validateExistingSupplier(
  existing: Record<string, unknown>,
  expected: SupplierSeed,
): string[] {
  const [, code, name] = expected;
  const errors: string[] = [];
  if (existing.organizationId !== ORGANIZATION_ID) {
    errors.push(
      `organizationId expected ${ORGANIZATION_ID}, found ${String(existing.organizationId)}`,
    );
  }
  if (existing.code !== code) errors.push(`code expected ${code}, found ${String(existing.code)}`);
  if (existing.name !== name) errors.push(`name expected ${name}, found ${String(existing.name)}`);
  if (existing.tipo !== "mercancia")
    errors.push(`tipo expected mercancia, found ${String(existing.tipo)}`);
  return errors;
}
