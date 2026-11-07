# Plan de Refactor: Extraer God Component App.tsx

**Archivo origen:** `src/App.tsx` (1434 líneas, 51KB)
**Objetivo:** Reducir `App.tsx` a <200 líneas (solo routing + providers)

---

## 📦 Nueva Estructura de Archivos

```
src/
├── contexts/
│   ├── AuthContext.tsx              ✅ ya existe
│   ├── ReceptionContext.tsx         🆕 NUEVO - estado de recepción + navegación
│   ├── CatalogosContext.tsx         🆕 NUEVO - catálogos + sync Firestore
│   ├── InventoryContext.tsx         🆕 NUEVO - inventario por almacén
│   └── UIContext.tsx                🆕 NUEVO - mobile, sidebar, header config
├── hooks/
│   ├── useReceptionSession.ts       ✅ ya existe
│   ├── useReceptionFlow.ts          🆕 NUEVO - transiciones de pasos
│   ├── useCatalogos.ts              🆕 NUEVO - carga/sync catálogos
│   ├── useInventory.ts              🆕 NUEVO - CRUD inventario
│   ├── useScanner.ts                🆕 NUEVO - QR scanner logic (de CapturaTarima)
│   └── useLocalStorage.ts           🆕 NUEVO - persistencia tipada
├── components/
│   ├── layout/
│   │   ├── Layout.tsx               🆕 shell + sidebar + header
│   │   ├── Sidebar.tsx              🆕 navegación lateral
│   │   ├── Header.tsx               🆕 header desktop/mobile
│   │   ├── BottomNav.tsx            🆕 nav inferior mobile
│   │   └── NavIcon.tsx              🆕 iconos de nav reutilizables
│   ├── reception/
│   │   └── (pantallas existentes)
│   └── ui/
│       └── TouchTarget.tsx          ✅ ya existe
├── config/
│   ├── featureFlags.ts              ✅
│   ├── warehouses.ts                ✅
│   ├── supplierCatalog.ts           ✅
│   ├── constants.ts                 🆕 NUEVO - regex, totales, assets
│   └── navigation.ts                🆕 NUEVO - Screen/NavItem types + headerConfig
├── services/
│   ├── domain/
│   │   ├── conversionCalculator.ts  🆕 NUEVO - lógica pura de conversiones
│   │   ├── productMatching.ts       ✅
│   │   ├── receptionMappers.ts      ✅
│   │   └── programacionToApp.ts     ✅
│   └── firestore/                   ✅
├── types/
│   └── index.ts                     🆕 NUEVO - tipos compartidos
└── App.tsx                          🔄 REDUCIDO a routing + providers
```

---

## 🎯 Fases de Implementación

### FASE 1: Tipos y Constantes Compartidas (base)

- [ ] `src/types/index.ts` - `Screen`, `NavItem`, `HeaderConfig`, `CurrentReception`, `TarimaData`, `ConversionesTablaItem`, `EvidenciaData`
- [ ] `src/config/constants.ts` - `TARIMA_TOTAL`, `QR_CODE_REGEX`, `assetPathPrefix`, `STORAGE_KEYS`
- [ ] `src/config/navigation.ts` - `navItems`, `headerConfig`, `renderNavIcon`

### FASE 2: Contextos (estado global)

- [ ] `src/contexts/ReceptionContext.tsx`
  - `currentReception`, `setCurrentReception`
  - `receptionSession` (integra `useReceptionSession`)
  - `navigate(screen, nav?)`, `screen`, `activeNav`
  - `editId`, `editReceptionData`, `selectedReception`, `scannedQrCode`
  - `selectedEvidencia`, `tarimaActual`
- [ ] `src/contexts/CatalogosContext.tsx`
  - `catalogoProductos`, `catalogoProveedores`, `catalogoConversiones`, `catalogoAlmacenes`
  - `catalogosLoading`, `catalogosError`
  - `loadCatalogos()` (extraído del useEffect líneas 355-439)
  - `refreshCatalogos()`
- [ ] `src/contexts/InventoryContext.tsx`
  - `inventario`, `inicializarInventarioAlmacen`, `aumentarInventario`, `reducirInventario`
  - `almacenActivo` (derivado de `catalogoAlmacenes`)
  - `handleActivarAlmacen`
- [ ] `src/contexts/UIContext.tsx`
  - `isMobile`, `sidebarOpen`, `setSidebarOpen`
  - `header` (derivado de `screen` + `currentReception` + `tarimaActual`)

### FASE 3: Hooks de Lógica de Negocio

- [ ] `src/hooks/useReceptionFlow.ts`
  - `startNewReception()` → `programacion-recepcion` o `nueva-step1`
  - `continueToEvidence()` → `captura-evidencia`
  - `continueToPallets()` → `captura-tarima`
  - `completeReception()` → `completada`
  - `editReception(id)` → `editar-recepcion`
  - `viewTarimaDetalle(qrCode)` → `tarima-detalle`
- [ ] `src/hooks/useCatalogos.ts` (wrapper fino sobre CatalogosContext)
- [ ] `src/hooks/useInventory.ts` (wrapper fino sobre InventoryContext)

### FASE 4: Componentes de Layout

- [ ] `src/components/layout/NavIcon.tsx` - iconos SVG + img
- [ ] `src/components/layout/Sidebar.tsx` - drawer lateral + overlay mobile
- [ ] `src/components/layout/Header.tsx` - desktop + mobile header
- [ ] `src/components/layout/BottomNav.tsx` - nav fija mobile
- [ ] `src/components/layout/Layout.tsx` - compose Sidebar + Header + BottomNav + children

### FASE 5: Servicios de Dominio

