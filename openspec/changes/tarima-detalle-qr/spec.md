# Spec: Caso 2 - Complete TarimaDetalle to Read Real Tarima Data from Firestore by QR Code

## Overview

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Change ID**      | `tarima-detalle-qr`                                                                   |
| **Project**        | `exepa-logistica` (Control de Bodega v1.4)                                            |
| **Stack**          | React 18 + TypeScript + Vite + Firebase (Firestore, Auth, Functions Gen2 Python)      |
| **Testing**        | Vitest + React Testing Library (unit/component), Playwright (E2E), Firestore Emulator |
| **TDD Mode**       | Strict (tests first, `pnpm test:run`)                                                 |
| **Artifact Store** | Engram (primary), OpenSpec (this file)                                                |
| **Execution Mode** | Automatic (gatekeeper validates each phase)                                           |

---

## 1. Requirements

### 1.1 Functional Requirements

| ID        | Requirement                                                                                                                                       | Priority | Traceability |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| **FR-01** | Define formal `TarimaQRCode` type and `parseTarimaQR()` parser                                                                                    | P0       | Proposal §1  |
| **FR-02** | Verify `PalletService.getByQR(qrIdentifier)` works against Firestore emulator                                                                     | P0       | Proposal §2  |
| **FR-03** | `TarimaDetalle` accepts optional `qrCode` prop; when provided, fetches real `PalletDoc` via `pallets.getByQR()`                                   | P0       | Proposal §3  |
| **FR-04** | `TarimaDetalle` joins `PalletDoc` with `ProductService.getById(productId)` and `SupplierService` for display fields (product name, supplier name) | P0       | Proposal §3  |
| **FR-05** | `TarimaDetalle` displays loading skeleton, error toast, "Tarima no encontrada" state                                                              | P0       | Proposal §4  |
| **FR-06** | Navigation: `EscanearQR.onFound(qr)` → `App.tsx` sets `pendingQrCode` → `TarimaDetalle` receives `qrCode` prop                                    | P0       | Proposal §3  |
| **FR-07** | Backward compatibility: Recepciones → `TarimaDetalle` (via `currentReception` + `tarimaActual`) continues working unchanged                       | P0       | Proposal §6  |

### 1.2 Non-Functional Requirements

| ID         | Requirement                                      | Metric       |
| ---------- | ------------------------------------------------ | ------------ |
| **NFR-01** | Initial data fetch < 500ms on emulator (cold)    | Latency      |
| **NFR-02** | TypeScript strict mode passes (`pnpm typecheck`) | Type safety  |
| **NFR-03** | ESLint + Prettier pass (`pnpm lint`)             | Code quality |
| **NFR-04** | Test coverage ≥ 90% on new/modified code         | Coverage     |
| **NFR-05** | No regression in existing Recepciones flow       | Regression   |

---

## 2. Data Contracts

### 2.1 QR Code Format

```typescript
// src/types/qrcode.ts
export type TarimaQRCode = `TQR-${string}-${string}`; // e.g., TQR-24891-003

export interface ParsedQR {
  ocNumber: string; // Orden de compra number
  tarimaIndex: number; // 1-based index within the OC
}

export function parseTarimaQR(qr: string): ParsedQR | null {
  const match = qr.match(/^TQR-(.+)-(\d{3})$/);
  if (!match) return null;
  return { ocNumber: match[1], tarimaIndex: parseInt(match[2], 10) };
}
```

**Examples:**

- `TQR-24891-001` → `{ ocNumber: "24891", tarimaIndex: 1 }`
- `TQR-ABC-123-003` → `{ ocNumber: "ABC-123", tarimaIndex: 3 }`
- `INVALID` → `null`

### 2.2 PalletDoc (Existing — `types.ts:127-139`)

```typescript
export interface PalletDoc extends BaseDoc {
  qrIdentifier: string; // Matches TarimaQRCode format
  receptionId: string; // Parent reception document ID
  productId: string; // Reference to products collection
  warehouseId: string; // Reference to warehouses collection
  lot: string; // Lote de producción
  expiryDate: Timestamp; // Fecha de caducidad
  quantity: number; // Cantidad (unidades)
  unit: string; // Unidad de medida (pz, kg, etc.)
  status: "RECEIVED" | "STORED" | "SHIPPED" | "EXPIRED" | "DAMAGED";
  location?: string; // Ubicación en bodega (opcional)
  notes?: string; // Observaciones
}
```

