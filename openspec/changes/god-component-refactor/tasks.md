# SDD Tasks: God Component Refactor (App.tsx)

**Change**: `god-component-refactor`  
**Proposal**: `openspec/changes/god-component-refactor/proposal.md`  
**Specs**: `openspec/changes/god-component-refactor/specs/` (8 domains)  
**Design**: `openspec/changes/god-component-refactor/design.md`  
**Refactor Plan**: 7-phase sequential extraction per `REFACTOR_PLAN.md`

---

## Delivery Strategy

| Parameter                   | Value                                                      |
| --------------------------- | ---------------------------------------------------------- |
| **Auto-chain**              | `true` (per `openspec/config.yaml` `strict_tdd: true`)     |
| **Chain strategy**          | `feature-branch-chain` (for rollback control)              |
| **Estimated changed lines** | ~1,500 (new files + modifications)                         |
| **400-line budget risk**    | **High** → chained PRs required                            |
| **Rollback tag**            | `v1.4.0-audit-complete` (320 unit + 44 e2e passing)        |
| **Feature flag**            | `VITE_USE_NEW_RECEPTION_FLOW=false` (instant, no redeploy) |

---

## Phase 1: Types / Constants (Shared Foundation)

**Goal**: Create shared type system and constants used by all subsequent phases. Zero behavior change.

### Work Units

| ID  | Task                                              | Files                            | Est. Lines | Test Strategy          |
| --- | ------------------------------------------------- | -------------------------------- | ---------- | ---------------------- |
| 1.1 | Create `src/types/index.ts` with shared types     | `src/types/index.ts` (new)       | ~80        | TypeScript compilation |
| 1.2 | Create `src/config/constants.ts` with constants   | `src/config/constants.ts` (new)  | ~50        | TypeScript compilation |
| 1.3 | Create `src/config/navigation.ts` with nav config | `src/config/navigation.ts` (new) | ~60        | TypeScript compilation |
| 1.4 | Export types from `src/types/index.ts` barrel     | `src/types/index.ts`             | —          | TypeScript compilation |

### Acceptance Criteria

- [ ] `npm run typecheck` passes
- [ ] All types: `Screen`, `NavItem`, `HeaderConfig`, `ReceptionSessionPhase`, `ReceptionSessionData`, `ReceptionData`, `EvidenciaItem`, `Tarima`, `MatchedProduct`, `ConversionProps`, `ConversionTableRow`
- [ ] Constants: `TARIMA_TOTAL=4`, regex patterns, asset paths, storage keys
- [ ] Navigation: `screenOrder`, `navItems`, `headerConfig`, `renderNavIcon`

### Definition of Done

All 3 files created, exports working, strict TypeScript passes.

---

## Phase 2: Contexts (4 New Contexts)

**Goal**: Extract global state into 4 domain-separated React Context providers using `useReducer`. Nesting order: Reception → Catalogos → Inventory → UI.

### Work Units

| ID  | Task                                      | Files                                    | Est. Lines | Test Strategy                                               |
| --- | ----------------------------------------- | ---------------------------------------- | ---------- | ----------------------------------------------------------- |
| 2.1 | Create `src/context/ReceptionContext.tsx` | `src/context/ReceptionContext.tsx` (new) | ~180       | Unit: reducer transitions; Integration: provider + hook     |
| 2.2 | Create `src/context/CatalogosContext.tsx` | `src/context/CatalogosContext.tsx` (new) | ~160       | Unit: load/refresh reducers; Integration: Firestore sync    |
| 2.3 | Create `src/context/InventoryContext.tsx` | `src/context/InventoryContext.tsx` (new) | ~140       | Unit: CRUD reducers; Integration: Firestore persistence     |
| 2.4 | Create `src/context/UIContext.tsx`        | `src/context/UIContext.tsx` (new)        | ~90        | Unit: mobile/sidebar reducers; Integration: resize listener |
| 2.5 | Add context barrel export                 | `src/context/index.ts` (new)             | ~20        | TypeScript compilation                                      |

### Acceptance Criteria per Context