- [ ] `src/services/domain/conversionCalculator.ts`
  - `calculateConversionesYStickers(matchedProducts, conversionProps)` - pura
  - `calculateTotalTarimas(conversionesTabla)` - pura
  - `distributeCajasPerTarima(conv, tarimas)` - pura

### FASE 6: Refactor CapturaTarima (paralelo)

- [ ] Extraer scanner logic a `useScanner.ts`
- [ ] Tipar `qrReaderRef` con tipos de `@zxing/browser`
- [ ] Fix race condition localStorage/Firestore (transacción atómica)

### FASE 7: App.tsx Final

- [ ] Importar providers: `AuthProvider` → `ReceptionProvider` → `CatalogosProvider` → `InventoryProvider` → `UIProvider`
- [ ] `App.tsx` = solo `<BrowserRouter>` + `<Routes>` + `<Layout>` + pantallas
- [ ] Pantallas consumen contextos via hooks (`useReception`, `useCatalogos`, etc.)

---

## 🔄 Mapeo Estado Actual → Nuevo

| Estado actual (AppLayout)                              | Nuevo Contexto/Hook                          |
| ------------------------------------------------------ | -------------------------------------------- |
| `screen`, `setScreen`, `activeNav`, `setActiveNav`     | `ReceptionContext` + `useReceptionFlow`      |
| `navigate()`                                           | `ReceptionContext`                           |
| `currentReception`, `setCurrentReception`              | `ReceptionContext`                           |
| `receptionSession`                                     | `ReceptionContext` (interno)                 |
| `editId`, `editReceptionData`                          | `ReceptionContext`                           |
| `selectedReception`, `scannedQrCode`                   | `ReceptionContext`                           |
| `selectedEvidencia`                                    | `ReceptionContext`                           |
| `tarimaActual`                                         | `ReceptionContext`                           |
| `catalogoProductos/Proveedores/Conversiones/Almacenes` | `CatalogosContext`                           |
| `catalogosLoading/Error`                               | `CatalogosContext`                           |
| `loadCatalogos useEffect`                              | `CatalogosContext` (inicialización)          |
| `inventario`, `inicializar/aumentar/reducirInventario` | `InventoryContext`                           |
| `almacenActivo`, `handleActivarAlmacen`                | `InventoryContext`                           |
| `isMobile`, `sidebarOpen`                              | `UIContext`                                  |
| `headerConfig`, `header`                               | `UIContext` (derivado)                       |
| `navItems`, `renderNavIcon`                            | `config/navigation.ts` + `NavIcon` component |
| `TARIMA_TOTAL`                                         | `config/constants.ts`                        |
| Asset paths (`imgPackage`, etc.)                       | `config/constants.ts`                        |

---

## 🧪 Testing Strategy

1. **Unit tests** para:
   - `conversionCalculator.ts` (lógica pura, fácil testear)
   - `useReceptionFlow.ts` (con React Testing Library + mock contexts)
   - `CatalogosContext` (mock Firestore services)

2. **Integration tests** para:
   - Flujo completo: `programacion-recepcion` → `captura-evidencia` → `captura-tarima` → `completada`
   - Persistencia localStorage + restore

3. **E2E tests** (Playwright existentes) - deben seguir pasando sin cambios

---

## ⚠️ Riesgos y Mitigación

| Riesgo                               | Mitigación                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Romper navegación existente          | Tests E2E pre/post refactor; feature flag para rollback                                        |
| Props drilling en pantallas          | Migrar pantallas una a una a `useReception()`, `useCatalogos()`                                |
| Estado inconsistente entre contextos | Un solo `ReceptionProvider` padre; contextos hijos solo lectura                                |
| Performance (re-renders)             | `React.memo` en Layout parts; `useMemo`/`useCallback` en providers; split contexts por dominio |

---

## 📋 Checklist de Validación Post-Refactor

- [ ] `npm run typecheck` pasa (strict: true)
- [ ] `npm run test:run` pasa (cobertura ≥ 80% en nuevos services/hooks)
- [ ] `npm run test:e2e` pasa (6 flows existentes)
- [ ] `npm run build` genera bundle sin warnings de chunk size excesivo
- [ ] App.tsx < 200 líneas
- [ ] Sin `any` en nuevos archivos
- [ ] Sin logic de negocio en componentes (solo en services/hooks)
- [ ] Contextos tipados con TypeScript interfaces estrictas

---

## 🚀 Orden de Ejecución Recomendado

```
1. types/index.ts + config/constants.ts + config/navigation.ts
2. contexts/ReceptionContext.tsx (más crítico, usado por todo)
3. contexts/CatalogosContext.tsx
4. contexts/InventoryContext.tsx
5. contexts/UIContext.tsx
5. hooks/useReceptionFlow.ts
6. components/layout/* (NavIcon, Sidebar, Header, BottomNav, Layout)
7. services/domain/conversionCalculator.ts
8. hooks/useScanner.ts (paralelo, CapturaTarima)
9. Migrar pantallas a hooks/contextos (una por PR)
10. App.tsx final cleanup
```

---

## 📝 Notas para Implementación

- **ReceptionContext** debe ser el provider "padre" que coordinan navegación + sesión
- **CatalogosContext** inicializa en `useEffect` con `canQuery` + feature flag (como ahora)
- **InventoryContext** consume `catalogoAlmacenes` de CatalogosContext → usar `useContext` interno o pasar como prop al provider
- **UIContext** es puramente UI state (mobile, sidebar), sin lógica de negocio
- **useReceptionFlow** encapsula toda la lógica de `navigate()` + `setCurrentReception` + `receptionSession.transition()`
- Mantener **compatibilidad** durante migración: pantallas pueden leer de `props` O de `context` durante transición
