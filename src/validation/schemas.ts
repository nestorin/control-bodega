/**
 * Validation Schemas — CSV Import & Inventory Grid View
 * Uses Zod for runtime validation matching Firestore types
 */

import { z } from "zod";
import type { CatalogType, CsvRow, ValidationCode, ValidationResult } from "@/types/csvImport";

// ─── Zod Schemas per Catalog Type ────────────────────────────────────────────

export const ProductCsvSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  sku: z
    .string()
    .min(1, "SKU requerido")
    .max(50)
    .regex(/^[A-Z0-9\-]+$/i, "SKU solo alfanumérico y guiones"),
  categoria: z.string().max(50).optional().nullable(),
  unidad: z.enum(["cajas", "piezas", "kg"]),
  codigosProveedor: z
    .string()
    .optional()
    .nullable()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean)
        : [],
    ),
});

export const SupplierCsvSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  contacto: z.string().max(100).optional().nullable(),
  telefono: z.string().max(20).optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  tipo: z.enum(["mercancia", "logistica"]),
});

export const ConversionCsvSchema = z.object({
  producto: z.string().min(1, "Producto requerido"),
  piezasPorCaja: z.coerce.number().int().positive("Piezas por caja debe ser > 0"),
  cajasPorTarima: z.coerce.number().int().positive("Cajas por tarima debe ser > 0"),
  pesoKgCaja: z.coerce.number().min(0).max(9999.99).optional().nullable(),
});

export const WarehouseCsvSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  ubicacion: z.string().max(200).optional().nullable(),
  responsable: z.string().max(100).optional().nullable(),
});

export const SCHEMAS: Record<CatalogType, z.ZodSchema<any>> = {
  products: ProductCsvSchema,
  suppliers: SupplierCsvSchema,
  conversions: ConversionCsvSchema,
  warehouses: WarehouseCsvSchema,
};

// ─── Header Mapping ────────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<CatalogType, Record<string, string>> = {
  products: {
    nombre: "nombre",
    producto: "nombre",
    name: "nombre",
    sku: "sku",
    clave: "sku",
    categoria: "categoria",
    category: "categoria",
    unidad: "unidad",
    unit: "unidad",
    codigosproveedor: "codigosProveedor",
    codigos_proveedor: "codigosProveedor",
    supplier_codes: "codigosProveedor",
    codigos: "codigosProveedor",
  },
  suppliers: {
    nombre: "nombre",
    empresa: "nombre",
    contacto: "contacto",
    contact: "contacto",
    telefono: "telefono",
    phone: "telefono",
    email: "email",
    correo: "email",
    tipo: "tipo",
    type: "tipo",
  },
  conversions: {
    producto: "producto",
    product: "producto",
    piezasporcaja: "piezasPorCaja",
    piezas_por_caja: "piezasPorCaja",
    pieces_per_box: "piezasPorCaja",
    cajasportarima: "cajasPorTarima",
    cajas_por_tarima: "cajasPorTarima",
    boxes_per_pallet: "cajasPorTarima",
    pesokgcaja: "pesoKgCaja",
    peso_kg_caja: "pesoKgCaja",
    weight_kg_per_box: "pesoKgCaja",
  },
  warehouses: {
    nombre: "nombre",
    name: "nombre",
    ubicacion: "ubicacion",
    location: "ubicacion",
    direccion: "ubicacion",
    responsable: "responsable",
    manager: "responsable",
    encargado: "responsable",
  },
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "");
}

export function mapHeaders(headers: string[], type: CatalogType): Record<string, string> {
  const aliases = HEADER_ALIASES[type];
  const mapped: Record<string, string> = {};

  headers.forEach((h, i) => {
    const normalized = normalizeHeader(h);
    const canonical = aliases[normalized];
    if (canonical) {
      mapped[canonical] = h; // original header name
    }
  });

  return mapped;
}

// ─── Validation Functions ──────────────────────────────────────────────────────

interface CrossRefs {
  existingSkus: Set<string>;
  existingWarehouseNames: Set<string>;
  existingProductNames: Set<string>; // for conversions
  seenInFile: {
    skus: Set<string>;
    warehouseNames: Set<string>;
  };
}

