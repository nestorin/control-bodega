/**
 * InventoryContext — God Component Refactor Phase 2
 *
 * Per-warehouse inventory CRUD: init, increase, decrease, activate warehouse.
 * Uses useReducer for state management with Firestore persistence.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { InventoryService } from "@/services/firestore/inventoryService";
import { db } from "@/lib/firebase";
import { isFeatureEnabled } from "@/config/featureFlags";
import type { Producto, Almacen } from "@/types";
import { useOfflineQueue } from "@/hooks/useFirestore";

// ============================================
// State & Action Types
// ============================================

interface InventoryState {
  inventario: Record<string, Record<string, number>>; // almacenId -> productId -> cajas
  almacenActivo: Almacen | null;
  loading: boolean;
  error: Error | null;
  // Cache version for invalidation
  cacheVersion: Record<string, number>;
}

type InventoryAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: Error | null }
  | {
      type: "INICIALIZAR_INVENTARIO_ALMACEN";
      payload: { almacenId: string; stock: Record<string, number>; version: number };
    }
  | { type: "ACTIVAR_ALMACEN"; payload: Almacen }
  | {
      type: "AUMENTAR_INVENTARIO";
      payload: { almacenId: string; productos: Array<{ productoId: string; cajas: number }> };
    }
  | {
      type: "REDUCIR_INVENTARIO";
      payload: { almacenId: string; productos: Array<{ productoId: string; cajas: number }> };
    }
  | { type: "RESET_ALL" }
  | { type: "SET_CACHE_VERSION"; payload: { almacenId: string; version: number } };

// ============================================
// Initial State
// ============================================

const initialState: InventoryState = {
  inventario: {},
  almacenActivo: null,
  loading: false,
  error: null,
  cacheVersion: {},
};

// ============================================
// Reducer
// ============================================

function inventoryReducer(state: InventoryState, action: InventoryAction): InventoryState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "INICIALIZAR_INVENTARIO_ALMACEN": {
      const { almacenId, stock, version } = action.payload;
      if (state.inventario[almacenId] && state.cacheVersion[almacenId] >= version) {
        return state; // Already initialized with same or newer version
      }
      return {
        ...state,
        inventario: { ...state.inventario, [almacenId]: stock },
        cacheVersion: { ...state.cacheVersion, [almacenId]: version },
        loading: false,
        error: null,
      };
    }

    case "ACTIVAR_ALMACEN":
      return {
        ...state,
        almacenActivo: action.payload,
      };

    case "AUMENTAR_INVENTARIO": {
      const { almacenId, productos } = action.payload;
      const almacen = state.inventario[almacenId] ?? {};
      const actualizado = { ...almacen };
      productos.forEach(({ productoId, cajas }) => {
        actualizado[productoId] = (actualizado[productoId] ?? 0) + cajas;
      });
      return {
        ...state,
        inventario: { ...state.inventario, [almacenId]: actualizado },
      };
    }

    case "REDUCIR_INVENTARIO": {
      const { almacenId, productos } = action.payload;
      const almacen = state.inventario[almacenId] ?? {};
      const actualizado = { ...almacen };
      productos.forEach(({ productoId, cajas }) => {
        actualizado[productoId] = Math.max(0, (actualizado[productoId] ?? 0) - cajas);
      });
      return {
        ...state,
        inventario: { ...state.inventario, [almacenId]: actualizado },
      };
    }

    case "RESET_ALL":
      return initialState;

    case "SET_CACHE_VERSION": {
      const { almacenId, version } = action.payload;
      return {
        ...state,
        cacheVersion: { ...state.cacheVersion, [almacenId]: version },
      };
    }

    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface InventoryContextValue extends InventoryState {
  inicializarInventarioAlmacen: (almacenId: string, productos: Producto[]) => Promise<void>;
  handleActivarAlmacen: (almacen: Almacen) => Promise<void>;
  aumentarInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => Promise<void>;
  reducirInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => Promise<void>;
  getInventarioAlmacen: (almacenId: string) => Record<string, number>;
  refreshInventarioAlmacen: (almacenId: string) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

interface InventoryProviderProps {
  children: ReactNode;
  orgId?: string;
}

export function InventoryProvider({ children, orgId = "org_exepa_001" }: InventoryProviderProps) {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);
  const inventoryServiceRef = useRef<InventoryService | null>(null);
  const initPromisesRef = useRef<Record<string, Promise<void>>>({});

  // Initialize service when Firestore is available and feature flag is on
  useEffect(() => {
    if (db && isFeatureEnabled("USE_FIRESTORE_INVENTARIO")) {
      inventoryServiceRef.current = new InventoryService(db, orgId);
    }
  }, [db, orgId]);

  // Offline queue for inventory operations
  const { enqueue, isOnline } = useOfflineQueue(db, orgId);

  const inicializarInventarioAlmacen = useCallback(
    async (almacenId: string, productos: Producto[]) => {
      // Prevent duplicate initialization calls
      if (almacenId in initPromisesRef.current) {
        return initPromisesRef.current[almacenId];
      }

      // If already initialized in cache, skip
      if (state.inventario[almacenId] && state.cacheVersion[almacenId] > 0) {
        return;
      }

      const initPromise = (async () => {
        dispatch({ type: "SET_LOADING", payload: true });
        dispatch({ type: "SET_ERROR", payload: null });

        try {
          if (!inventoryServiceRef.current) {
            throw new Error(
              "Inventory service not initialized. Check Firestore connection and feature flag.",
            );
          }

          const service = inventoryServiceRef.current;

          // Try to get existing inventory from Firestore
          const warehouseStock = await service.getInventarioAlmacen(almacenId);

          // If no stock exists, initialize with zeros for all products
          let stock = warehouseStock;
          if (Object.keys(stock).length === 0 && productos.length > 0) {
            await service.createInventarioInicial(almacenId, productos);
            const inicial: Record<string, number> = {};
            productos.forEach((p) => {
              inicial[p.id] = 0;
            });
            stock = inicial;
          }

          // Use timestamp as cache version
          const version = Date.now();

          dispatch({
            type: "INICIALIZAR_INVENTARIO_ALMACEN",
            payload: { almacenId, stock, version },
          });
        } catch (error) {
          dispatch({ type: "SET_ERROR", payload: error as Error });
          // Fallback: initialize locally with zeros
          const inicial: Record<string, number> = {};
          productos.forEach((p) => {
            inicial[p.id] = 0;
          });
          const version = Date.now();
          dispatch({
            type: "INICIALIZAR_INVENTARIO_ALMACEN",
            payload: { almacenId, stock: inicial, version },
          });
        }
      })();

      initPromisesRef.current[almacenId] = initPromise;
      try {
        await initPromise;
      } finally {
        delete initPromisesRef.current[almacenId];
      }
    },
    [state.inventario, state.cacheVersion],
  );

  const handleActivarAlmacen = useCallback(
    async (almacen: Almacen) => {
      dispatch({ type: "ACTIVAR_ALMACEN", payload: almacen });
      // Initialize inventory when activating warehouse if not already done
      if (!state.inventario[almacen.id] || state.cacheVersion[almacen.id] === 0) {
        // We need products to initialize - this will be called with products from the caller
        // The caller should ensure products are available
      }
    },
    [state.inventario, state.cacheVersion],
  );

  const executeWithOfflineSupport = useCallback(
    async (
      operation: () => Promise<void>,
      queueOperation: Omit<Parameters<typeof enqueue>[0], "id" | "timestamp" | "retryCount">,
    ) => {
      try {
        await operation();
      } catch (error) {
        // If offline, queue the operation for later sync
        if (!isOnline) {
          enqueue(queueOperation);
        }
        throw error;
      }
    },
    [enqueue, isOnline],
  );

  const aumentarInventario = useCallback(
    async (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      // Optimistic update
      dispatch({ type: "AUMENTAR_INVENTARIO", payload: { almacenId, productos } });

      const operation = async () => {
        if (!inventoryServiceRef.current) {
          throw new Error("Inventory service not initialized");
        }

        const service = inventoryServiceRef.current;
        const operationId = `increase-${almacenId}-${Date.now()}`;

        // Use the new compatibility method
        await service.aumentarInventario(almacenId, productos, operationId, "user");

        // Invalidate cache version to force refresh on next read
        dispatch({ type: "SET_CACHE_VERSION", payload: { almacenId, version: Date.now() } });
      };

      const queueOp = {
        type: "create" as const,
        collectionPath: `organizations/{orgId}/inventory_movements`,
        data: {
          warehouseId: almacenId,
          products: productos,
          movementType: "RECEIPT",
          operationId: `increase-${almacenId}-${Date.now()}`,
        },
        operationId: `increase-${almacenId}-${Date.now()}`,
      };

      await executeWithOfflineSupport(operation, queueOp);
    },
    [executeWithOfflineSupport],
  );

  const reducirInventario = useCallback(
    async (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      // Local validation: prevent negative stock
      const almacen = state.inventario[almacenId] ?? {};
      for (const { productoId, cajas } of productos) {
        const current = almacen[productoId] ?? 0;
        if (current < cajas) {
          throw new Error(
            `Stock insuficiente para producto ${productoId}: disponible ${current}, solicitado ${cajas}`,
          );
        }
      }

      // Optimistic update
      dispatch({ type: "REDUCIR_INVENTARIO", payload: { almacenId, productos } });

      const operation = async () => {
        if (!inventoryServiceRef.current) {
          throw new Error("Inventory service not initialized");
        }

        const service = inventoryServiceRef.current;
        const operationId = `decrease-${almacenId}-${Date.now()}`;

        // Use the new compatibility method
        await service.reducirInventario(almacenId, productos, operationId, "user");

        // Invalidate cache version
        dispatch({ type: "SET_CACHE_VERSION", payload: { almacenId, version: Date.now() } });
      };

      const queueOp = {
        type: "create" as const,
        collectionPath: `organizations/{orgId}/inventory_movements`,
        data: {
          warehouseId: almacenId,
          products: productos,
          movementType: "SHIPMENT",
          operationId: `decrease-${almacenId}-${Date.now()}`,
        },
        operationId: `decrease-${almacenId}-${Date.now()}`,
      };

      await executeWithOfflineSupport(operation, queueOp);
    },
    [state.inventario, executeWithOfflineSupport],
  );

  const getInventarioAlmacen = useCallback(
    (almacenId: string) => {
      return state.inventario[almacenId] ?? {};
    },
    [state.inventario],
  );

  const refreshInventarioAlmacen = useCallback(async (almacenId: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      if (!inventoryServiceRef.current) {
        throw new Error("Inventory service not initialized");
      }
      const service = inventoryServiceRef.current;
      const stock = await service.getInventarioAlmacen(almacenId);
      dispatch({
        type: "INICIALIZAR_INVENTARIO_ALMACEN",
        payload: { almacenId, stock, version: Date.now() },
      });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error as Error });
    }
  }, []);

  const value = useMemo<InventoryContextValue>(
    () => ({
      ...state,
      inicializarInventarioAlmacen,
      handleActivarAlmacen,
      aumentarInventario,
      reducirInventario,
      getInventarioAlmacen,
      refreshInventarioAlmacen,
    }),
    [
      state,
      inicializarInventarioAlmacen,
      handleActivarAlmacen,
      aumentarInventario,
      reducirInventario,
      getInventarioAlmacen,
      refreshInventarioAlmacen,
    ],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useInventoryContext(): InventoryContextValue {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error("useInventoryContext must be used within an InventoryProvider");
  }
  return context;
}

export type { InventoryContextValue, InventoryState };
export { inventoryReducer };
export default InventoryContext;
