# Technical Design: Caso 2 - Complete TarimaDetalle to Read Real Tarima Data from Firestore by QR Code

## Overview

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Change ID**      | `tarima-detalle-qr`                          |
| **Project**        | `exepa-logistica` (Control de Bodega v1.4)   |
| **Spec Reference** | `openspec/changes/tarima-detalle-qr/spec.md` |
| **TDD Mode**       | Strict (`pnpm test:run`)                     |
| **Artifact Store** | Engram + OpenSpec                            |

---

## 1. Architecture Diagram (Component + Data Flow)

```mermaid
flowchart TD
    subgraph UI["Presentation Layer"]
        EQ[EscanearQR<br/>Camera + Manual Input]
        TD[TarimaDetalle<br/>Detail View]
        APP[App.tsx<br/>Router + State]
    end

    subgraph SERVICES["Service Layer"]
        PALLET[PalletService<br/>getByQR]
        PROD[ProductService<br/>getById]
        SUPP[SupplierService<br/>getById]
    end

    subgraph DATA["Data Layer (Firestore Emulator)"]
        PALLETS[(pallets<br/>collection group)]
        PRODUCTS[(products)]
        SUPPLIERS[(suppliers)]
    end

    EQ -->|onFound(qrCode)| APP
    APP -->|pendingQrCode| TD
    TD -->|qrCode prop| PALLET
    PALLET -->|PalletDoc| TD
    TD -->|productId| PROD
    PROD -->|Product| TD
    TD -->|supplierId| SUPP
    SUPP -->|Supplier| TD
    PALLET -.->|collectionGroup query<br/>where qrIdentifier ==| PALLETS
    PROD -.->|getDoc| PRODUCTS
    SUPP -.->|getDoc| SUPPLIERS

    style EQ fill:#e3f2fd
    style TD fill:#e8f5e9
    style APP fill:#fff3e0
    style PALLET fill:#fce4ec
    style PROD fill:#fce4ec
    style SUPP fill:#fce4ec
```

### Data Flow Sequence

```
User scans QR "TQR-24891-003"
         │
         ▼
EscanearQR.onFound("TQR-24891-003")
         │
         ▼
App.tsx: setPendingQrCode("TQR-24891-003")
         │
         ▼
Navigate to /tarima-detalle (mode="qr")
         │
         ▼
TarimaDetalle receives qrCode="TQR-24891-003"
         │
         ├─► Show Loading Skeleton
         │
         ├─► pallets.getByQR("TQR-24891-003")
         │        │
         │        ▼
         │   Collection Group Query on `pallets`
         │   where qrIdentifier == "TQR-24891-003"
         │        │
         │        ▼
         │   Returns PalletDoc (or null)
         │
         ├─► If found:
         │        ├─► productService.getById(pallet.productId)
         │        ├─► supplierService.getById(product.supplierId || reception.supplierId)
         │        └─► Build TarimaDetailView
         │
         ├─► If not found: Show "Tarima no encontrada"
         │
         └─► If error: Show toast + retry button
```

---

## 2. Component Interfaces (TypeScript Contracts)

### 2.1 New Types

```typescript
// src/types/qrcode.ts
export type TarimaQRCode = `TQR-${string}-${string}`;

export interface ParsedQR {
  ocNumber: string;
  tarimaIndex: number;
}

export function parseTarimaQR(qr: string): ParsedQR | null;
export function isValidTarimaQR(qr: string): qr is TarimaQRCode;
export function buildTarimaQR(ocNumber: string, tarimaIndex: number): TarimaQRCode;
```

```typescript
// src/types/tarimaDetail.ts
import { PalletDoc } from "@/services/firestore/types";
import { Timestamp } from "firebase/firestore";

export interface TarimaDetailView {
  // From PalletDoc
  qrIdentifier: string;
  lot: string;
  expiryDate: Timestamp;
  quantity: number;
  unit: string;
  status: PalletDoc["status"];
  location?: string;
  notes?: string;
  createdAt: Timestamp;

  // Joined
  productName: string;
  productCode: string;
  supplierName: string;
  supplierCode?: string;

  // Optional context
  receptionFolio?: string;
  receptionDate?: Timestamp;
}

export type TarimaDetailState =
  | { status: "loading" }
  | { status: "success"; data: TarimaDetailView }
  | { status: "not-found"; qrCode: string }
  | { status: "error"; message: string; retry: () => void };
```

