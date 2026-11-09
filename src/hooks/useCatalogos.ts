/**
 * useCatalogos — God Component Refactor Phase 3
 *
 * Catalog operations: load, refresh, getters.
 * Delegates to CatalogosContext.
 */

import { useCallback } from "react";
import { useCatalogosContext } from "@/context";
import type { Producto, Proveedor, Conversion, Almacen } from "@/types";

// ============================================
// Hook Return Type
// ============================================

interface UseCatalogosReturn {
  // State (from context)
  catalogoProductos: Producto[];
  catalogoProveedores: Proveedor[];
  catalogoConversiones: Conversion[];
  catalogoAlmacenes: Almacen[];
  catalogosLoading: boolean;
  catalogosError: Error | null;

  // Actions
  loadCatalogos: () => Promise<void>;
  refreshCatalogos: () => Promise<void>;

  // Getters
  getProducto: (id: string) => Producto | undefined;
  getProveedor: (id: string) => Proveedor | undefined;
  getConversion: (id: string) => Conversion | undefined;
  getAlmacen: (id: string) => Almacen | undefined;
  getAlmacenActivo: () => Almacen | undefined;
}

// ============================================
// Hook
// ============================================

export function useCatalogos(): UseCatalogosReturn {
  const {
    catalogoProductos,
    catalogoProveedores,
    catalogoConversiones,
    catalogoAlmacenes,
    catalogosLoading,
    catalogosError,
    loadCatalogos: ctxLoadCatalogos,
    refreshCatalogos: ctxRefreshCatalogos,
    getProducto: ctxGetProducto,
    getProveedor: ctxGetProveedor,
    getConversion: ctxGetConversion,
    getAlmacen: ctxGetAlmacen,
    getAlmacenActivo: ctxGetAlmacenActivo,
  } = useCatalogosContext();

  // Wrap async functions to ensure they return void promise
  const loadCatalogos = useCallback(async () => {
    await ctxLoadCatalogos();
  }, [ctxLoadCatalogos]);

  const refreshCatalogos = useCallback(async () => {
    await ctxRefreshCatalogos();
  }, [ctxRefreshCatalogos]);

  return {
    // State
    catalogoProductos,
    catalogoProveedores,
    catalogoConversiones,
    catalogoAlmacenes,
    catalogosLoading,
    catalogosError,

    // Actions
    loadCatalogos,
    refreshCatalogos,

    // Getters
    getProducto: ctxGetProducto,
    getProveedor: ctxGetProveedor,
    getConversion: ctxGetConversion,
    getAlmacen: ctxGetAlmacen,
    getAlmacenActivo: ctxGetAlmacenActivo,
  };
}

export default useCatalogos;
