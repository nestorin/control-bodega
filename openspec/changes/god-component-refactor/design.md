# Design: God Component Refactor (App.tsx)

## Technical Approach

Follow the 7-phase plan from `REFACTOR_PLAN.md` to extract `App.tsx` (1557 lines) into a layered architecture:

1. **Types/Constants** — Shared foundation (types, constants, navigation config)
2. **Contexts** — 4 new contexts: Reception, Catalogos, Inventory, UI (AuthContext exists)
3. **Hooks** — 3 hooks: useReceptionFlow, useCatalogos, useInventory
4. **Layout Components** — 5 components: Layout, Sidebar, Header, BottomNav, NavIcon
5. **Domain Services** — conversionCalculator.ts (pure TypeScript)
6. **CapturaTarima Refactor** — Extract useScanner hook, type qrReaderRef, fix race condition
7. **App.tsx Final** — Routing + providers only (<200 lines)

Each phase creates testable, isolated units. Screens migrate incrementally to consume contexts via hooks.

## Architecture Decisions

### Decision: State Management — React Context + useReducer

**Choice**: Use React Context with `useReducer` for each domain context (Reception, Catalogos, Inventory, UI)
**Alternatives considered**:

- Zustand/Redux — adds dependency, overkill for this scope
- Props drilling — current problem, not a solution
- Single global context — causes unnecessary re-renders
  **Rationale**: Matches existing `AuthContext` pattern; zero dependencies; React 19 optimized; split by domain to minimize re-renders

### Decision: Context Hierarchy

**Choice**: Nested providers with ReceptionContext as parent coordinator
**Alternatives considered**:

- Flat context providers at same level
- Single mega-context
  **Rationale**: ReceptionContext owns the workflow lifecycle; child contexts (Catalogos, Inventory, UI) are read-only consumers. Invalid transitions rejected at ReceptionContext level.

### Decision: Hooks for Business Logic

**Choice**: Extract navigation + state transitions into `useReceptionFlow`; catalog/inventory operations into `useCatalogos`/`useInventory`
**Alternatives considered**:

- Keep logic in contexts
- Use Redux-like slices
  **Rationale**: Hooks are composable, testable, and screens only import what they need. Follows existing `useAuthorization`, `useEmbarques` patterns.

### Decision: Pure Domain Service

**Choice**: `conversionCalculator.ts` — zero React dependencies, pure TypeScript functions
**Alternatives considered**:

- Put in context
- Put in hook
  **Rationale**: Conversions/sticker calculations are pure math — belongs in service layer. Easily testable without React Testing Library. Follows existing `conversiones.ts` pattern but decoupled.

### Decision: Layout Components

**Choice**: Extract Layout, Sidebar, Header, BottomNav, NavIcon as presentational components
**Alternatives considered**:

- Keep inline in AppLayout
- Use a layout library
  **Rationale**: Removes ~300 lines of JSX from App.tsx; enables React.memo optimization; follows container-presentational pattern.

### Decision: CapturaTarima Refactor

**Choice**: Extract `useScanner` hook; type `qrReaderRef` as `BrowserQRCodeReader | null`; fix race condition with AbortController
**Alternatives considered**:

- Keep scanner inline
- Use useEffect cleanup only
  **Rationale**: Current code has race condition between localStorage and Firestore writes. Scanner logic is reusable for EscanearQR. Proper typing eliminates `any` casts.

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx (<200 lines)                  │
│  BrowserRouter → Routes → [AuthProvider → ReceptionProvider │
│   → CatalogosProvider → InventoryProvider → UIProvider]     │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
    │ ReceptionContext│ │CatalogosContext│ │InventoryContext│
    │ (useReducer)    │ │ (useReducer) │ │ (useReducer) │
    │ - currentReception│ │ - productos  │ │ - inventory  │
    │ - sessionState  │ │ - proveedores│ │ - activeWh   │
    │ - editId        │ │ - conversiones│ │ - init/aum/dis│
    └────────┬────────┘ └──────┬───────┘ └──────┬───────┘
             │                 │                 │
             ▼                 ▼                 ▼
    ┌─────────────────────────────────────────────────────┐
    │                  Custom Hooks                        │
    │  useReceptionFlow()  useCatalogos()  useInventory() │
    └─────────────────────────────────────────────────────┘
             │                 │                 │
             ▼                 ▼                 ▼
    ┌─────────────────────────────────────────────────────┐
    │                    Screens                           │
    │  Consume via hooks — zero props drilling            │
    └─────────────────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────────────────────────────────────┐
    │              Layout Components                       │
    │  Layout → Sidebar/Header/BottomNav/NavIcon          │
    │  (React.memo, receive data via UIContext)           │
    └─────────────────────────────────────────────────────┘