- **ReceptionContext**: State (`currentReception`, `sessionState`, `editId`, `editReceptionData`, `scannedQrCode`, `selectedEvidencia`, `tarimaActual`), Actions (`setCurrentReception`, `transition`, `navigate`, `editReception`, `cancelEdit`, `setScannedQrCode`, `setSelectedEvidencia`, `setTarimaActual`), Invalid transitions rejected
- **CatalogosContext**: State (`catalogoProductos`, `catalogoProveedores`, `catalogoConversiones`, `catalogoAlmacenes`, `catalogosLoading`, `catalogosError`), Actions (`loadCatalogos`, `refreshCatalogos`), Getters for each catalog
- **InventoryContext**: State (`inventario`, `almacenActivo`), Actions (`inicializarInventarioAlmacen`, `handleActivarAlmacen`, `aumentarInventario`, `reducirInventario`), Negative inventory prevention
- **UIContext**: State (`isMobile`, `sidebarOpen`), Actions (`setSidebarOpen`), Derived `header` config, Zero business logic

### Definition of Done

All 4 contexts created, reducers tested, providers compose without errors, `npm run typecheck` passes.

---

## Phase 3: Hooks (3 Business Logic Hooks)

**Goal**: Extract navigation/state transitions, catalog operations, and inventory operations into composable hooks. Screens consume via hooks — zero prop drilling.

### Work Units

| ID  | Task                                   | Files                                 | Est. Lines | Test Strategy                                       |
| --- | -------------------------------------- | ------------------------------------- | ---------- | --------------------------------------------------- |
| 3.1 | Create `src/hooks/useReceptionFlow.ts` | `src/hooks/useReceptionFlow.ts` (new) | ~120       | Unit: renderHook + Vitest (validation, transitions) |
| 3.2 | Create `src/hooks/useCatalogos.ts`     | `src/hooks/useCatalogos.ts` (new)     | ~80        | Unit: renderHook (load, refresh, getters)           |
| 3.3 | Create `src/hooks/useInventory.ts`     | `src/hooks/useInventory.ts` (new)     | ~70        | Unit: renderHook (CRUD, validation)                 |
| 3.4 | Add hooks barrel export                | `src/hooks/index.ts` (update)         | ~15        | TypeScript compilation                              |

### Acceptance Criteria per Hook

- **useReceptionFlow**: `startNewReception()`, `continueToEvidence()`, `continueToPallets()`, `completeReception()`, `editReception()`, `viewTarimaDetalle()`, `cancelReception()` — all delegate to ReceptionContext, validation before navigation
- **useCatalogos**: `loadCatalogos()`, `refreshCatalogos()`, `getProducto()`, `getProveedor()`, `getConversiones()`, `getAlmacen()`, `getAlmacenActivo()` — expose CatalogosContext getters
- **useInventory**: `inicializarInventario()`, `activarAlmacen()`, `aumentarInventario()`, `reducirInventario()` — expose InventoryContext actions, negative stock prevention

### Definition of Done

All 3 hooks created, unit tests ≥80% coverage on new hooks, `npm run test:run` passes, `npm run typecheck` passes.

---

## Phase 4: Layout Components (5 Presentational Components)

**Goal**: Extract ~300 lines of JSX from `AppLayout` into `React.memo`d presentational components. Receive data via UIContext only.

### Work Units

| ID  | Task                                         | Files                                       | Est. Lines | Test Strategy                               |
| --- | -------------------------------------------- | ------------------------------------------- | ---------- | ------------------------------------------- |
| 4.1 | Create `src/components/layout/NavIcon.tsx`   | `src/components/layout/NavIcon.tsx` (new)   | ~35        | Visual: Storybook/Playwright responsive     |
| 4.2 | Create `src/components/layout/Sidebar.tsx`   | `src/components/layout/Sidebar.tsx` (new)   | ~80        | Visual: Playwright desktop nav              |
| 4.3 | Create `src/components/layout/Header.tsx`    | `src/components/layout/Header.tsx` (new)    | ~70        | Visual: Playwright header config per screen |
| 4.4 | Create `src/components/layout/BottomNav.tsx` | `src/components/layout/BottomNav.tsx` (new) | ~55        | Visual: Playwright mobile nav               |
| 4.5 | Create `src/components/layout/Layout.tsx`    | `src/components/layout/Layout.tsx` (new)    | ~45        | Integration: Layout + providers + routes    |
| 4.6 | Add layout barrel export                     | `src/components/layout/index.ts` (new)      | ~15        | TypeScript compilation                      |

### Acceptance Criteria

