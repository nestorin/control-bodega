import * as XLSX from "xlsx";

export const INVENTORY_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const INVENTORY_IMPORT_MAX_ROWS = 5000;

export interface InventoryImportRow {
  rowNumber: number;
  productId?: string;
  productName?: string;
  warehouseId: string;
  quantity: number;
}

export interface InventoryImportPreview {
  validRows: InventoryImportRow[];
  errors: Array<{
    rowNumber: number;
    message: string;
  }>;
  headersDetected: string[];
  mappings: Record<string, string>;
}

const productNameAliases = [
  "articulo",
  "artículo",
  "producto",
  "product",
  "productname",
  "nombre",
  "descripcion",
  "descripción",
];
const warehouseAliases = ["almacen", "almacén", "warehouse", "warehouseid", "bodega", "sucursal"];
const quantityAliases = [
  "existencia",
  "cantidad",
  "cajas",
  "quantity",
  "stock",
  "cantidad_disponible",
];

const aliases: Record<string, string> = {
  productid: "productId",
  sku: "productId",
  ...Object.fromEntries(productNameAliases.map((a) => [a, "productName"])),
  ...Object.fromEntries(warehouseAliases.map((a) => [a, "warehouseId"])),
  ...Object.fromEntries(quantityAliases.map((a) => [a, "quantity"])),
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractProductNameFromArticulo(value: string): string {
  // "CL0101 LECHE EVAPORADA 360 GRS C/48 PZS S" -> "LECHE EVAPORADA 360 GRS C/48 PZS S"
  const parts = value.trim().split(/\s+/);
  if (parts.length <= 1) return value.trim();
  // Skip first token if it looks like a SKU (alphanumeric with no spaces)
  if (/^[A-Z0-9]+$/.test(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return value.trim();
}

export function parseInventoryImport(
  input: ArrayBuffer | Uint8Array,
  fileName = "inventory.xlsx",
  warehouseId?: string,
): InventoryImportPreview {
  if (input.byteLength > INVENTORY_IMPORT_MAX_BYTES) {
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: "El archivo supera el límite de 10 MB." }],
      headersDetected: [],
      mappings: {},
    };
  }
  const workbook = XLSX.read(input, { type: "array", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet)
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: "El archivo no contiene hojas." }],
      headersDetected: [],
      mappings: {},
    };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  if (rows.length > INVENTORY_IMPORT_MAX_ROWS) {
    return {
      validRows: [],
      errors: [
        {
          rowNumber: 0,
          message: `El archivo supera el límite de ${INVENTORY_IMPORT_MAX_ROWS} filas.`,
        },
      ],
      headersDetected: [],
      mappings: {},
    };
  }

  // Detect headers and build mappings
  const firstRow = rows[0] || {};
  const rawHeaders = Object.keys(firstRow);
  const mappings: Record<string, string> = {};
  const headersDetected: string[] = [];

  rawHeaders.forEach((header) => {
    const normalized = normalizeHeader(header);
    const alias = aliases[normalized];
    if (alias) {
      mappings[header] = alias;
      headersDetected.push(header);
    }
  });

  const validRows: InventoryImportRow[] = [];
  const errors: InventoryImportPreview["errors"] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const mapped: Record<string, unknown> = {};

    Object.entries(raw).forEach(([key, value]) => {
      const alias = mappings[key];
      if (alias) mapped[alias] = value;
    });

    // Extract productName from "Articulo" field if present
    let productName = String(mapped.productName ?? "").trim();
    if (!productName && raw["Articulo"]) {
      productName = extractProductNameFromArticulo(String(raw["Articulo"]));
    } else if (!productName && raw["articulo"]) {
      productName = extractProductNameFromArticulo(String(raw["articulo"]));
    } else if (!productName && raw["Producto"]) {
      productName = String(raw["Producto"]).trim();
    } else if (!productName && raw["producto"]) {
      productName = String(raw["producto"]).trim();
    } else if (!productName && raw["Product"]) {
      productName = String(raw["Product"]).trim();
    }

    const quantity = String(mapped.quantity ?? "").trim();
    const qty = quantity === "" ? 0 : Number(String(quantity).replace(",", "."));

    // warehouseId from context if not in CSV
    const whId = warehouseId || String(mapped.warehouseId ?? "").trim();

    if (!productName) {
      errors.push({
        rowNumber: index + 2,
        message:
          "No se pudo identificar el nombre del producto (campo Articulo/Producto requerido).",
      });
      return;
    }

    if (!Number.isInteger(qty) || qty < 0 || qty > 100000) {
      errors.push({
        rowNumber,
        message: "Cantidad inválida: debe ser entero entre 0 y 100000.",
      });
      return;
    }

    if (!whId) {
      errors.push({
        rowNumber,
        message: "Almacén no especificado. Seleccione un almacén antes de importar.",
      });
      return;
    }

    validRows.push({
      rowNumber: index + 2,
      productName,
      warehouseId: whId,
      quantity: qty,
    });
  });

  return { validRows, errors, headersDetected, mappings };
}

export function buildInventoryImportRows(preview: InventoryImportPreview): InventoryImportRow[] {
  const merged = new Map<string, InventoryImportRow>();
  preview.validRows.forEach((row) => {
    const key = `${row.warehouseId}:${row.productName || row.productId || ""}`;
    const previous = merged.get(key);
    merged.set(key, previous ? { ...row, quantity: previous.quantity + row.quantity } : row);
  });
  return Array.from(merged.values());
}
