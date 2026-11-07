# Proposal: God Component Refactor (App.tsx)

## Intent

Extract the **God Component** (`src/App.tsx`, 1557 lines) into a clean, layered architecture with separated concerns: contexts for global state, hooks for business logic, components for UI, and services for pure domain logic. Current `App.tsx` violates Single Responsibility, is untestable, causes massive re-renders, and mixes routing, navigation, business logic, and UI rendering in one file.

## Scope

### In Scope

- Extract 4 contexts: `ReceptionContext`, `CatalogosContext`, `InventoryContext`, `UIContext`
- Extract 3 hooks: `useReceptionFlow`, `useCatalogos`, `useInventory`
- Create 5 layout components: `Layout`, `Sidebar`, `Header`, `BottomNav`, `NavIcon`
- Create `conversionCalculator.ts` service (pure domain logic)
- Refactor `CapturaTarima`: extract `useScanner` hook, type `qrReaderRef`, fix race condition
- Reduce `App.tsx` to <200 lines (routing + providers only)
- Migrate all screens to consume contexts via hooks

### Out of Scope

- Business logic changes (existing behavior preserved)
- New features or UI redesign
- Firebase schema changes
- Authentication/authorization changes
- Migration to new state management library (using React Context)

## Capabilities

### New Capabilities

- `reception-context`: Global reception state + navigation coordination
- `catalogos-context`: Catalogs loading/sync with Firestore
- `inventory-context`: Per-warehouse inventory CRUD
- `ui-context`: Mobile detection, sidebar state, header config
- `reception-flow`: Navigation + state transitions for reception steps
- `conversion-calculator`: Pure domain logic for conversions/stickers

### Modified Capabilities

- `app-routing`: App.tsx reduced to routing + providers only
- `captura-tarima`: QR scanner extracted, typed, race condition fixed

## Approach

Follow the 7-phase plan from `REFACTOR_PLAN.md`:

1. **Types/Constants** (shared foundation)
2. **Contexts** (global state: Reception, Catalogos, Inventory, UI)
3. **Hooks** (business logic: ReceptionFlow, Catalogos, Inventory)
4. **Layout Components** (Sidebar, Header, BottomNav, Layout, NavIcon)
5. **Domain Services** (conversionCalculator.ts)
6. **CapturaTarima Refactor** (useScanner, typed QR, race condition fix)
7. **App.tsx Final** (routing + providers only, <200 lines)

Each phase creates testable, isolated units. Screens migrate incrementally to consume contexts via hooks.

## Affected Areas

| Area                                          | Impact       | Description                                                  |
| --------------------------------------------- | ------------ | ------------------------------------------------------------ |
| `src/App.tsx`                                 | **Modified** | Reduced from 1557 to <200 lines; only routing + providers    |
| `src/contexts/`                               | **New**      | 4 context files: Reception, Catalogos, Inventory, UI         |
| `src/hooks/`                                  | **New**      | 3 hooks: useReceptionFlow, useCatalogos, useInventory        |
| `src/components/layout/`                      | **New**      | 5 components: Layout, Sidebar, Header, BottomNav, NavIcon    |
| `src/services/domain/conversionCalculator.ts` | **New**      | Pure conversion/sticker logic                                |
| `src/screens/CapturaTarima.tsx`               | **Modified** | Extract useScanner, type qrReaderRef, fix race condition     |
| `src/screens/*.tsx`                           | **Modified** | All screens consume contexts via hooks instead of props      |
| `src/config/constants.ts`                     | **New**      | Shared constants (TARIMA_TOTAL, regex, assets, storage keys) |
| `src/config/navigation.ts`                    | **New**      | Screen/NavItem types, headerConfig, renderNavIcon            |
| `src/types/index.ts`                          | **New**      | Shared types: Screen, NavItem, HeaderConfig, etc.            |

## Risks

| Risk                                 | Likelihood | Mitigation                                                                                   |
| ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------- |
| Breaking existing navigation         | High       | E2E tests (44 passing) run after each phase; feature flag for rollback                       |
| Props drilling during migration      | Medium     | Migrate screens one-by-one; dual read from props + context during transition                 |
| Inconsistent state between contexts  | Medium     | Single `ReceptionContext` as parent coordinator; child contexts read-only                    |
| Performance regressions (re-renders) | Medium     | `React.memo` on layout parts; `useMemo`/`useCallback` in providers; split contexts by domain |
| Type regressions                     | Low        | Strict TypeScript; `npm run typecheck` in CI; no `any` in new files                          |

## Rollback Plan

```bash
# Feature flag rollback (instant, no redeploy)
VITE_USE_NEW_RECEPTION_FLOW=false

# Git rollback (if needed)
git checkout v1.4.0-audit-complete
git push -f origin main
```

Tag `v1.4.0-audit-complete` exists as stable checkpoint (320 unit + 44 e2e passing).

## Dependencies

- Existing: `REFACTOR_PLAN.md` (detailed phase plan), `openspec/config.yaml` (strict_tdd: true)
- No external dependencies added
- Uses existing: React Context, React Router, Firebase SDK, Vitest, Playwright

## Success Criteria

- [ ] `App.tsx` < 200 lines (routing + providers only)
- [ ] `npm run typecheck` passes (strict: true)
- [ ] `npm run test:run` passes (≥320 tests, coverage ≥80% on new services/hooks)
- [ ] `npm run test:e2e` passes (44 tests)
- [ ] `npm run build` succeeds (no chunk size warnings)
- [ ] Zero `any` types in new files
- [ ] All screens consume contexts via hooks (no prop drilling)
- [ ] `CapturaTarima`: typed QR scanner, no race condition
- [ ] All 7 phases completed per `REFACTOR_PLAN.md` checklist