- All components wrapped in `React.memo`
- Sidebar: desktop only, navigation items from `navItems` config
- Header: derives config from UIContext `header` (title, back button, actions)
- BottomNav: mobile only, auto-closes on navigation
- NavIcon: reusable, receives icon + label + active state
- Layout: composes Sidebar/Header/BottomNav, responsive via UIContext `isMobile`
- No business logic in any layout component

### Definition of Done

All 5 components created, visual regression via Playwright responsive tests (mobile/desktop), `npm run typecheck` passes.

---

## Phase 5: Domain Services (conversionCalculator)

**Goal**: Extract pure domain logic for conversions, stickers, and pallet distribution. Zero React dependencies.

### Work Units

| ID  | Task                                                 | Files                                               | Est. Lines | Test Strategy                          |
| --- | ---------------------------------------------------- | --------------------------------------------------- | ---------- | -------------------------------------- |
| 5.1 | Create `src/services/domain/conversionCalculator.ts` | `src/services/domain/conversionCalculator.ts` (new) | ~120       | Unit: Vitest table-driven (edge cases) |
| 5.2 | Add domain services barrel export                    | `src/services/domain/index.ts` (new)                | ~10        | TypeScript compilation                 |

### Acceptance Criteria

- `calculateConversionesYStickers(matchedProducts, conversionProps): ConversionTableRow[]` — handles missing conversions, multiple products
- `calculateTotalTarimas(conversionesTabla): number` — sums pallet quantities, returns 0 for empty
- `distributeCajasPerTarima(conversion, tarimas): number[]` — even distribution (diff ≤1), handles boxes<pallets, exact division
- All functions pure: same input → same output, no I/O, no state, no React
- Inputs/outputs serializable (plain objects/primitives)
- **Table-driven tests** for `distributeCajasPerTarima`: exact division, remainder, boxes<pallets, single pallet, zero boxes

### Definition of Done

Service created, unit tests ≥90% coverage, all edge cases covered, `npm run test:run` passes, `npm run typecheck` passes.

---

## Phase 6: CapturaTarima Refactor (Scanner + Race Condition)

**Goal**: Extract QR scanner to `useScanner`, type `qrReaderRef`, fix race condition between localStorage/Firestore writes using AbortController.

### Work Units

| ID  | Task                                                    | Files                                    | Est. Lines | Test Strategy                                       |
| --- | ------------------------------------------------------- | ---------------------------------------- | ---------- | --------------------------------------------------- |
| 6.1 | Create `src/hooks/useScanner.ts`                        | `src/hooks/useScanner.ts` (new)          | ~90        | Unit: renderHook (lifecycle, AbortController)       |
| 6.2 | Refactor `src/screens/CapturaTarima.tsx`                | `src/screens/CapturaTarima.tsx` (modify) | ~150 delta | Integration: screen + useScanner + ReceptionContext |
| 6.3 | Update `src/screens/EscanearQR.tsx` to use `useScanner` | `src/screens/EscanearQR.tsx` (modify)    | ~40 delta  | Integration: screen + useScanner                    |
| 6.4 | Fix race condition: atomic save pattern                 | `src/screens/CapturaTarima.tsx`          | —          | E2E: Playwright (scanner, retry, recovery)          |

### Acceptance Criteria

- **useScanner hook**: Returns `{ qrReaderRef, isScanning, startScanning, stopScanning, onScanSuccess, scanError }`
- **Typed qrReaderRef**: `React.RefObject<HTMLVideoElement>` (or `@zxing/browser` `BrowserQRCodeReader`), zero `any`
- **Scanner lifecycle**: Manual start/stop, auto-cleanup on unmount, camera permission handling
- **Race condition fix**:
  1. localStorage updated first (immediate backup)
  2. Firestore write follows
  3. On Firestore success → clear localStorage backup
  4. On Firestore failure → retain localStorage for retry
  5. On app restart → detect backup → prompt sync → retry Firestore → clear on success
- CapturaTarima delegates scanner to hook, handles results via `useReceptionFlow().viewTarimaDetalle()`
- EscanearQR uses same hook

### Definition of Done

Hook created, both screens refactored, race condition fixed, E2E tests for CapturaTarima pass (scanner, retry, recovery), `npm run typecheck` passes.

---

## Phase 7: App.tsx Final (Routing + Providers Only)