### 2.2 Modified Components

```typescript
// src/screens/TarimaDetalle.tsx
interface TarimaDetalleProps {
  /** QR code from EscanearQR flow (Caso 2) */
  qrCode?: string;

  /** Legacy flow from Recepciones (Caso 1 - backward compat) */
  currentReception?: ReceptionDoc;
  tarimaActual?: number;
  onBack?: () => void;
}

// Internal state machine
type InternalState = TarimaDetailState;
```

```typescript
// src/App.tsx (additions)
interface AppState {
  // ... existing
  pendingQrCode: string | null;
  clearPendingQrCode: () => void;
}
```

### 2.3 Service Interfaces (Existing — Verified)

```typescript
// src/services/firestore/domainServices.ts (line 347)
interface PalletService {
  getByQR(qrIdentifier: string): Promise<PalletDoc | null>;
  // ... other methods
}

// Factory exposes:
const { pallets } = createFirestoreServices(db, orgId);
// pallets.getByQR(qrIdentifier)
```

---

## 3. Service Layer Design

### 3.1 PalletService.getByQR (Already Implemented)

```typescript
// domainServices.ts:347-353
async getByQR(qrIdentifier: string): Promise<PalletDoc | null> {
  const q = query(
    collectionGroup(this.db, 'pallets'),
    where('qrIdentifier', '==', qrIdentifier),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as PalletDoc;
}
```

**Index Required:** `firestore.indexes.json` must contain:

```json
{
  "collectionGroup": "pallets",
  "fields": [{ "fieldPath": "qrIdentifier", "order": "ASCENDING" }]
}
```

### 3.2 Join Strategy (Product + Supplier)

```typescript
// TarimaDetalle internal logic
async function fetchTarimaDetail(qrCode: string): Promise<TarimaDetailView> {
  const pallet = await pallets.getByQR(qrCode);
  if (!pallet) throw new NotFoundError(qrCode);

  const [product, supplier] = await Promise.all([
    products.getById(pallet.productId),
    // Supplier via product.supplierId or reception lookup
    suppliers.getById(product?.supplierId || pallet.supplierId),
  ]);

  return {
    qrIdentifier: pallet.qrIdentifier,
    lot: pallet.lot,
    expiryDate: pallet.expiryDate,
    quantity: pallet.quantity,
    unit: pallet.unit,
    status: pallet.status,
    location: pallet.location,
    notes: pallet.notes,
    createdAt: pallet.createdAt,
    productName: product?.name ?? pallet.productId,
    productCode: product?.code ?? "—",
    supplierName: supplier?.name ?? "—",
    supplierCode: supplier?.code,
    // reception context optional
  };
}
```

### 3.3 Error Handling in Service Layer

| Error Type                    | Handling                                        |
| ----------------------------- | ----------------------------------------------- |
| `permission-denied`           | Throw `AuthError` → UI shows "Sin permisos"     |
| `unavailable` (emulator down) | Throw `NetworkError` → UI shows retry           |
| `not-found`                   | Return `null` → UI shows "Tarima no encontrada" |
| `join missing`                | Use fallback IDs; log warning; don't crash      |

---

## 4. State Management

### 4.1 App.tsx — Global Pending QR

```typescript
// App.tsx
const [pendingQrCode, setPendingQrCode] = useState<string | null>(null);

const handleQRFound = useCallback((qr: string) => {
  setPendingQrCode(qr);
  navigate('/tarima-detalle');
}, [navigate]);

const clearPendingQrCode = useCallback(() => {
  setPendingQrCode(null);
}, []);

// Pass to TarimaDetalle route
<TarimaDetalle qrCode={pendingQrCode} onBack={clearPendingQrCode} />
```

### 4.2 TarimaDetalle — Internal State Machine

