/**
 * useInventory — God Component Refactor Phase 3
 *
 * Inventory operations: init, activate, increase, decrease.
 * Delegates to InventoryContext with negative stock prevention.
 * Now async to work with Firestore.
 */

import { useCallback } from "react";
import { useInventoryContext } from "@/context";
import type { Producto, Almacen } from "@/types";

// ============================================
// Hook Return Type
// ============================================

interface UseInventoryReturn {
  // State (from context)
  inventario: Record<string, Record<string, number>>;
  almacenActivo: Almacen | null;
  loading: boolean;
  error: Error | null;

  // Actions (async)
  inicializarInventario: (almacenId: string, productos: Producto[]) => Promise<void>;
  activarAlmacen: (almacen: Almacen) => Promise<void>;
  aumentarInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => Promise<void>;
  reducirInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => Promise<void>;

  // Getters
  getInventarioAlmacen: (almacenId: string) => Record<string, number>;
  refreshInventarioAlmacen: (almacenId: string) => Promise<void>;
}

// ============================================
// Hook
// ============================================

export function useInventory(): UseInventoryReturn {
  const {
    inventario,
    almacenActivo,
    loading,
    error,
    inicializarInventarioAlmacen: ctxInicializarInventarioAlmacen,
    handleActivarAlmacen: ctxHandleActivarAlmacen,
    aumentarInventario: ctxAumentarInventario,
    reducirInventario: ctxReducirInventario,
    getInventarioAlmacen: ctxGetInventarioAlmacen,
    refreshInventarioAlmacen: ctxRefreshInventarioAlmacen,
  } = useInventoryContext();

  // Wrapper that matches the expected API
  const inicializarInventario = useCallback(
    async (almacenId: string, productos: Producto[]) => {
      await ctxInicializarInventarioAlmacen(almacenId, productos);
    },
    [ctxInicializarInventarioAlmacen],
  );

  const activarAlmacen = useCallback(
    async (almacen: Almacen) => {
      await ctxHandleActivarAlmacen(almacen);
    },
    [ctxHandleActivarAlmacen],
  );

  const aumentarInventario = useCallback(
    async (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      // Validation: ensure positive cajas
      const validProductos = productos.filter((p) => p.cajas > 0);
      if (validProductos.length !== productos.length) {
        console.warn("[useInventory] Some products had non-positive cajas, filtering them out");
      }
      if (validProductos.length === 0) {
        return; // Nothing to do
      }
      await ctxAumentarInventario(almacenId, validProductos);
    },
    [ctxAumentarInventario],
  );

  const reducirInventario = useCallback(
    async (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      // Validation: ensure positive cajas
      const validProductos = productos.filter((p) => p.cajas > 0);
      if (validProductos.length !== productos.length) {
        console.warn("[useInventory] Some products had non-positive cajas, filtering them out");
      }
      if (validProductos.length === 0) {
        return; // Nothing to do
      }
      // The context reducer and Firestore transaction both prevent negative stock
      await ctxReducirInventario(almacenId, validProductos);
    },
    [ctxReducirInventario],
  );

  return {
    // State
    inventario,
    almacenActivo,
    loading,
    error,

    // Actions
    inicializarInventario,
    activarAlmacen,
    aumentarInventario,
    reducirInventario,

    // Getters
    getInventarioAlmacen: ctxGetInventarioAlmacen,
    refreshInventarioAlmacen: ctxRefreshInventarioAlmacen,
  };
}

export default useInventory;