### 2.3 Joined Display Type (New — for TarimaDetalle UI)

```typescript
// src/types/tarimaDetail.ts
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

  // Joined from ProductService
  productName: string;
  productCode: string; // SKU / código interno

  // Joined from SupplierService (via product.supplierId or reception)
  supplierName: string;
  supplierCode?: string;

  // Context from reception (when available)
  receptionFolio?: string;
  receptionDate?: Timestamp;
}
```

### 2.4 Service API

```typescript
// PalletService (existing at domainServices.ts:347)
interface PalletService {
  getByQR(qrIdentifier: string): Promise<PalletDoc | null>;
  // ... other existing methods
}
```

---

## 3. Scenarios (Gherkin)

### 3.1 Happy Path — QR Scan → Detail View

```gherkin
Feature: Tarima detail via QR scan
  As an ALMACENISTA
  I want to scan a tarima QR code and see its real data
  So I can verify lote, caducidad, cantidad without manual lookup

  Scenario: Successful QR scan shows tarima detail
    Given the Firestore emulator has a pallet document with qrIdentifier "TQR-24891-003"
    And the pallet references product "PROD-001" (name: "Manzana Gala") and supplier "SUP-001" (name: "Frutas del Valle")
    And I am on the "Escanear QR" screen
    When I scan QR code "TQR-24891-003"
    Then I am navigated to "TarimaDetalle"
    And the screen shows loading skeleton for < 500ms
    And the screen displays:
      | Field | Value |
      | QR | TQR-24891-003 |
      | Producto | Manzana Gala (PROD-001) |
      | Lote | LOTE-2024-001 |
      | Caducidad | 2025-12-31 |
      | Cantidad | 500 pz |
      | Proveedor | Frutas del Valle |
      | Estado | RECEIVED |
    And no error toast is shown
```

### 3.2 Not Found

```gherkin
  Scenario: QR code not found in Firestore
    Given no pallet document exists with qrIdentifier "TQR-99999-001"
    And I am on the "Escanear QR" screen
    When I scan QR code "TQR-99999-001"
    Then I am navigated to "TarimaDetalle"
    And the screen shows "Tarima no encontrada" message
    And a "Volver al escáner" button is visible
    And clicking it returns to "Escanear QR"
```

### 3.3 Error State

```gherkin
  Scenario: Firestore error during fetch
    Given the Firestore emulator is unreachable (network error)
    And I am on the "Escanear QR" screen
    When I scan QR code "TQR-24891-003"
    Then I am navigated to "TarimaDetalle"
    And the screen shows error toast "Error al cargar tarima. Intente de nuevo."
    And a "Reintentar" button is visible
    And clicking "Reintentar" re-fetches the data
```

### 3.4 Backward Compatibility — Recepciones Flow

```gherkin
  Scenario: Recepciones list → TarimaDetalle still works
    Given a reception document exists with pallets subcollection
    And I am on the "Recepciones" screen
    When I click a tarima in the reception detail
    Then I am navigated to "TarimaDetalle"
    And the screen shows the tarima data from `currentReception` + `tarimaActual` (existing logic)
    And no QR fetch is attempted
    And all existing fields display correctly
```

### 3.5 Invalid QR Format

```gherkin
  Scenario: Malformed QR code handled gracefully
    Given I am on the "Escanear QR" screen
    When I manually enter "NOT-A-VALID-QR"
    And I confirm
    Then the parser returns null
    And an inline validation error "Formato de QR inválido. Use TQR-XXXX-NNN" is shown
    And I remain on "Escanear QR" (no navigation)
```

---

## 4. Acceptance Criteria

| AC ID     | Scenario                                                                                              | Expected Result                                 | Test Type   |
| --------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------- |
| **AC-01** | `parseTarimaQR("TQR-24891-003")`                                                                      | Returns `{ ocNumber: "24891", tarimaIndex: 3 }` | Unit        |
| **AC-02** | `parseTarimaQR("INVALID")`                                                                            | Returns `null`                                  | Unit        |
| **AC-03** | `PalletService.getByQR("TQR-24891-003")` on emulator                                                  | Returns `PalletDoc` matching QR                 | Integration |
| **AC-04** | `PalletService.getByQR("NOTFOUND")` on emulator                                                       | Returns `null`                                  | Integration |
| **AC-05** | `TarimaDetalle` with `qrCode` prop → renders `TarimaDetailView` with joined product/supplier names    | Component                                       |
| **AC-06** | `TarimaDetalle` with `qrCode` for non-existent → shows "Tarima no encontrada"                         | Component                                       |
| **AC-07** | `TarimaDetalle` with `qrCode` + service error → shows error toast + retry                             | Component                                       |
| **AC-08** | `TarimaDetalle` without `qrCode` + `currentReception` → shows existing mock/real data (no regression) | Component                                       |
| **AC-09** | Full flow: `EscanearQR` scan → `App.tsx` navigation → `TarimaDetalle` shows correct data              | E2E (Playwright)                                |
| **AC-10** | `pnpm test:run` passes (all new + existing tests)                                                     | Suite                                           |
| **AC-11** | `pnpm typecheck` passes                                                                               | Suite                                           |
| **AC-12** | `pnpm lint` passes                                                                                    | Suite                                           |