```typescript
// TarimaDetalle.tsx
const [state, setState] = useState<TarimaDetailState>({ status: 'loading' });

useEffect(() => {
  if (!qrCode) {
    // Legacy mode: use currentReception + tarimaActual
    setState({ status: 'success', data: buildFromReception() });
    return;
  }

  let cancelled = false;
  setState({ status: 'loading' });

  fetchTarimaDetail(qrCode)
    .then(data => { if (!cancelled) setState({ status: 'success', data }); })
    .catch(err => {
      if (cancelled) return;
      if (err instanceof NotFoundError) {
        setState({ status: 'not-found', qrCode });
      } else {
        setState({
          status: 'error',
          message: err.message,
          retry: () => fetchTarimaDetail(qrCode).then(...)
        });
      }
    });

  return () => { cancelled = true; };
}, [qrCode]);
```

### 4.3 Render Logic by State

| State       | Render                                                       |
| ----------- | ------------------------------------------------------------ |
| `loading`   | Skeleton cards (shimmer)                                     |
| `success`   | Full detail grid with joined data                            |
| `not-found` | Centered "Tarima no encontrada" + "Volver al escáner" button |
| `error`     | Toast + inline error card with "Reintentar" button           |

---

## 5. Navigation Flow

### 5.1 Route Definition (App.tsx)

```typescript
// Existing route
<Route path="/tarima-detalle" element={<TarimaDetalle />} />

// No new routes needed — qrCode passed as prop via App state
```

### 5.2 EscanearQR → App → TarimaDetalle

```typescript
// EscanearQR.tsx (existing)
interface Props {
  onFound: (id: string) => void;
  onClose: () => void;
}

// App.tsx
const handleQRFound = (qr: string) => {
  setPendingQrCode(qr);
  navigate('/tarima-detalle');
};

// TarimaDetalle receives via prop
<TarimaDetalle qrCode={pendingQrCode} onBack={clearPendingQrCode} />
```

### 5.3 Back Navigation

| Flow                        | Back Behavior                                                   |
| --------------------------- | --------------------------------------------------------------- |
| QR Scan → TarimaDetalle     | `onBack` → `clearPendingQrCode()` → `navigate(-1)` → EscanearQR |
| Recepciones → TarimaDetalle | Existing `onBack` prop (unchanged)                              |
| Error/Not-Found             | Buttons call `onBack` or `retry()`                              |

---

## 6. Test Strategy

### 6.1 Unit Tests

| File                                              | Coverage                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/test/types/qrcode.test.ts`                   | `parseTarimaQR`, `isValidTarimaQR`, `buildTarimaQR` — valid, invalid, edge cases |
| `src/test/services/palletService.getByQR.test.ts` | `PalletService.getByQR` against emulator — found, not-found, error               |

### 6.2 Component Tests (Vitest + RTL)

| File                                            | Coverage                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/test/components/TarimaDetalle.qr.test.tsx` | Render with `qrCode` prop → loading → success/not-found/error states; mock service factory |

```typescript
// Test pattern
vi.mock("@/services/firestore", () => ({
  createFirestoreServices: () => ({
    pallets: { getByQR: vi.fn() },
    products: { getById: vi.fn() },
    suppliers: { getById: vi.fn() },
  }),
}));
```

### 6.3 Integration Tests (Emulator)

| File                                                | Coverage                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/test/integration/tarimaQR.integration.test.ts` | Full service chain: write pallet + product + supplier → `getByQR` → verify joins |

```typescript
// Runs against emulator
beforeAll(async () => {
  await setupEmulator();
});
afterAll(async () => {
  await teardownEmulator();
});
```

### 6.4 E2E Tests (Playwright)

| File                                | Coverage                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/test/e2e/tarimaQRFlow.test.ts` | Launch app → click "Escanear QR" → mock camera input → verify navigation → verify detail view renders correct data |

```typescript
// Playwright mock QR input
await page.fill('[data-testid="qr-input"]', "TQR-24891-003");
await page.click('[data-testid="qr-submit"]');
await expect(page.locator('[data-testid="product-name"]')).toHaveText("Manzana Gala");
```

---

## 7. Error Handling Strategy

