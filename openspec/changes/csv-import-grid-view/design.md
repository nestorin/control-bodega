# Design: CSV Import & Inventory Grid View

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        App Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  Configuracion (new "Importar" tab)    Inventario (new "Grid") │
├─────────────────────────────────────────────────────────────────┤
│                        Hooks Layer                              │
│  useCsvImport          useInventoryGrid        useImportLog    │
├─────────────────────────────────────────────────────────────────┤
│                       Service Layer                             │
│  csvParser.ts          inventoryAggregator.ts  firestoreBatch  │
├─────────────────────────────────────────────────────────────────┤
│                       Data Layer                                │
│  Firestore: catalogs, inventoryMonthly, importLogs             │
└─────────────────────────────────────────────────────────────────┘
```

## New Hooks

### `useCsvImport`
```typescript
interface UseCsvImportReturn {
  // State
  previewRows: CsvRow[];           // Parsed rows (max 100)
  validation: ValidationResult[];  // Per-row validation
  isParsing: boolean;
  isCommitting: boolean;
  importLog: ImportLog | null;
  
  // Actions
  parseFile: (file: File, type: CatalogType) => Promise<void>;
  commitImport: () => Promise<void>;
  downloadTemplate: (type: CatalogType) => void;
  clearPreview: () => void;
}
```

### `useInventoryGrid`
```typescript
interface UseInventoryGridReturn {
  // State
  gridData: GridRow[];          // Transformed for TanStack Table
  columnTotals: number[];       // 12 months
  grandTotal: number;
  isLoading: boolean;
  filters: GridFilters;
  
  // Actions
  setFilters: (filters: Partial<GridFilters>) => void;
  exportCsv: () => void;
  exportPdf: () => void;
  refresh: () => void;
}

interface GridFilters {
  warehouseId: string;
  year: number;
}
```

### `useImportLog`
```typescript
interface UseImportLogReturn {
  logs: ImportLog[];
  isLoading: boolean;
  loadMore: () => void;
  hasMore: boolean;
}
```

## Services

### `csvParser.ts`
- PapaParse wrapper with streaming
- Type: `parseCsv<T>(file: File, schema: ZodSchema<T>): Promise<ParseResult<T>>`
- Handles: UTF-8, Latin1, comma/semicolon/tab delimiters
- Returns: `{ rows: T[]; errors: ParseError[]; meta: { lines: number; delimiter: string } }`

### `validation.ts`
- Zod schemas for each catalog type
- Cross-reference validation (conversion.producto → product exists)
- Duplicate detection within file + against Firestore (batched `get`)

### `inventoryAggregator.ts`
- `incrementMonthly(warehouseId, productId, year, month, cajas, tarimas)`
- `decrementMonthly(...)`
- `recomputeMonthly(warehouseId, year)` — full recomputation for repair
- Uses Firestore transactions

### `firestoreBatch.ts`
- `commitBatch<T>(writes: BatchWrite<T>[]): Promise<void>`
- Auto-chunks at 500 ops
- Retries with exponential backoff

## Firestore Collections

### `organizations/{orgId}/importLogs`
```typescript
interface ImportLog {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  type: 'products' | 'suppliers' | 'conversions' | 'warehouses';
  fileName: string;
  fileSize: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  status: 'preview' | 'committed' | 'failed';
  errors: Array<{ row: number; code: string; message: string; data: Record<string, string> }>;
  createdAt: Timestamp;
  committedAt?: Timestamp;
}
```
Indexes: `organizationId + createdAt desc`, `organizationId + userId + createdAt desc`

### `organizations/{orgId}/inventoryMonthly`
```typescript
interface InventoryMonthly {
  id: string; // `${warehouseId}_${productId}_${year}_${month}`
  warehouseId: string;
  productId: string;
  year: number;
  month: number; // 1-12
  cajas: number;
  tarimas: number;
  updatedAt: Timestamp;
  updatedBy: string;
}
```
Indexes: `warehouseId + year + month`, `warehouseId + productId + year`

## UI Components

### `CsvImportTab` (Configuracion)
- Catalog type selector
- File drop zone + input
- Preview table with validation badges
- Template download buttons
- Commit button (disabled if no valid rows)
- History button → `ImportLogModal`

### `InventoryGridTab` (Inventario)
- Filter bar: warehouse select, year select, export dropdown
- TanStack Table with virtualization
- Sticky first column (product name)
- Row/column totals
- Cell click → `ReceptionBreakdownModal`
- Keyboard navigation (arrows, enter)

### `ImportLogModal`
- Table: date, user, type, file, valid/failed, status
- Expandable rows for errors
- Pagination (cursor-based)

## Integration Points

### Configuracion.tsx
```typescript
// Add to TABS array
{ id: 'importar', label: 'Importar', icon: <UploadIcon /> }

// Render in content area
{tab === 'importar' && <CsvImportTab />}
```

### Inventario.tsx (new screen or existing)
- Add "Grid" tab
- Render `InventoryGridTab`

### Reception Flow (auto-aggregation)
- In `useReceptionFlow` or `fsServices.receptions.createReception`:
  - After successful write, call `inventoryAggregator.incrementMonthly` for each line

## Security Rules (Firestore)

```javascript
// importLogs: create only, read own + admins
match /organizations/{orgId}/importLogs/{logId} {
  allow create: if request.auth != null 
    && getUserRole(request.auth.uid) in ['GERENTE_ALMACEN', 'ADMIN', 'SUPER_ADMIN'];
  allow read: if request.auth != null 
    && (resource.data.userId == request.auth.uid 
        || getUserRole(request.auth.uid) in ['ADMIN', 'SUPER_ADMIN', 'AUDITOR']);
}

// inventoryMonthly: write via backend only (Cloud Function or admin SDK)
// Client read only with warehouse access
match /organizations/{orgId}/inventoryMonthly/{docId} {
  allow read: if request.auth != null 
    && hasWarehouseAccess(request.auth.uid, resource.data.warehouseId);
  allow write: if false; // Only backend
}
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| Parse error (malformed CSV) | Toast + show first error line |
| Validation: 0 valid rows | Disable commit, show summary |
| Firestore permission denied | Toast with specific message |
| Network failure mid-commit | Retry 3x, then show "partial commit" dialog |
| Grid query timeout | Show skeleton, retry button |

## Performance Optimizations

1. **CSV Parse**: Web Worker for files > 1MB
2. **Grid**: TanStack Virtual + memoized row getter
3. **Aggregation**: Batched transactions, debounced 100ms
4. **Caching**: Grid data cached per (warehouse, year) in memory

## Migration Strategy

1. Deploy Firestore indexes first
2. Add Cloud Function for aggregation trigger (or use client-side in reception flow)
3. Deploy CSV Import tab behind feature flag `USE_CSV_IMPORT`
4. Deploy Grid tab behind feature flag `USE_INVENTORY_GRID`
5. Enable for pilot warehouse, then roll out

## Dependencies to Add

```json
{
  "papaparse": "^5.4.1",
  "@tanstack/react-table": "^8.11.0",
  "@tanstack/react-virtual": "^3.1.0",
  "zod": "^3.22.0"
}
```

(Already in deps: `jspdf`, `jspdf-autotable`, `date-fns`)