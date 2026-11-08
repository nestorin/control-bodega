# Tasks: CSV Import & Inventory Grid View

## Change: `csv-import-grid-view`

## Phase Breakdown

| Phase | Work Units | Description |
|-------|------------|-------------|
| 1 | 3 | Foundation: types, services, hooks |
| 2 | 4 | CSV Import tab (Configuracion) |
| 3 | 4 | Inventory Grid tab (Inventario) |
| 4 | 2 | Aggregation trigger + Firestore indexes |
| 5 | 2 | Testing + Polish |

Total: **15 work units**

---

## Phase 1: Foundation (3 units)

### 1.1 Types & Schemas
**Files:** `src/types/csvImport.ts`, `src/validation/schemas.ts`
- Define `CsvRow`, `ValidationResult`, `ImportLog`, `InventoryMonthly`, `GridRow`, `GridFilters`
- Zod schemas: `ProductCsvSchema`, `SupplierCsvSchema`, `ConversionCsvSchema`, `WarehouseCsvSchema`
- Export types for hooks/components

### 1.2 Services
**Files:** `src/services/csvParser.ts`, `src/services/validation.ts`, `src/services/inventoryAggregator.ts`, `src/services/firestoreBatch.ts`
- `csvParser.parseCsv<T>(file, schema)` — streaming PapaParse
- `validation.validateRows<T>(rows, schema, crossRefs)` — returns `ValidationResult[]`
- `inventoryAggregator.incrementMonthly/decrementMonthly/recomputeMonthly`
- `firestoreBatch.commitBatch(writes)` — 500-op chunks, retry logic

### 1.3 Hooks
**Files:** `src/hooks/useCsvImport.ts`, `src/hooks/useInventoryGrid.ts`, `src/hooks/useImportLog.ts`
- `useCsvImport`: parse, validate, commit, download template
- `useInventoryGrid`: query `inventoryMonthly`, transform to grid, filter, export
- `useImportLog`: paginated log loading

---

## Phase 2: CSV Import Tab (4 units)

### 2.1 Import Tab UI
**Files:** `src/components/configuracion/CsvImportTab.tsx`, `src/components/configuracion/CsvImportTab.stories.tsx`
- Catalog type selector (Products/Suppliers/Conversions/Warehouses)
- Drag-drop file zone + hidden input
- Template download buttons (4 CSVs)
- Preview table (100 rows max) with validation badges
- Filter tabs: All / Valid / Invalid
- Commit button (disabled if no valid rows)
- Toast notifications

### 2.2 Validation & Preview Logic
**Files:** `src/components/configuracion/ValidationPreview.tsx`
- Row-level status: ✓ OK / ✗ ERROR
- Expandable error details per row
- Summary chips: "1.234 filas · 1.200 OK · 34 ERR"
- Column mapping detection (header matching)

### 2.3 Import History Modal
**Files:** `src/components/configuracion/ImportLogModal.tsx`
- Table: date, user, type, file, valid/failed, status
- Expand row → error list with row numbers
- Pagination (20/page, cursor-based)
- Empty state

### 2.4 Configuracion Integration
**Files:** `src/screens/Configuracion.tsx` (modify)
- Add `'importar'` to `TABS` array
- Import `CsvImportTab` and render when `tab === 'importar'`
- Ensure `UploadIcon` component exists

---

## Phase 3: Inventory Grid Tab (4 units)

### 3.1 Grid Tab UI
**Files:** `src/components/inventario/InventoryGridTab.tsx`
- Filter bar: Warehouse select, Year select, Export dropdown (CSV/PDF)
- TanStack Table v8 with `@tanstack/react-virtual`
- Sticky first column (product name)
- Columns: #, Producto, Ene–Dic, Total
- Row totals, column totals, grand total row
- Sortable columns (click header)
- Hover highlight row + column

### 3.2 Grid Data & Interactions
**Files:** `src/components/inventario/GridTable.tsx`, `src/components/inventario/GridTotals.tsx`
- Cell click → `ReceptionBreakdownModal`
- Right-click → copy value
- Keyboard nav: arrows, Enter to open modal
- Responsive: desktop table, tablet horizontal scroll, mobile cards

