# Proposal: Caso 2 - Complete TarimaDetalle to Read Real Tarima Data from Firestore by QR Code

## Intent

Complete the **TarimaDetalle** screen to fetch and display real tarima (pallet) data from Firestore when navigated from **EscanearQR** via QR code scan. Currently, the navigation works but TarimaDetalle shows hardcoded mock data. The `PalletService.getByQR()` method already exists but is not used.

## Scope

### In Scope

| Component                | Current State                                                                   | Required Change                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **QR Format Definition** | Implicit in `CapturaTarima.tsx` (`TQR-${ocNumber}-${padStart(3,'0')}`)          | Document as formal contract; add TypeScript type                                                                  |
| **Firestore Service**    | `PalletService.getByQR(qrIdentifier)` exists at `domainServices.ts:347`         | Expose via `createFirestoreServices()` factory; verify it works with collection group query                       |
| **TarimaDetalle Screen** | Hardcoded mock data (`tarimaNum = 3`, static product info)                      | Accept `qrCode` prop; call `pallets.getByQR(qrCode)`; render real `PalletDoc` data + joined product/supplier info |
| **Navigation (App.tsx)** | `EscanearQR.onFound` calls `navigate("tarima-detalle")` without passing QR code | Pass scanned `qrCode` to TarimaDetalle via state or route params                                                  |
| **Tests**                | No tests for QR→TarimaDetalle flow                                              | Unit tests for service; component tests for TarimaDetalle with mocked service; integration test for full flow     |

### Out of Scope

- Creating new Firestore collections (pallets already exist as subcollection under receptions + collection group)
- Modifying `PalletDoc` schema (already has `qrIdentifier`, `productId`, `warehouseId`, `lot`, `expiryDate`, `quantity`, `unit`, `status`)
- Real-time listeners (single fetch is sufficient for detail view)
- Offline queue for this read-only operation
- QR code generation (handled in `CapturaTarima`/`ImpresionEtiquetas`)

## Capabilities

### Existing Capabilities (Reused)

- **`PalletService.getByQR(qrIdentifier)`** — Collection group query on `pallets` filtered by `qrIdentifier` (line 347-353, `domainServices.ts`)
- **`PalletDoc` type** — Defined in `types.ts:127-139` with all required fields
- **`createFirestoreServices(db, orgId)`** — Factory returning `pallets: PalletService` (line 48, `index.ts`)
- **`EscanearQR` component** — Camera + manual input, calls `onFound(qrCode)` (fully functional)
- **Navigation infrastructure** — `App.tsx` state management and screen routing

### New Capabilities

- **`QRCodeFormat` type** — Formal TypeScript definition of the QR code pattern
- **`TarimaDetalle` with `qrCode` prop** — Loads real data via `pallets.getByQR()`; shows loading/error/empty states
- **Route parameter passing** — `qrCode` passed from `EscanearQR` → `App.tsx` state → `TarimaDetalle` prop

### Modified Capabilities

- **`App.tsx`** — Add `pendingQrCode` state; pass to `TarimaDetalle` when screen is `"tarima-detalle"` and nav source is `"qr"`
- **`TarimaDetalle.tsx`** — Replace hardcoded values with real `PalletDoc` + joined lookups (product name, supplier, etc.)

## Approach

### Implementation Steps

1. **Define QR Format Type** (`src/types/qrcode.ts` or extend `types.ts`)

   ```typescript
   export type TarimaQRCode = `TQR-${string}-${string}`; // e.g., TQR-24891-003
   export interface ParsedQR {
     ocNumber: string;
     tarimaIndex: number;
   }
   export function parseTarimaQR(qr: string): ParsedQR | null;
   ```

2. **Verify/Expose `PalletService.getByQR`**
   - Confirm `collectionGroupQuery("pallets", { where: [["qrIdentifier", "==", qrCode]], limit: 1 })` works with emulator
   - Add integration test against Firestore emulator

3. **Update `App.tsx` Navigation**
   - Add `pendingQrCode: string | null` state
   - In `EscanearQR` render: `onFound={(qr) => { setPendingQrCode(qr); navigate("tarima-detalle", "qr"); }}`
   - In `TarimaDetalle` render: pass `qrCode={pendingQrCode}` and clear after mount

