# Proposal: CSV Import & Inventory Grid View

## Change ID

`csv-import-grid-view`

## Problem Statement

Operators currently manage inventory catalogs (products, suppliers, conversions, warehouses) manually through the Configuracion screen. For warehouses with hundreds of SKUs, this is time-consuming and error-prone. We need:

1. **CSV Import** — Bulk upload products, suppliers, conversions, and warehouses from spreadsheet exports (Excel/CSV)
2. **Inventory Grid View** — Monthly dashboard showing boxes received per product, with totals per month and grand totals

## Target Users

- **Almacenista / Auxiliar** — Daily operators who receive CSV files from procurement/ERP
- **Gerente de Almacén** — Needs monthly visibility for capacity planning
- **Auditor** — Requires traceable import logs

## Scope

### In Scope

- **CSV Import** (Configuracion screen, new "Importar" tab):
  - Products: nombre, sku, categoria, unidad, codigosProveedor (comma-separated)
  - Suppliers: nombre, contacto, telefono, email, tipo (mercancia/logistica)
  - Conversions: producto, piezasPorCaja, cajasPorTarima, pesoKgCaja
  - Warehouses: nombre, ubicacion, responsable
  - Validation: duplicate detection, required fields, type coercion
  - Preview before commit, rollback on error
  - Import log (timestamp, user, rows imported/failed, file name)

- **Inventory Grid View** (Inventario screen, new "Grid" tab):
  - Rows: Products (from catalog)
  - Columns: Months (Jan–Dec, dynamic based on data)
  - Cells: # cajas received that month
  - Row totals: Sum across months
  - Column totals: Sum per month
  - Grand total
  - Filter by warehouse, year
  - Export to CSV/PDF

### Out of Scope

- Real-time sync with external ERP
- Scheduled/automated imports
- Multi-org import (single org_exepa_001)
- Advanced transformations (formulas, lookups)

## Success Criteria

1. CSV import handles 1,000+ rows in <10s
2. Grid renders 200 products × 12 months in <2s
3. Zero data loss on validation errors
4. All imports auditable via log

## Technical Approach

- **Parser**: PapaParse (already in deps) for CSV/TSV
- **Validation**: Zod schemas matching Firestore types
- **Import**: Batched Firestore writes (500 ops/batch)
- **Grid**: TanStack Table (virtualized) or custom CSS Grid
- **Persistence**: Firestore `importLogs` collection + `inventoryMonthly` aggregation

## Dependencies

- Uses existing `useCatalogos`, `useInventory`, `useAuthorization`
- Requires `useFirestoreServices` for batched writes
- New hooks: `useCsvImport`, `useInventoryGrid`

## Risks

| Risk              | Mitigation                                        |
| ----------------- | ------------------------------------------------- |
| Large CSV memory  | Stream parsing, chunked processing                |
| Duplicate SKUs    | Upsert by SKU, show diff preview                  |
| Grid performance  | Virtualization, memoized aggregation              |
| Permission errors | Check `canQuery` + warehouse access before import |

## Acceptance Criteria

- [ ] CSV import tab visible in Configuracion for authorized roles
- [ ] Sample CSV template downloadable
- [ ] Import preview shows valid/invalid rows with reasons
- [ ] Commit writes to Firestore, updates catalogos context
- [ ] Grid tab in Inventario shows monthly boxes per product
- [ ] Totals row/column/grand total correct
- [ ] Filter by warehouse/year works
- [ ] Export CSV matches grid data