**Goal**: Reduce `App.tsx` from 1,557 to <200 lines. Only routing, provider composition, Layout wrapper.

### Work Units

| ID  | Task                                                 | Files                                   | Est. Lines   | Test Strategy                               |
| --- | ---------------------------------------------------- | --------------------------------------- | ------------ | ------------------------------------------- |
| 7.1 | Refactor `src/App.tsx` to minimal providers + routes | `src/App.tsx` (modify)                  | -1,350 delta | E2E: full 44-test suite                     |
| 7.2 | Verify provider nesting order                        | `src/App.tsx`                           | —            | Visual: Playwright all routes               |
| 7.3 | Add feature flag guard                               | `src/App.tsx`                           | —            | Manual: `VITE_USE_NEW_RECEPTION_FLOW=false` |
| 7.4 | Migrate all screens to consume contexts via hooks    | `src/screens/*.tsx` (modify, ~12 files) | ~400 delta   | E2E: 44 tests + visual regression           |
| 7.5 | Remove legacy `AppLayout` and inline state           | `src/App.tsx` (cleanup)                 | —            | TypeScript compilation                      |

### Acceptance Criteria

- **App.tsx < 200 lines** (imports, providers, routes, Layout)
- Provider order: `BrowserRouter` → `AuthProvider` → `ReceptionProvider` → `CatalogosProvider` → `InventoryProvider` → `UIProvider` → `Layout` → `Routes`
- All routes defined (public + protected reception + catalog/inventory)
- Layout wraps all authenticated routes
- Feature flag `VITE_USE_NEW_RECEPTION_FLOW` toggles new flow
- **Zero business logic, zero state management, zero UI rendering** in App.tsx
- All ~12 screens migrated: consume via `useReceptionFlow`, `useCatalogos`, `useInventory`, `UIContext`
- No prop drilling remains

### Definition of Done

App.tsx < 200 lines, all screens migrated, `npm run typecheck` passes, `npm run test:run` passes (≥320 tests, ≥80% coverage on new code), `npm run test:e2e` passes (44 tests), `npm run build` succeeds (no chunk warnings), zero `any` in new files.

---

## Screen Migration Checklist (Phase 7.4)

| Screen                        | Hooks to Consume                   | Contexts             |
| ----------------------------- | ---------------------------------- | -------------------- |
| `RecepcionesScreen`           | `useReceptionFlow`, `useCatalogos` | Reception, Catalogos |
| `ProgramacionRecepcionScreen` | `useReceptionFlow`                 | Reception            |
| `NuevaRecepcionStep1Screen`   | `useReceptionFlow`, `useCatalogos` | Reception, Catalogos |
| `CapturaEvidenciaScreen`      | `useReceptionFlow`                 | Reception            |
| `CapturaTarimaScreen`         | `useReceptionFlow`, `useScanner`   | Reception            |
| `TarimaDetalleScreen`         | `useReceptionFlow`, `useInventory` | Reception, Inventory |
| `CompletadaScreen`            | `useReceptionFlow`                 | Reception            |
| `EditarRecepcionScreen`       | `useReceptionFlow`, `useCatalogos` | Reception, Catalogos |
| `CatalogosScreen`             | `useCatalogos`                     | Catalogos            |
| `InventarioScreen`            | `useInventory`, `useCatalogos`     | Inventory, Catalogos |
| `EmbarquesScreen`             | `useReceptionFlow`                 | Reception            |
| `LotesCaducidadesScreen`      | `useCatalogos`                     | Catalogos            |
| `ConfiguracionScreen`         | `UIContext`                        | UI                   |

---

## Review Workload Forecast (Chained PRs)

### PR Breakdown (Feature Branch Chain)

| PR        | Phase(s) | Files Changed            | Est. Lines | Review Load   | Risk     |
| --------- | -------- | ------------------------ | ---------- | ------------- | -------- |
| **PR #1** | Phase 1  | 3 new files              | ~200       | Low           | Low      |
| **PR #2** | Phase 2  | 5 new files              | ~590       | **High**      | Medium   |
| **PR #3** | Phase 3  | 4 new files              | ~285       | Medium        | Low      |
| **PR #4** | Phase 5  | 2 new files              | ~130       | Low           | Low      |
| **PR #5** | Phase 6  | 3 files (1 new, 2 mod)   | ~280       | **High**      | **High** |
| **PR #6** | Phase 4  | 6 new files              | ~300       | Medium        | Low      |
| **PR #7** | Phase 7  | 13 files (1 mod, 12 mod) | ~400+      | **Very High** | **High** |

