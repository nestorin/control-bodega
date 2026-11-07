# App Routing Specification

## Purpose

Defines the application routing structure and provider composition. After refactor, `App.tsx` is reduced to <200 lines containing only routing configuration and provider hierarchy.

## Requirements

### Requirement: Provider Hierarchy

The system SHALL compose providers in the correct dependency order.

#### Scenario: Provider nesting order

- GIVEN the App component renders
- WHEN providers are composed
- THEN nesting order is:
  1. `BrowserRouter` (outermost)
  2. `AuthProvider` (existing)
  3. `ReceptionProvider` (new - coordinates navigation + session)
  4. `CatalogosProvider` (new - loads catalogs)
  5. `InventoryProvider` (new - depends on CatalogosContext for warehouses)
  6. `UIProvider` (new - pure UI state)
  7. `Layout` (new - composes Sidebar, Header, BottomNav)
  8. `Routes` (innermost)

### Requirement: Route Definitions

The system SHALL define all application routes with their corresponding screen components.

#### Scenario: Public routes

- GIVEN the app loads
- WHEN not authenticated
- THEN only login route is accessible

#### Scenario: Protected reception routes

- GIVEN user is authenticated
- WHEN accessing reception screens
- THEN routes are:
  - `/recepciones` → RecepcionesScreen
  - `/programacion-recepcion` → ProgramacionRecepcionScreen
  - `/nueva-step1` → NuevaRecepcionStep1Screen
  - `/captura-evidencia` → CapturaEvidenciaScreen
  - `/captura-tarima` → CapturaTarimaScreen
  - `/tarima-detalle` → TarimaDetalleScreen
  - `/completada` → CompletadaScreen
  - `/editar-recepcion` → EditarRecepcionScreen

#### Scenario: Protected catalog/inventory routes

- GIVEN user is authenticated
- WHEN accessing management screens
- THEN routes are:
  - `/catalogos` → CatalogosScreen
  - `/inventario` → InventarioScreen

### Requirement: Layout Wrapper

The system SHALL wrap all authenticated routes with the Layout component.

#### Scenario: Layout provides shell

- GIVEN any protected route
- WHEN rendered
- THEN Layout provides:
  - Sidebar navigation (desktop)
  - Header with context-aware title/actions
  - BottomNav (mobile)
  - Responsive behavior via UIContext

### Requirement: Minimal App.tsx

The system SHALL keep App.tsx under 200 lines.

#### Scenario: App.tsx line count

- GIVEN the refactored App.tsx
- WHEN counted
- THEN total lines < 200
- AND only contains: imports, provider composition, route definitions, Layout wrapper
- AND NO business logic, NO state management, NO UI rendering beyond providers/routes

### Requirement: Feature Flag for Rollback

The system SHALL support feature flag to toggle new reception flow.

#### Scenario: Feature flag controls flow

- GIVEN `VITE_USE_NEW_RECEPTION_FLOW=false`
- WHEN app loads
- THEN legacy AppLayout behavior is used (if implemented)
- GIVEN `VITE_USE_NEW_RECEPTION_FLOW=true`
- WHEN app loads
- THEN new context-based flow is used
