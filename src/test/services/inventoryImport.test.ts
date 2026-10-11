import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import {
  buildInventoryImportRows,
  parseInventoryImport,
} from "@/services/inventoryImport"

describe("inventory import", () => {
  it("parses valid rows and reports invalid rows", () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { productId: "p-1", warehouseId: "wh-1", quantity: 4 },
        { productId: "", warehouseId: "wh-1", quantity: 2 },
      ]),
      "Inventory",
    )
    const preview = parseInventoryImport(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    )
    expect(preview.validRows).toHaveLength(1)
    expect(preview.errors).toHaveLength(1)
  })

  it("treats blank quantity as zero while requiring both identifiers", () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { productId: "p-1", warehouseId: "wh-1", quantity: "" },
        { productId: "", warehouseId: "wh-1", quantity: "" },
        { productId: "p-2", warehouseId: "", quantity: "" },
      ]),
      "Inventory",
    )
    const preview = parseInventoryImport(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    )
    expect(preview.validRows).toEqual([
      { rowNumber: 2, productId: "p-1", warehouseId: "wh-1", quantity: 0 },
    ])
    expect(preview.errors).toHaveLength(2)
  })

  it("merges duplicate product/warehouse rows before an authorized write", () => {
    const rows = buildInventoryImportRows({
      validRows: [
        { rowNumber: 2, productId: "p-1", warehouseId: "wh-1", quantity: 4 },
        { rowNumber: 3, productId: "p-1", warehouseId: "wh-1", quantity: 6 },
      ],
      errors: [],
    })
    expect(rows).toEqual([
      { rowNumber: 3, productId: "p-1", warehouseId: "wh-1", quantity: 10 },
    ])
  })
})
