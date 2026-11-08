/**
 * useInventory — God Component Refactor Phase 3
 *
 * Inventory operations: init, activate, increase, decrease.
 * Delegates to InventoryContext with negative stock prevention.
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

  // Actions
  inicializarInventario: (almacenId: string, productos: Producto[]) => void;
  activarAlmacen: (almacen: Almacen) => void;
  aumentarInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => void;
  reducirInventario: (
    almacenId: string,
    productos: Array<{ productoId: string; cajas: number }>,
  ) => void;

  // Getters
  getInventarioAlmacen: (almacenId: string) => Record<string, number>;
}

// ============================================
// Hook
// ============================================

export function useInventory(): UseInventoryReturn {
  const {
    inventario,
    almacenActivo,
    inicializarInventarioAlmacen: ctxInicializarInventarioAlmacen,
    handleActivarAlmacen: ctxHandleActivarAlmacen,
    aumentarInventario: ctxAumentarInventario,
    reducirInventario: ctxReducirInventario,
    getInventarioAlmacen: ctxGetInventarioAlmacen,
  } = useInventoryContext();

  // Wrapper that matches the expected API
  const inicializarInventario = useCallback(
    (almacenId: string, productos: Producto[]) => {
      ctxInicializarInventarioAlmacen(almacenId, productos);
    },
    [ctxInicializarInventarioAlmacen],
  );

  const activarAlmacen = useCallback(
    (almacen: Almacen) => {
      ctxHandleActivarAlmacen(almacen);
    },
    [ctxHandleActivarAlmacen],
  );

  const aumentarInventario = useCallback(
    (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      // Validation: ensure positive cajas
      const validProductos = productos.filter((p) => p.cajas > 0);
      if (validProductos.length !== productos.length) {
        console.warn("[useInventory] Some products had non-positive cajas, filtering them out");
      }
      ctxAumentarInventario(almacenId, validProductos);
    },
    [ctxAumentarInventario],
  );

  const reducirInventario = useCallback(
    (almacenId: string, productos: Array<{ productoId: string; cajas: number }>) => {
      // Validation: ensure positive cajas
      const validProductos = productos.filter((p) => p.cajas > 0);
      if (validProductos.length !== productos.length) {
        console.warn("[useInventory] Some products had non-positive cajas, filtering them out");
      }
      // The reducer already prevents negative stock with Math.max(0, ...)
      ctxReducirInventario(almacenId, validProductos);
    },
    [ctxReducirInventario],
  );

  return {
    // State
    inventario,
    almacenActivo,

    // Actions
    inicializarInventario,
    activarAlmacen,
    aumentarInventario,
    reducirInventario,

    // Getters
    getInventarioAlmacen: ctxGetInventarioAlmacen,
  };
}

export default useInventory;