```

## File Changes

| File                                          | Action | Description                                                                                     |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `src/types/index.ts`                          | Create | Shared types: Screen, NavItem, HeaderConfig, ReceptionSessionPhase, ReceptionSessionData        |
| `src/config/constants.ts`                     | Create | TARIMA_TOTAL=4, regex patterns, asset paths, storage keys                                       |
| `src/config/navigation.ts`                    | Create | screenOrder, navItems, headerConfig, renderNavIcon                                              |
| `src/context/ReceptionContext.tsx`            | Create | Reception state + navigation coordination (useReducer)                                          |
| `src/context/CatalogosContext.tsx`            | Create | Catalogs loading/sync (productos, proveedores, conversiones, almacenes)                         |
| `src/context/InventoryContext.tsx`            | Create | Per-warehouse inventory CRUD (init, increase, decrease)                                         |
| `src/context/UIContext.tsx`                   | Create | Mobile detection, sidebar state, header config                                                  |
| `src/hooks/useReceptionFlow.ts`               | Create | Navigation + state transitions for reception workflow                                           |
| `src/hooks/useCatalogos.ts`                   | Create | Catalog operations (load, sync, getters)                                                        |
| `src/hooks/useInventory.ts`                   | Create | Inventory operations (init, increase, decrease)                                                 |
| `src/components/layout/Layout.tsx`            | Create | Root layout wrapper                                                                             |
| `src/components/layout/Sidebar.tsx`           | Create | Desktop sidebar navigation                                                                      |
| `src/components/layout/Header.tsx`            | Create | Top header with title/actions                                                                   |
| `src/components/layout/BottomNav.tsx`         | Create | Mobile bottom navigation                                                                        |
| `src/components/layout/NavIcon.tsx`           | Create | Reusable nav icon component                                                                     |
| `src/services/domain/conversionCalculator.ts` | Create | Pure functions: calculateConversionesYStickers, calculateTotalTarimas, distributeCajasPerTarima |
| `src/screens/CapturaTarima.tsx`               | Modify | Extract scanner to useScanner, type qrReaderRef, fix race condition                             |
| `src/screens/EscanearQR.tsx`                  | Modify | Use useScanner hook                                                                             |
| `src/screens/*.tsx`                           | Modify | All screens migrate to consume contexts via hooks                                               |
| `src/App.tsx`                                 | Modify | Reduce to routing + providers only (<200 lines)                                                 |
| `src/hooks/useScanner.ts`                     | Create | Extracted QR scanner logic with AbortController for race condition fix                          |

## Interfaces / Contracts

```typescript
// src/types/index.ts
export type Screen =
  | "home"
  | "recepciones"
  | "nueva-recepcion"
  | "editar-recepcion"
  | "captura-tarima"
  | "tarima-detalle"
  | "evidencias"
  | "embarques"
  | "lotes-caducidades"
  | "configuracion"
  | "login"
  | "register";

export type NavItem = {
  id: Screen;
  label: string;
  icon: React.ReactNode;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
};

export type HeaderConfig = {
  title: string;
  showBack?: boolean;
  actions?: React.ReactNode;
};

// src/context/ReceptionContext.tsx
export interface ReceptionContextValue {
  // State
  currentReception: ReceptionData | null;
  sessionState: ReceptionSessionPhase;
  editId: string | null;
  editReceptionData: ReceptionData | null;
  scannedQrCode: string | null;
  selectedEvidencia: EvidenciaItem | null;
  tarimaActual: Tarima | null;

  // Actions
  setCurrentReception: (data: ReceptionData) => void;
  transition: (phase: ReceptionSessionPhase) => void;
  navigate: (screen: Screen, options?: NavOptions) => void;
  editReception: (id: string) => void;
  cancelEdit: () => void;
  setScannedQrCode: (code: string) => void;
  setSelectedEvidencia: (item: EvidenciaItem | null) => void;
  setTarimaActual: (pallet: Tarima | null) => void;
}

// src/services/domain/conversionCalculator.ts
export interface ConversionTableRow {
  productId: string;
  productName: string;
  originalUnit: string;
  originalQuantity: number;
  conversions: Array<{
    unit: string;
    quantity: number;
    stickers: Array<{ qrPayload: string; quantity: number }>;
  }>;
}

export function calculateConversionesYStickers(
  matchedProducts: MatchedProduct[],
  conversionProps: ConversionProps,
): ConversionTableRow[];

export function calculateTotalTarimas(conversionesTabla: ConversionTableRow[]): number;

export function distributeCajasPerTarima(
  conversion: ConversionTableRow["conversions"][0],
  tarimas: number,
): number[];
```

## Testing Strategy

| Layer       | What to Test                        | Approach                                                            |
| ----------- | ----------------------------------- | ------------------------------------------------------------------- |
| Unit        | conversionCalculator pure functions | Vitest — table-driven tests for distributeCajasPerTarima edge cases |
| Unit        | Context reducers                    | Vitest — test each action/state transition                          |
| Unit        | Hooks (useReceptionFlow, etc.)      | Vitest + React Testing Library — renderHook                         |
| Integration | Context + Hook composition          | Render screens with providers, verify state flows                   |
| E2E         | Full reception flow                 | Playwright — existing 44 tests must pass after each phase           |
| E2E         | Navigation + layout                 | Playwright — responsive tests (mobile/desktop)                      |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes. Pure React/Firebase refactor.

## Migration / Rollout

1. **Phase 1-2 (Types + Contexts)**: Create files, no behavior change. Feature flag: `VITE_USE_NEW_RECEPTION_FLOW=false`
2. **Phase 3 (Hooks)**: Test hooks in isolation with unit tests
3. **Phase 4 (Layout)**: Visual regression check via Playwright responsive tests
4. **Phase 5 (Services)**: Unit test conversionCalculator extensively
5. **Phase 6 (CapturaTarima)**: E2E test CapturaTarima specifically (scanner, race condition)
6. **Phase 7 (App.tsx)**: Flip feature flag to true, full E2E suite

**Rollback**: Set `VITE_USE_NEW_RECEPTION_FLOW=false` (instant, no redeploy) or `git checkout v1.4.0-audit-complete`

## Open Questions

- [ ] Should `ReceptionContext` persist to localStorage for offline resume? (Currently handled in screens)
- [ ] Migration strategy for screens: big-bang or incremental per-screen? (Recommend incremental)
- [ ] Should `CatalogosContext` use Firestore real-time listeners or one-time fetch? (Current: one-time with manual refresh)
- [ ] Type `qrReaderRef` — confirm `BrowserQRCodeReader` import path from `@zxing/browser`

---

**Size budget check**: ~750 words (under 800 limit)
