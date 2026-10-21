import * as XLSX from "xlsx";

export const INVENTORY_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const INVENTORY_IMPORT_MAX_ROWS = 5000;

export interface InventoryImportRow {
  rowNumber: number;
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface InventoryImportPreview {
  validRows: InventoryImportRow[];
  errors: Array<{
    rowNumber: number;
    message: string;
  }>;
}

const aliases: Record<string, string> = {
  productid: "productId",
  producto: "productId",
  product: "productId",
  sku: "productId",
  warehouseid: "warehouseId",
  almacen: "warehouseId",
  almacén: "warehouseId",
  warehouse: "warehouseId",
  quantity: "quantity",
  cantidad: "quantity",
  cajas: "quantity",
  stock: "quantity",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function parseInventoryImport(
  input: ArrayBuffer | Uint8Array,
  fileName = "inventory.xlsx",
): InventoryImportPreview {
  if (input.byteLength > INVENTORY_IMPORT_MAX_BYTES) {
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: "El archivo supera el límite de 10 MB." }],
    };
  }
  const workbook = XLSX.read(input, { type: "array", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet)
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: "El archivo no contiene hojas." }],
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
    };
  }
  const validRows: InventoryImportRow[] = [];
  const errors: InventoryImportPreview["errors"] = [];
  rows.forEach((raw, index) => {
    const mapped: Record<string, unknown> = {};
    Object.entries(raw).forEach(([key, value]) => {
      const alias = aliases[normalizeHeader(key)];
      if (alias) mapped[alias] = value;
    });
    const productId = String(mapped.productId ?? "").trim();
    const warehouseId = String(mapped.warehouseId ?? "").trim();
    const rawQuantity = String(mapped.quantity ?? "").trim();
    // Blank quantity is an explicit zero; identifiers remain mandatory.
    const quantity = rawQuantity === "" ? 0 : Number(rawQuantity.replace(",", "."));
    const rowNumber = index + 2;
    if (
      !productId ||
      !warehouseId ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > 100000
    ) {
      errors.push({
        rowNumber,
        message: "productId, warehouseId y quantity entera entre 0 y 100000 son obligatorios.",
      });
      return;
    }
    validRows.push({ rowNumber, productId, warehouseId, quantity });
  });
  return { validRows, errors };
}

export function buildInventoryImportRows(preview: InventoryImportPreview): InventoryImportRow[] {
  const merged = new Map<string, InventoryImportRow>();
  preview.validRows.forEach((row) => {
    const key = `${row.warehouseId}:${row.productId}`;
    const previous = merged.get(key);
    merged.set(key, previous ? { ...row, quantity: previous.quantity + row.quantity } : row);
  });
  return Array.from(merged.values());
}