### Chained PR Strategy

```bash
# Branch naming: refactor/phase-N-<description>
git checkout -b refactor/phase-1-types-constants
# ... work, test, push
gh pr create --base main --title "refactor: Phase 1 - Types/Constants foundation"

git checkout -b refactor/phase-2-contexts
# ... work, test, push
gh pr create --base refactor/phase-1-types-constants --title "refactor: Phase 2 - 4 Contexts"

git checkout -b refactor/phase-3-hooks
# ... work, test, push
gh pr create --base refactor/phase-2-contexts --title "refactor: Phase 3 - 3 Hooks"

git checkout -b refactor/phase-5-conversion-calculator
# ... work, test, push
gh pr create --base refactor/phase-3-hooks --title "refactor: Phase 5 - Conversion Calculator"

git checkout -b refactor/phase-6-captura-tarima
# ... work, test, push
gh pr create --base refactor/phase-5-conversion-calculator --title "refactor: Phase 6 - CapturaTarima + Scanner"

git checkout -b refactor/phase-4-layout
# ... work, test, push
gh pr create --base refactor/phase-6-captura-tarima --title "refactor: Phase 4 - Layout Components"

git checkout -b refactor/phase-7-app-final
# ... work, test, push
gh pr create --base refactor/phase-4-layout --title "refactor: Phase 7 - App.tsx Final + Screen Migration"
```

### Review Workload Summary

| Metric                    | Value                                                           |
| ------------------------- | --------------------------------------------------------------- |
| **Total PRs**             | 7 (chained)                                                     |
| **Max lines/PR**          | ~590 (Phase 2)                                                  |
| **High-risk PRs**         | Phase 2 (contexts), Phase 6 (scanner/race), Phase 7 (migration) |
| **Estimated review time** | 2–3 hours per high-risk PR, 1 hour per low-risk PR              |
| **Total review burden**   | ~12–15 hours across 7 PRs                                       |
| **Rollback points**       | After each PR (feature branch chain)                            |
| **CI gates per PR**       | `typecheck`, `test:run`, `test:e2e` (subset), `build`           |

### Recommended Review Order

1. **Phase 1** — Quick win, establishes types
2. **Phase 5** — Pure functions, highly testable, low coupling
3. **Phase 3** — Hooks depend on Phase 1+2 types, testable in isolation
4. **Phase 2** — Contexts are the backbone; review reducers carefully
5. **Phase 6** — Highest behavioral risk (scanner, race condition); needs E2E focus
6. **Phase 4** — Visual components; Playwright screenshots for approval
7. **Phase 7** — Largest migration; requires full E2E suite pass before merge

---

## CI/CD Gates (Per PR)

```yaml
# Required checks before merge (enforced by branch protection)
- npm run typecheck # Strict TypeScript
- npm run lint # oxfmt + ESLint
- npm run test:run # Vitest (unit + integration)
- npm run test:e2e # Playwright (targeted subset for PRs 1-6, full for PR 7)
- npm run build # Vite production build
- coverage threshold # ≥80% on new files (hooks, services, contexts)
```

---

## Verification Checklist (Final)

After PR #7 merge to `main`:

- [ ] `App.tsx` < 200 lines
- [ ] `npm run typecheck` passes (strict: true)
- [ ] `npm run test:run` passes (≥320 tests, coverage ≥80% on new code)
- [ ] `npm run test:e2e` passes (all 44 tests)
- [ ] `npm run build` succeeds (no chunk size warnings)
- [ ] Zero `any` types in new files
- [ ] All screens consume contexts via hooks (no prop drilling)
- [ ] `CapturaTarima`: typed QR scanner, no race condition
- [ ] All 7 phases completed per `REFACTOR_PLAN.md`
- [ ] Feature flag `VITE_USE_NEW_RECEPTION_FLOW=true` in production
- [ ] Tag release: `v1.4.1-god-component-refactor`

---

## Rollback Procedure

```bash
# Instant (no redeploy)
VITE_USE_NEW_RECEPTION_FLOW=false

# Git rollback (if needed)
git checkout v1.4.0-audit-complete
git push -f origin main
```