### 3.3 Reception Breakdown Modal
**Files:** `src/components/inventario/ReceptionBreakdownModal.tsx`
- Title: "Producto X — Enero 2024"
- Table: Fecha, Folio, Proveedor, Cajas, Tarimas
- Link to reception detail (navigate)
- Close on backdrop click / Escape

### 3.4 Inventario Integration
**Files:** `src/screens/Inventario.tsx` (modify or create)
- Add `'grid'` to tabs
- Render `InventoryGridTab` when `tab === 'grid'`
- Ensure `useCatalogos` provides product list for rows

---

## Phase 4: Aggregation + Indexes (2 units)

### 4.1 Reception Aggregation Trigger
**Files:** `src/services/firestore/receptionAggregator.ts` (or extend `fsServices.receptions`)
- In `createReception` / `editReception` / `deleteReception`:
  - For each line: `incrementMonthly(warehouseId, productId, year, month, cajas, tarimas)`
  - Use transaction for atomicity
- Cloud Function alternative: `onWrite` trigger on `receptions/{id}/lines/{lineId}`

### 4.2 Firestore Indexes & Security Rules
**Files:** `firestore.indexes.json`, `firestore.rules`
- Composite indexes:
  - `importLogs`: `organizationId ASC, createdAt DESC`
  - `inventoryMonthly`: `warehouseId ASC, year ASC, month ASC`
  - `inventoryMonthly`: `warehouseId ASC, productId ASC, year ASC`
- Security rules:
  - `importLogs`: create (GERENTE+), read (own + ADMIN/AUDITOR)
  - `inventoryMonthly`: read (warehouse access), write (deny client)

---

## Phase 5: Testing + Polish (2 units)

### 5.1 Unit & Integration Tests
**Files:** `src/test/services/csvParser.test.ts`, `src/test/services/validation.test.ts`, `src/test/hooks/useCsvImport.test.tsx`, `src/test/hooks/useInventoryGrid.test.tsx`, `src/test/components/CsvImportTab.test.tsx`, `src/test/components/InventoryGridTab.test.tsx`
- CSV parse: valid, malformed, encoding, delimiters
- Validation: each error code, cross-ref, duplicates
- Hook: parse→validate→commit flow
- Grid: filter, sort, export, virtualization

### 5.2 E2E Tests
**Files:** `e2e/csv-import.spec.ts`, `e2e/inventory-grid.spec.ts`
- Upload valid CSV → verify catalog updated
- Upload invalid CSV → verify preview shows errors
- Grid: create receptions → verify grid updates
- Export CSV/PDF matches grid data

### 5.3 Polish & Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation throughout
- Loading skeletons for grid
- Error boundaries for import/grid
- Feature flags: `USE_CSV_IMPORT`, `USE_INVENTORY_GRID`

---

## Dependency Graph

```
1.1 → 1.2 → 1.3
    ↓
2.1 → 2.2 → 2.3 → 2.4
    ↓
3.1 → 3.2 → 3.3 → 3.4
    ↓
4.1 → 4.2
    ↓
5.1 → 5.2 → 5.3
```

## Estimated Effort

| Phase | Units | Est. Days |
|-------|-------|-----------|
| 1 | 3 | 2 |
| 2 | 4 | 3 |
| 3 | 4 | 3 |
| 4 | 2 | 1 |
| 5 | 2 | 2 |
| **Total** | **15** | **~11** |

## Acceptance Checklist

- [ ] CSV Import tab in Configuracion with all 4 catalog types
- [ ] Template downloads work
- [ ] Preview shows validation per row
- [ ] Commit writes to Firestore, refreshes catalogos
- [ ] Import history modal shows past imports
- [ ] Grid tab in Inventario with monthly columns
- [ ] Row/column/grand totals correct
- [ ] Filter by warehouse/year works
- [ ] Cell drill-down shows receptions
- [ ] Export CSV/PDF matches grid
- [ ] Aggregation updates on reception create/edit/delete
- [ ] All tests pass (unit + integration + e2e)
- [ ] Typecheck + build clean
- [ ] Feature flags control rollout