---

## 5. Error Cases & Edge Cases

| Case                                            | Handling                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| **QR format invalid**                           | Parser returns `null`; `EscanearQR` shows inline error; no navigation |
| **QR not in Firestore**                         | `TarimaDetalle` shows "Tarima no encontrada" + back button            |
| **Firestore permission denied**                 | Error toast "Sin permisos para leer tarima"; log for debugging        |
| **Network offline (emulator down)**             | Error toast "Error de conexión. Verifique emulador." + retry button   |
| **Product/Supplier join missing**               | Show `productId` / `supplierId` as fallback; no crash                 |
| **Race: navigation before `pendingQrCode` set** | `TarimaDetalle` uses `useEffect` watching `qrCode` prop; safe         |
| **Multiple rapid scans**                        | `pendingQrCode` overwritten; last scan wins (acceptable)              |
| **Empty `lot` or `expiryDate` in Firestore**    | Show "—" placeholder; not an error                                    |

---

## 6. Out of Scope

- Creating new Firestore collections or modifying `PalletDoc` schema
- Real-time listeners (single fetch is sufficient)
- Offline queue for this read-only operation
- QR code generation (handled in `CapturaTarima`/`ImpresionEtiquetas`)
- Batch/multi-tarima scan flow
- Analytics/tracking of QR scans
- Print/export from `TarimaDetalle`

---

## 7. File Impact Map

| File                                              | Change Type  | Description                                    |
| ------------------------------------------------- | ------------ | ---------------------------------------------- |
| `src/types/qrcode.ts`                             | **New**      | QR format type + parser + tests                |
| `src/types/tarimaDetail.ts`                       | **New**      | Joined display type                            |
| `src/services/firestore/domainServices.ts`        | **Verify**   | `PalletService.getByQR` exists (line 347)      |
| `src/services/firestore/index.ts`                 | **Verify**   | `pallets` service exposed via factory          |
| `src/screens/TarimaDetalle.tsx`                   | **Modified** | Accept `qrCode` prop; fetch + join; states     |
| `src/App.tsx`                                     | **Modified** | `pendingQrCode` state; pass to `TarimaDetalle` |
| `src/test/types/qrcode.test.ts`                   | **New**      | Unit tests for parser                          |
| `src/test/services/palletService.getByQR.test.ts` | **New**      | Unit/integration tests for service             |
| `src/test/components/TarimaDetalle.qr.test.tsx`   | **New**      | Component tests with mocked service            |
| `src/test/e2e/tarimaQRFlow.test.ts`               | **New**      | Playwright E2E full flow                       |

---

## 8. Rollout Order (Implementation Sequence)

1. **QR Format Type + Parser** (`src/types/qrcode.ts` + unit tests)
2. **Service Test** (`PalletService.getByQR` against emulator + integration test)
3. **Display Type** (`src/types/tarimaDetail.ts`)
4. **Component Refactor** (`TarimaDetalle` with `qrCode` prop, mocked service + component tests)
5. **Navigation Wiring** (`App.tsx` `pendingQrCode` state)
6. **Integration Test** (Full flow with emulator + Playwright)
7. **Cleanup** (Remove hardcoded mock constants from `TarimaDetalle`)

---

## 9. Dependencies

- Firebase Firestore SDK (in `package.json`)
- `@zxing/browser` (already used by `EscanearQR`)
- Vitest + React Testing Library (configured)
- Firestore emulator (`./scripts/emulator-dev.sh up`)
- Composite index: `pallets` collection group + `qrIdentifier` (verify in `firestore.indexes.json`)

---

## 10. Success Definition

All **AC-01 through AC-12** pass in a single `./scripts/emulator-dev.sh test` run.
