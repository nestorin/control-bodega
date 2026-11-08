import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildInventoryImportRows, parseInventoryImport } from "@/services/inventoryImport";

describe("inventory import", () => {
  it("parses valid rows and reports invalid rows", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { producto: "p-1", almacen: "wh-1", cantidad: 4 },
        { producto: "", almacen: "wh-1", cantidad: 2 },
      ]),
      "Inventory",
    );
    const preview = parseInventoryImport(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "test.xlsx", "wh-1");
    expect(preview.validRows).toHaveLength(1);
    expect(preview.errors).toHaveLength(1);
  });

  it("treats blank quantity as zero while requiring both identifiers", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { producto: "p-1", almacen: "wh-1", cantidad: "" },
        { producto: "", almacen: "wh-1", cantidad: "" },
        { producto: "p-2", almacen: "", cantidad: "" },
      ]),
      "Inventory",
    );
    const preview = parseInventoryImport(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "test.xlsx", "wh-1");
    expect(preview.validRows).toEqual([
      { rowNumber: 2, productName: "p-1", warehouseId: "wh-1", quantity: 0 },
      { rowNumber: 4, productName: "p-2", warehouseId: "wh-1", quantity: 0 },
    ]);
    expect(preview.errors).toHaveLength(1);
  });

  it("merges duplicate product/warehouse rows before an authorized write", () => {
    const rows = buildInventoryImportRows({
      validRows: [
        { rowNumber: 2, productName: "p-1", warehouseId: "wh-1", quantity: 4 },
        { rowNumber: 3, productName: "p-1", warehouseId: "wh-1", quantity: 6 },
      ],
      errors: [],
    });
    expect(rows).toEqual([{ rowNumber: 3, productName: "p-1", warehouseId: "wh-1", quantity: 10 }]);
  });
});
