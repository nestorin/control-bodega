/**
 * Context Barrel Export — God Component Refactor Phase 2
 *
 * Centralized exports for all context providers and hooks.
 */

export {
  ReceptionProvider,
  useReceptionContext,
  type ReceptionContextValue,
} from "./ReceptionContext";

export {
  CatalogosProvider,
  useCatalogosContext,
  type CatalogosContextValue,
} from "./CatalogosContext";

export {
  InventoryProvider,
  useInventoryContext,
  type InventoryContextValue,
} from "./InventoryContext";

export { UIProvider, useUIContext, type UIContextValue } from "./UIContext";

// Re-export AuthContext (existing)
export { AuthProvider, useAuth } from "./AuthContext";
