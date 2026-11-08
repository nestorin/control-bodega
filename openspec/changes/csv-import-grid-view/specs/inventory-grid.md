# Specification: Inventory Grid View

## Overview

Monthly dashboard showing boxes received per product, with row/column totals and grand total. Filterable by warehouse and year.

## User Stories

### US-1: View Grid

**As a** warehouse manager
**I want to** see a grid of products × months with box counts
**So that** I can track monthly reception trends

**Acceptance Criteria:**

- Rows: All active products (from catalog)
- Columns: 12 months (Jan–Dec) for selected year
- Cells: Sum of `cajas` received per product per month
- Row total: Sum across 12 months
- Column total: Sum per month across products
- Grand total: Bottom-right corner
- Empty cells show `—` (not 0)

### US-2: Filter by Warehouse & Year

**As a** manager
**I want to** filter the grid by warehouse and year
**So that** I can analyze specific scenarios

**Acceptance Criteria:**

- Warehouse dropdown: all warehouses user has access to
- Year dropdown: 2020–current+1
- Grid updates instantly on filter change
- URL syncs filters (shareable link)

### US-3: Drill-down to Receptions

**As an** auditor
**I want to** click a cell and see the receptions that contributed
**So that** I can verify the numbers

**Acceptance Criteria:**

- Cell click → modal with reception list for that product+month
- Columns: date, folio, supplier, cajas, tarimas
- Link to reception detail

### US-4: Export Grid

**As a** manager
**I want to** export the grid to CSV/PDF
**So that** I can share with leadership

**Acceptance Criteria:**

- CSV: same structure as grid (products × months + totals)
- PDF: landscape, fitted to page, includes filters in header
- Filename: `inventario-grid-{warehouse}-{year}.csv`

## Data Model

### Monthly Aggregation Document

```typescript
interface InventoryMonthly {
  id: string; // `${warehouseId}_${productId}_${year}_${month}` (1-12)
  warehouseId: string;
  productId: string;
  year: number; // 2024
  month: number; // 1-12
  cajas: number;
  tarimas: number;
  updatedAt: Timestamp;
  updatedBy: string;
}
```

### Aggregation Trigger

- On reception create/edit: increment `InventoryMonthly` for each line
- On reception delete: decrement
- Uses Firestore transactions for atomicity

## Grid Computation

### Query Strategy

```typescript
// Single query per grid load
const q = query(
  collection(db, `organizations/${orgId}/inventoryMonthly`),
  where("warehouseId", "==", warehouseId),
  where("year", "==", year),
);
// 12 * productCount docs max (e.g., 12 * 200 = 2,400 docs)
// Transform to grid in memory
```

### Grid Structure

```
                    |  Ene  |  Feb  |  Mar  | ... |  Dic  | Total |
--------------------|-------|-------|-------|-----|-------|-------|
Agua Mineral 600ml  |  120  |  95   |  110  | ... |  130  | 1,350 |
Coca Cola 600ml     |  80   |  100  |  90   | ... |  110  | 1,050 |
...                 |  ...  |  ...  |  ...  | ... |  ...  |  ...  |
--------------------|-------|-------|-------|-----|-------|-------|
Total               |  200  |  195  |  200  | ... |  240  | 2,400 |
```

### Sorting

- Default: Product nombre A-Z
- Click column header: sort by that month (desc/asc)
- Click "Total" column: sort by annual total

### Virtualization

- TanStack Table v8 with `@tanstack/react-virtual`
- Row height: 44px
- Overscan: 10 rows
- Handles 1,000+ products smoothly

## UI/UX

### Grid Tab Layout (Inventario screen)

```
+------------------------------------------------------------------+
| Inventario tabs: [Lista] [Movimientos] [Grid]                    |
+------------------------------------------------------------------+
| Filtros:  [Almacén: Norte ▼]  [Año: 2024 ▼]  [Exportar ▼]       |
+------------------------------------------------------------------+
| Grid (virtualized):                                              |
| ┌────┬────────────────┬────┬────┬────┬────┬────┬────┬────┬────┐  │
| │ #  │ Producto       │Ene │Feb │Mar │Abr │May │Jun │... │Total│  │
| ├────┼────────────────┼────┼────┼────┼────┼────┼────┼────┼────┤  │
| │ 1  │ Agua 600ml     │120 │ 95 │110 │105 │130 │125 │... │1350 │  │
| │ 2  │ Coca Cola 600ml│ 80 │100 │ 90 │ 85 │110 │105 │... │1050 │  │
| │ 3  │ Sabritas 45g   │200 │180 │210 │190 │220 │200 │... │2100 │  │
| └────┴────────────────┴────┴────┴────┴────┴────┴────┴────┴────┘  │
| TOTAL         2400  1950  2100  2000  2300  2200 ...  24000      │
+------------------------------------------------------------------+
| [← Mes anterior]  Ene 2024 – Dic 2024  [Mes siguiente →]         |
+------------------------------------------------------------------+
```

### Cell Interaction

- Hover: highlight row + column
- Click cell → modal with reception breakdown
- Right-click → copy value

### Responsive

- Desktop: full grid
- Tablet: horizontal scroll, sticky first column
- Mobile: card view per product (month chips)

## Security

- Read access: `canQuery` + warehouse access
- No write access from grid (read-only)
- Aggregation writes via backend triggers only

## Performance Targets

| Metric                   | Target  |
| ------------------------ | ------- |
| Grid load (200 products) | < 800ms |
| Filter change re-render  | < 200ms |
| Scroll 100 rows          | 60fps   |
| Export CSV (200×12)      | < 500ms |

## Testing

- Unit: aggregation logic, grid transform
- Integration: filter + query + render
- E2E: create receptions → verify grid updates
- Load: 500 products × 12 months

## Dependencies

- `@tanstack/react-table` v8
- `@tanstack/react-virtual` v3
- `jspdf` + `jspdf-autotable` for PDF export
- Existing: `useInventory`, `useAuthorization`, `useCatalogos`