| Layer     | Error                    | User-Facing                 | Recovery                         |
| --------- | ------------------------ | --------------------------- | -------------------------------- |
| Parser    | Invalid format           | Inline error in EscanearQR  | Stay on screen, correct input    |
| Service   | Not found                | "Tarima no encontrada" card | "Volver al escáner" button       |
| Service   | Network                  | Toast "Error de conexión"   | "Reintentar" button (re-fetches) |
| Service   | Permission               | Toast "Sin permisos"        | Log out/in; contact admin        |
| Join      | Missing product/supplier | Show IDs as fallback        | No crash; log warning            |
| Component | Unexpected               | Error boundary catches      | Show generic error + reload      |

**Toast System:** Use existing `useToast()` hook (already in project).

---

## 8. Rollback Plan

If integration fails in `sdd-apply` or `sdd-verify`:

1. **Git revert** to commit before `tarima-detalle-qr` apply started
2. **Feature flag** (optional): wrap new logic in `if (import.meta.env.VITE_ENABLE_QR_TARIMA)`
3. **Hotfix branch**: isolate fix, re-run verify, then re-apply
4. **Rollback trigger**: Any CRITICAL in verify report, or AC-09/AC-10 failure

---

## 9. File-by-File Implementation Plan (Matches Spec §7)

| Order | File                                              | Action                                                      | Tests                       |
| ----- | ------------------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| 1     | `src/types/qrcode.ts`                             | Create type + parser + unit tests                           | `qrcode.test.ts`            |
| 2     | `src/test/types/qrcode.test.ts`                   | Unit tests for parser                                       | —                           |
| 3     | `src/test/services/palletService.getByQR.test.ts` | Integration test vs emulator                                | —                           |
| 4     | `src/types/tarimaDetail.ts`                       | Create `TarimaDetailView` + `TarimaDetailState`             | —                           |
| 5     | `src/screens/TarimaDetalle.tsx`                   | Refactor: accept `qrCode` prop, state machine, fetch + join | `TarimaDetalle.qr.test.tsx` |
| 6     | `src/test/components/TarimaDetalle.qr.test.tsx`   | Component tests (mock services)                             | —                           |
| 7     | `src/App.tsx`                                     | Add `pendingQrCode` state + pass to route                   | —                           |
| 8     | `src/test/e2e/tarimaQRFlow.test.ts`               | Playwright E2E full flow                                    | —                           |
| 9     | Cleanup                                           | Remove hardcoded `tarimaNum = 3` mock constants             | —                           |

---

## 10. Dependencies Verification

| Dependency                          | Status                                  |
| ----------------------------------- | --------------------------------------- |
| `firebase/firestore`                | ✅ In `package.json`                    |
| `@zxing/browser`                    | ✅ Used by `EscanearQR`                 |
| `vitest` + `@testing-library/react` | ✅ Configured                           |
| `playwright`                        | ✅ Configured                           |
| Firestore emulator                  | ✅ `./scripts/emulator-dev.sh up` works |
| Composite index `qrIdentifier`      | ⚠️ Verify in `firestore.indexes.json`   |

---

## 11. Security Considerations

- **No new permissions**: `PalletService.getByQR` uses existing org-scoped query
- **Input validation**: `parseTarimaQR` rejects malformed input before Firestore call
- **No sensitive data in QR**: QR only contains `TQR-{oc}-{index}` — no PII
- **Audit**: All reads go through service factory with `orgId` context

---

## 12. Performance Notes

- **Single fetch + 2 parallel joins** = ~3 round trips (acceptable for < 500ms)
- **No real-time listener** — single `getDocs` is sufficient for read-only detail
- **Skeleton loading** improves perceived performance
- **Memoization**: `TarimaDetailView` built once per `qrCode` change

---

## 13. Accessibility

- Loading skeleton has `aria-busy="true"`
- Error states use `role="alert"` for toast
- "Tarima no encontrada" has `aria-live="polite"`
- Buttons have accessible names (`aria-label`)
- Color contrast meets WCAG AA (Tailwind defaults)

---

## 14. Definition of Done

All Spec AC-01 through AC-12 pass in single `./scripts/emulator-dev.sh test` run.
