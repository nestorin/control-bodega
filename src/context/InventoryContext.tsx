/**
 * InventoryContext — God Component Refactor Phase 2
 *
 * Per-warehouse inventory CRUD: init, increase, decrease, activate warehouse.
 * Uses useReducer for state management.
 */

import { createContext, useContext, useReducer, useCallback, useMemo, ReactNode } from "react";
import type { Producto, Almacen } from "@/types";

// ============================================
// State & Action Types
// ============================================

interface InventoryState {
  inventario: Record<string, Record<string, number>>; // almacenId -> productId -> cajas
  almacenActivo: Almacen | null;
}

type InventoryAction =
  | {
      type: "INICIALIZAR_INVENTARIO_ALMACEN";
      payload: { almacenId: string; productos: Producto[] };
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
  | { type: "RESET_ALL" };

// ============================================
// Initial State
// ============================================

const initialState: InventoryState = {
  inventario: {},
  almacenActivo: null,
};

// ============================================
// Reducer
// ============================================

function inventoryReducer(state: InventoryState, action: InventoryAction): InventoryState {
  switch (action.type) {
    case "INICIALIZAR_INVENTARIO_ALMACEN": {
      const { almacenId, productos } = action.payload;
      if (state.inventario[almacenId]) {
        return state; // Already initialized
      }
      const inicial: Record<string, number> = {};
      productos.forEach((p) => {
        inicial[p.id] = 0;
      });
      return {
        ...state,
        inventario: { ...state.inventario, [almacenId]: inicial },
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

    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface InventoryContextValue extends InventoryState {
  inicializarInventarioAlmacen: (almacenId: string, productos: Producto[]) => void;
  handleActivarAlmacen: (almacen: Almacen) => void;
  aumentarInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => void;
  reducirInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => void;
  getInventarioAlmacen: (almacenId: string) => Record<string, number>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

interface InventoryProviderProps {
  children: ReactNode;
}

export function InventoryProvider({ children }: InventoryProviderProps) {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);

  const inicializarInventarioAlmacen = useCallback((almacenId: string, productos: Producto[]) => {
    dispatch({ type: "INICIALIZAR_INVENTARIO_ALMACEN", payload: { almacenId, productos } });
  }, []);

  const handleActivarAlmacen = useCallback((almacen: Almacen) => {
    dispatch({ type: "ACTIVAR_ALMACEN", payload: almacen });
  }, []);

  const aumentarInventario = useCallback(
    (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      dispatch({ type: "AUMENTAR_INVENTARIO", payload: { almacenId, productos } });
    },
    [],
  );

  const reducirInventario = useCallback(
    (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      dispatch({ type: "REDUCIR_INVENTARIO", payload: { almacenId, productos } });
    },
    [],
  );

  const getInventarioAlmacen = useCallback(
    (almacenId: string) => {
      return state.inventario[almacenId] ?? {};
    },
    [state.inventario],
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      ...state,
      inicializarInventarioAlmacen,
      handleActivarAlmacen,
      aumentarInventario,
      reducirInventario,
      getInventarioAlmacen,
    }),
    [
      state,
      inicializarInventarioAlmacen,
      handleActivarAlmacen,
      aumentarInventario,
      reducirInventario,
      getInventarioAlmacen,
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

export type { InventoryContextValue };
export default InventoryContext;