4. **Refactor `TarimaDetalle.tsx`**
   - Change props: `interface Props { onBack: () => void; qrCode?: string; currentReception?: ... }`
   - Add `useEffect` to fetch via `pallets.getByQR(qrCode)` when `qrCode` prop changes
   - Join with `ProductService.getById(pallet.productId)` and `SupplierService` for display fields
   - Show loading skeleton, error toast, "Tarima no encontrada" state
   - Keep backward compatibility: if no `qrCode`, fall back to `currentReception` + `tarimaActual` (existing Recepciones flow)

5. **Write Tests (TDD — tests first)**
   - **Unit**: `PalletService.getByQR` — mock Firestore, verify query structure
   - **Unit**: `parseTarimaQR` — valid/invalid formats
   - **Component**: `TarimaDetalle` with mocked `pallets.getByQR` — renders data, loading, error, not found
   - **Integration**: Full flow `EscanearQR` → `TarimaDetalle` with MSW/Firebase emulator

## Affected Areas

| File                                              | Impact       | Description                                                  |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| `src/types/qrcode.ts`                             | **New**      | QR format type + parser                                      |
| `src/services/firestore/index.ts`                 | **Modified** | Ensure `pallets` service exposed (already done)              |
| `src/services/firestore/domainServices.ts`        | **Verify**   | `PalletService.getByQR` exists at line 347                   |
| `src/screens/TarimaDetalle.tsx`                   | **Modified** | Accept `qrCode` prop; fetch real data; join product/supplier |
| `src/App.tsx`                                     | **Modified** | Add `pendingQrCode` state; pass to TarimaDetalle             |
| `src/test/services/palletService.getByQR.test.ts` | **New**      | Unit tests for service method                                |
| `src/test/components/TarimaDetalle.qr.test.tsx`   | **New**      | Component tests with mocked service                          |
| `src/test/integration/tarimaQRFlow.test.ts`       | **New**      | End-to-end flow test                                         |

## Risks

| Risk                                                           | Likelihood | Mitigation                                                                                            |
| -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `qrIdentifier` in Firestore doesn't match scanned QR format    | Medium     | Verify seed data format matches `TQR-${oc}-${NNN}`; add normalization in `parseTarimaQR`              |
| Collection group query requires composite index                | High       | Check `firestore.indexes.json` for `pallets` + `qrIdentifier` index; add if missing                   |
| `PalletDoc` lacks product name/supplier (only has `productId`) | High       | Join with `ProductService.getById` + `SupplierService` in component; handle missing gracefully        |
| Race condition: navigation fires before `pendingQrCode` set    | Low        | Use `useEffect` in `TarimaDetalle` watching `qrCode` prop; or pass via route params (React Router v6) |
| Backward compatibility broken for Recepciones → TarimaDetalle  | Medium     | Keep `currentReception` + `tarimaActual` path; only use QR fetch when `qrCode` prop provided          |

## Dependencies

- Firebase Firestore SDK (already in `package.json`)
- `@zxing/browser` (already used by `EscanearQR`)
- Vitest + React Testing Library (already configured)
- Firestore emulator for integration tests (`./scripts/emulator-dev.sh up`)

## Success Criteria

- [ ] **QR Format**: Documented TypeScript type + parser with tests
- [ ] **Service**: `pallets.getByQR(qrCode)` returns `PalletDoc | null` from emulator
- [ ] **Navigation**: Scan QR in `EscanearQR` → `TarimaDetalle` shows _that specific tarima's_ data
- [ ] **Display**: Product name, lot, expiry, quantity, unit, supplier, warehouse, status from Firestore
- [ ] **States**: Loading skeleton → data / error toast / "Tarima no encontrada" (not found)
- [ ] **Backward Compat**: Recepciones list → TarimaDetalle still works (uses `currentReception` + `tarimaActual`)
- [ ] **Tests**: All new tests pass (`pnpm test:run`); coverage thresholds met
- [ ] **Typecheck**: `pnpm typecheck` passes
- [ ] **Lint**: `pnpm lint` passes

## Rollout Order

1. **QR Format Type + Parser** (foundation, no UI changes)
2. **Service Test** (`PalletService.getByQR` against emulator)
3. **Component Refactor** (`TarimaDetalle` with `qrCode` prop, mocked service)
4. **Navigation Wiring** (`App.tsx` passes `pendingQrCode`)
5. **Integration Test** (full flow with emulator)
6. **Cleanup** (remove hardcoded mock constants from `TarimaDetalle`)
