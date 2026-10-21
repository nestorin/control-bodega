import { describe, expect, it } from "vitest";
import {
  CANONICAL_SUPPLIER_LOCAL,
  CANONICAL_LOGISTICS_SUPPLIER_SEED,
  mergeSupplierCatalog,
  CANONICAL_SUPPLIER_SEED,
  ORGANIZATION_ID,
  validateExistingSupplier,
} from "./supplierCatalog";

describe("canonical supplier catalog", () => {
  it("contains the canonical merchandise and logistics suppliers", () => {
    expect(CANONICAL_SUPPLIER_SEED).toHaveLength(8);
    expect(CANONICAL_SUPPLIER_LOCAL.map((supplier) => supplier.nombre)).toEqual([
      "SMART & FINAL",
      "EL FLORIDO",
      "ADELCO",
      "ADELCO TIJUANA",
      "SORIANA",
      "MAS BODEGA",
      "SAMS",
      "MONRICH",
      "LOGÍSTICA VELOZ",
      "LOGÍSTICA SUR",
    ]);
    expect(
      new Set([...CANONICAL_SUPPLIER_SEED, ...CANONICAL_LOGISTICS_SUPPLIER_SEED].map(([id]) => id))
        .size,
    ).toBe(10);
    expect(
      new Set(
        [...CANONICAL_SUPPLIER_SEED, ...CANONICAL_LOGISTICS_SUPPLIER_SEED].map(([, code]) => code),
      ).size,
    ).toBe(10);
    expect(
      CANONICAL_SUPPLIER_LOCAL.filter((supplier) => supplier.tipo === "mercancia"),
    ).toHaveLength(8);
    expect(
      CANONICAL_SUPPLIER_LOCAL.filter((supplier) => supplier.tipo === "logistica"),
    ).toHaveLength(2);
  });

  it("is idempotent by accepting an existing matching document", () => {
    const seed = CANONICAL_SUPPLIER_SEED[0];
    expect(
      validateExistingSupplier(
        {
          organizationId: ORGANIZATION_ID,
          code: seed[1],
          name: seed[2],
          tipo: "mercancia",
        },
        seed,
      ),
    ).toEqual([]);
    expect(
      validateExistingSupplier(
        {
          organizationId: ORGANIZATION_ID,
          code: "OTHER",
          name: seed[2],
          tipo: "mercancia",
        },
        seed,
      ),
    ).toContain("code expected SUP-SNF, found OTHER");
  });

  it("does not invent logistics options when Firestore only has merchandise", () => {
    const merged = mergeSupplierCatalog(
      CANONICAL_SUPPLIER_LOCAL.filter((supplier) => supplier.tipo === "mercancia"),
    );
    expect(merged.filter((supplier) => supplier.tipo === "logistica")).toEqual([]);
  });

  it("supports an explicit fixture fallback without changing production defaults", () => {
    const merged = mergeSupplierCatalog(
      CANONICAL_SUPPLIER_LOCAL.filter((supplier) => supplier.tipo === "mercancia"),
      CANONICAL_SUPPLIER_LOCAL,
    );
    expect(merged.filter((supplier) => supplier.tipo === "logistica")).toHaveLength(2);
  });

  it("preserves the canonical logistics type when a remote document omits tipo", () => {
    const remote = CANONICAL_SUPPLIER_LOCAL.filter((supplier) => supplier.id === "log_veloz").map(
      ({ tipo: _tipo, ...supplier }) => supplier as (typeof CANONICAL_SUPPLIER_LOCAL)[number],
    );
    const merged = mergeSupplierCatalog(remote, CANONICAL_SUPPLIER_LOCAL);
    expect(merged.find((supplier) => supplier.id === "log_veloz")?.tipo).toBe("logistica");
  });
});