export function validateRows<T extends CsvRow>(
  rows: Record<string, string>[],
  type: CatalogType,
  crossRefs: CrossRefs,
): ValidationResult[] {
  const schema = SCHEMAS[type];
  const results: ValidationResult[] = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 1; // 1-based
    const errors: ValidationResult["errors"] = [];
    let parsedData: any = {};

    // Map headers to canonical fields
    const headerMap = mapHeaders(Object.keys(row), type);
    const canonicalRow: Record<string, string> = {};

    Object.entries(headerMap).forEach(([canonical, original]) => {
      canonicalRow[canonical] = row[original];
    });

    // Zod validation
    const result = schema.safeParse(canonicalRow);

    if (!result.success) {
      result.error.issues.forEach((e) => {
        const column = e.path.join(".");
        let code: ValidationCode = "INVALID_TYPE";
        let message = e.message;

        if (e.code === "invalid_type") {
          code = "MISSING_REQUIRED";
          message = `${column} es requerido`;
        } else {
          code = "INVALID_ENUM";
          message = `${column}: valor no permitido`;
        }

        errors.push({ code, message, column });
      });
    } else {
      parsedData = result.data;

      // Cross-reference validations
      if (type === "products") {
        if (crossRefs.existingSkus.has(parsedData.sku)) {
          errors.push({
            code: "DUPLICATE_SKU",
            message: `SKU ${parsedData.sku} ya existe en la base de datos`,
            column: "sku",
          });
        }
        if (crossRefs.seenInFile.skus.has(parsedData.sku)) {
          errors.push({
            code: "DUPLICATE_IN_FILE",
            message: `SKU ${parsedData.sku} duplicado en el archivo`,
            column: "sku",
          });
        }
        crossRefs.seenInFile.skus.add(parsedData.sku);
      }

      if (type === "warehouses") {
        if (crossRefs.existingWarehouseNames.has(parsedData.nombre)) {
          errors.push({
            code: "DUPLICATE_WAREHOUSE",
            message: `Almacén ${parsedData.nombre} ya existe`,
            column: "nombre",
          });
        }
        if (crossRefs.seenInFile.warehouseNames.has(parsedData.nombre)) {
          errors.push({
            code: "DUPLICATE_IN_FILE",
            message: `Almacén ${parsedData.nombre} duplicado en el archivo`,
            column: "nombre",
          });
        }
        crossRefs.seenInFile.warehouseNames.add(parsedData.nombre);
      }

      if (type === "conversions") {
        if (!crossRefs.existingProductNames.has(parsedData.producto.toUpperCase())) {
          errors.push({
            code: "UNKNOWN_PRODUCT",
            message: `Producto "${parsedData.producto}" no existe en el catálogo`,
            column: "producto",
          });
        }
      }
    }

    results.push({
      rowIndex,
      data: parsedData as T,
      isValid: errors.length === 0,
      errors,
    });
  });

  return results;
}

export function createEmptyCrossRefs(): CrossRefs {
  return {
    existingSkus: new Set(),
    existingWarehouseNames: new Set(),
    existingProductNames: new Set(),
    seenInFile: {
      skus: new Set(),
      warehouseNames: new Set(),
    },
  };
}

// ─── Template Generation ──────────────────────────────────────────────────────

export function generateCsvTemplate(type: CatalogType): string {
  const headers = Object.keys(HEADER_ALIASES[type])
    .filter((k) => !k.includes("_"))
    .join(",");
  // Use the canonical field names as headers
  const canonicalHeaders = [...new Set(Object.values(HEADER_ALIASES[type]))].join(",");
  const examples = TEMPLATE_EXAMPLES[type];

  const rows = examples.map((ex) => {
    const values = Object.values(ex).map((v) => (Array.isArray(v) ? v.join(";") : (v ?? "")));
    return values.join(",");
  });

  return [canonicalHeaders, ...rows].join("\n");
}

// Import TEMPLATE_EXAMPLES from types
import { TEMPLATE_EXAMPLES } from "@/types/csvImport";
