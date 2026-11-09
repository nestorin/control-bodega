# Specification: CSV Import

## Overview

Bulk import of catalog data (products, suppliers, conversions, warehouses) via CSV/TSV files with validation, preview, and atomic commit.

## User Stories

### US-1: Download Template

**As an** operator
**I want to** download a CSV template for each catalog type
**So that** I know the exact column format required

**Acceptance Criteria:**

- Template buttons visible in Import tab
- Downloads `.csv` with headers + 2 example rows
- UTF-8 encoding, comma delimiter

### US-2: Select & Parse File

**As an** operator
**I want to** select a CSV file and see parsed rows
**So that** I can verify content before importing

**Acceptance Criteria:**

- File input accepts `.csv`, `.tsv`, `.txt`
- PapaParse streams file (no full memory load)
- Shows first 100 rows in preview table
- Displays row count, columns detected

### US-3: Validation Preview

**As an** operator
**I want to** see which rows are valid/invalid with reasons
**So that** I can fix data before committing

**Acceptance Criteria:**

- Each row marked ✓ Valid or ✗ Invalid
- Invalid rows show specific error(s): missing required, type mismatch, duplicate SKU, unknown warehouse
- Summary: "X valid, Y invalid"
- Filter: All / Valid / Invalid

### US-4: Commit Import

**As an** operator
**I want to** commit valid rows to Firestore
**So that** catalogs are updated atomically

**Acceptance Criteria:**

- Only valid rows committed
- Batched writes (500 ops/batch)
- Progress indicator during commit
- Success toast with count
- Catalogos context refreshes automatically
- Import log created in Firestore

### US-5: Import History

**As an** auditor
**I want to** see past imports with status
**So that** I can audit changes

**Acceptance Criteria:**

- Table: date, user, type, file name, rows ok, rows failed, status
- Click row → see error details for failed rows
- Retention: 90 days

## Data Models

### Product CSV

| Column           | Required | Type   | Validation                              |
| ---------------- | -------- | ------ | --------------------------------------- |
| nombre           | ✓        | string | 1-100 chars, unique per org             |
| sku              | ✓        | string | 1-50 chars, alphanumeric + dash, unique |
| categoria        |          | string | 0-50 chars                              |
| unidad           | ✓        | enum   | `cajas` \| `piezas` \| `kg`             |
| codigosProveedor |          | string | comma-separated, trimmed, uppercase     |

### Supplier CSV

| Column   | Required | Type   | Validation                 |
| -------- | -------- | ------ | -------------------------- |
| nombre   | ✓        | string | 1-100 chars                |
| contacto |          | string | 0-100 chars                |
| telefono |          | string | 0-20 chars                 |
| email    |          | email  | valid format if provided   |
| tipo     | ✓        | enum   | `mercancia` \| `logistica` |

### Conversion CSV

| Column         | Required | Type   | Validation                                            |
| -------------- | -------- | ------ | ----------------------------------------------------- |
| producto       | ✓        | string | Must match existing product nombre (case-insensitive) |
| piezasPorCaja  | ✓        | int    | >0                                                    |
| cajasPorTarima | ✓        | int    | >0                                                    |
| pesoKgCaja     |          | float  | ≥0, 2 decimals max                                    |

### Warehouse CSV

| Column      | Required | Type   | Validation          |
| ----------- | -------- | ------ | ------------------- |
| nombre      | ✓        | string | 1-100 chars, unique |
| ubicacion   |          | string | 0-200 chars         |
| responsable |          | string | 0-100 chars         |

## Validation Rules

1. **Required fields** — Row invalid if any required column empty
2. **Type coercion** — Numbers parsed strictly, fail on NaN
3. **Uniqueness** — SKU unique across org; warehouse nombre unique
4. **Referential integrity** — Conversion.producto must exist in products catalog
5. **Duplicates in file** — Later rows with same SKU/nombre marked invalid

## Error Codes

| Code                  | Meaning                                      |
| --------------------- | -------------------------------------------- |
| `MISSING_REQUIRED`    | Required column empty                        |
| `INVALID_TYPE`        | Value cannot be coerced to expected type     |
| `DUPLICATE_SKU`       | SKU already exists in org or earlier in file |
| `DUPLICATE_WAREHOUSE` | Warehouse nombre already exists              |
| `UNKNOWN_PRODUCT`     | Conversion references non-existent product   |
| `INVALID_ENUM`        | Value not in allowed enum                    |

## API / Firestore

### Import Log Document

```typescript
interface ImportLog {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  type: "products" | "suppliers" | "conversions" | "warehouses";
  fileName: string;
  fileSize: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  status: "preview" | "committed" | "failed";
  errors: Array<{ row: number; code: string; message: string; data: Record<string, string> }>;
  createdAt: Timestamp;
  committedAt?: Timestamp;
}
```

### Batch Write Pattern

```typescript
const batch = writeBatch(db);
validRows.forEach((row, i) => {
  const ref = doc(collection(db, `organizations/${orgId}/${catalogType}`));
  batch.set(ref, { ...row, createdAt: serverTimestamp() });
  if (i % 500 === 499) { await batch.commit(); batch = writeBatch(db); }
});
await batch.commit();
```

## UI/UX

### Import Tab Layout

```
+--------------------------------------------------+
| Configuracion tabs: [Almacenes] [Conversiones]   |
|                                                  |
| [Importar]                                       |
+--------------------------------------------------+
| Tipo: [Products ▼]  [Descargar plantilla]        |
|                                                  |
| [Seleccionar archivo CSV]  (drag & drop zone)    |
|                                                  |
| Preview table (100 rows max):                    |
| [All] [Valid] [Invalid]    1.234 filas, 12 OK   |
| ┌───┬────────┬─────┬─────────┬────────┬────────┐  │
| │ # │ Status │ SKU │ Nombre  │ ...    │ Errors │  │
| ├───┼────────┼─────┼─────────┼────────┼────────┤  │
| │ 1 │ ✓ OK   │ PRD1│ Agua    │ ...    │ —      │  │
| │ 2 │ ✗ ERR  │ PRD2│         │ ...    │ MISSING│  │
| └───┴────────┴─────┴─────────┴────────┴────────┘  │
|                                                  |
| [Cancelar] [Importar 12 válidas]                 |
+--------------------------------------------------+
```

### Import History Modal

- Button "Historial" opens modal
- Table with pagination (20/page)
- Expand row for error details

## Security

- Only roles with `canQuery` + `GERENTE_ALMACEN` or higher
- Warehouse-level: user can only import to accessible warehouses
- Rate limit: 5 imports/minute per user

## Performance

- Stream parse: `Papa.parse(file, { chunk: ..., step: ... })`
- Preview limited to 100 rows
- Batched Firestore writes (500/batch)
- Debounced validation during preview

## Testing

- Unit: validation functions (each error code)
- Integration: full import flow with mocked Firestore
- E2E: upload valid CSV → verify catalog updated
- Edge: 10k rows, malformed CSV, permission denied
