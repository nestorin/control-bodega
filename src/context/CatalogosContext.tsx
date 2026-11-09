/**
 * CatalogosContext — God Component Refactor Phase 2
 *
 * Catalogs loading/sync with Firestore: productos, proveedores, conversiones, almacenes.
 * Uses useReducer for state management.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import type { Producto, Proveedor, Conversion, Almacen } from "@/types";
import { createFirestoreServices } from "@/services/firestore";
import { db } from "@/lib/firebase";
import { isFeatureEnabled } from "@/config/featureFlags";
import { ORGANIZATION_ID } from "@/config/constants";
import {
  mergeSupplierCatalog,
  normalizeSupplierType,
  CANONICAL_SUPPLIER_LOCAL,
} from "@/config/supplierCatalog";

// ============================================
// State & Action Types
// ============================================

interface CatalogosState {
  catalogoProductos: Producto[];
  catalogoProveedores: Proveedor[];
  catalogoConversiones: Conversion[];
  catalogoAlmacenes: Almacen[];
  catalogosLoading: boolean;
  catalogosError: Error | null;
}

type CatalogosAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: Error | null }
  | { type: "SET_PRODUCTOS"; payload: Producto[] }
  | { type: "SET_PROVEEDORES"; payload: Proveedor[] }
  | { type: "SET_CONVERSIONES"; payload: Conversion[] }
  | { type: "SET_ALMACENES"; payload: Almacen[] }
  | { type: "RESET_ALL" };

// ============================================
// Initial State
// ============================================

const initialState: CatalogosState = {
  catalogoProductos: [],
  catalogoProveedores: [],
  catalogoConversiones: [],
  catalogoAlmacenes: [],
  catalogosLoading: false,
  catalogosError: null,
};

// ============================================
// Reducer
// ============================================

function catalogosReducer(state: CatalogosState, action: CatalogosAction): CatalogosState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, catalogosLoading: action.payload };

    case "SET_ERROR":
      return { ...state, catalogosError: action.payload };

    case "SET_PRODUCTOS":
      return { ...state, catalogoProductos: action.payload };

    case "SET_PROVEEDORES":
      return { ...state, catalogoProveedores: action.payload };

    case "SET_CONVERSIONES":
      return { ...state, catalogoConversiones: action.payload };

    case "SET_ALMACENES":
      return { ...state, catalogoAlmacenes: action.payload };

    case "RESET_ALL":
      return initialState;

    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface CatalogosContextValue extends CatalogosState {
  loadCatalogos: () => Promise<void>;
  refreshCatalogos: () => Promise<void>;
  // Getters
  getProducto: (id: string) => Producto | undefined;
  getProveedor: (id: string) => Proveedor | undefined;
  getConversion: (id: string) => Conversion | undefined;
  getAlmacen: (id: string) => Almacen | undefined;
  getAlmacenActivo: () => Almacen | undefined;
}

const CatalogosContext = createContext<CatalogosContextValue | null>(null);

interface CatalogosProviderProps {
  children: ReactNode;
  canQuery: boolean;
}

export function CatalogosProvider({ children, canQuery }: CatalogosProviderProps) {
  const [state, dispatch] = useReducer(catalogosReducer, initialState);

  const loadCatalogos = useCallback(async () => {
    if (!canQuery || !isFeatureEnabled("USE_FIRESTORE_CATALOGOS") || !db) {
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    const services = createFirestoreServices(db, ORGANIZATION_ID);
    let active = true;

    try {
      const [products, suppliers, conversions, warehouses] = await Promise.allSettled([
        services.products.getAll({ orderBy: ["name", "asc"] }),
        services.suppliers.getAll({ orderBy: ["code", "asc"] }),
        services.conversions.getAll({ orderBy: ["productName", "asc"] }),
        services.warehouses.getAll({ orderBy: ["code", "asc"] }),
      ]);

      if (!active) return;

      const failed = [products, suppliers, conversions, warehouses].filter(
        (result) => result.status === "rejected",
      );

      dispatch({
        type: "SET_ERROR",
        payload:
          failed.length > 0
            ? new Error(`${failed.length} catálogo(s) no pudieron actualizarse`)
            : null,
      });

      if (products.status === "fulfilled") {
        dispatch({
          type: "SET_PRODUCTOS",
          payload: products.value.data.map((p) => ({
            id: p.id,
            nombre: p.name,
            sku: p.sku,
            categoria: p.category || "",
            unidad: p.unit as Producto["unidad"],
            activo: true,
            codigosProveedor: p.supplierCodes || [],
          })),
        });
      }

      if (suppliers.status === "fulfilled") {
        dispatch({
          type: "SET_PROVEEDORES",
          payload: mergeSupplierCatalog(
            suppliers.value.data.map((p) => ({
              id: p.id,
              nombre: p.name,
              contacto: p.contact || "",
              telefono: p.phone || "",
              email: p.email || "",
              tipo: normalizeSupplierType(
                p.tipo,
                CANONICAL_SUPPLIER_LOCAL.find((supplier) => supplier.id === p.id)?.tipo,
              ),
            })),
          ),
        });
      }

      if (conversions.status === "fulfilled") {
        dispatch({
          type: "SET_CONVERSIONES",
          payload: conversions.value.data.map((c) => ({
            id: c.id,
            producto: c.productName,
            piezasPorCaja: c.piecesPerBox,
            cajasPorTarima: c.boxesPerPallet,
            pesoKgCaja: c.weightKgPerBox || "",
          })),
        });
      }

      if (warehouses.status === "fulfilled") {
        dispatch({
          type: "SET_ALMACENES",
          payload: warehouses.value.data.map((w) => ({
            id: w.id,
            nombre: w.name,
            ubicacion: w.location || "",
            responsable: w.manager || "",
            activo: w.active ?? false,
            creadoEn:
              w.createdAt?.toDate?.()?.toISOString?.().slice(0, 10) ||
              new Date().toISOString().slice(0, 10),
          })),
        });
      }
    } catch (error) {
      if (active) {
        dispatch({
          type: "SET_ERROR",
          payload:
            error instanceof Error ? error : new Error("Error desconocido al cargar catálogos"),
        });
      }
    } finally {
      if (active) {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    }
  }, [canQuery]);

  const refreshCatalogos = useCallback(async () => {
    await loadCatalogos();
  }, [loadCatalogos]);

  // Auto-load on canQuery change
  useEffect(() => {
    loadCatalogos();
  }, [loadCatalogos]);

  // Getters
  const getProducto = useCallback(
    (id: string) => {
      return state.catalogoProductos.find((p) => p.id === id);
    },
    [state.catalogoProductos],
  );

  const getProveedor = useCallback(
    (id: string) => {
      return state.catalogoProveedores.find((p) => p.id === id);
    },
    [state.catalogoProveedores],
  );

  const getConversion = useCallback(
    (id: string) => {
      return state.catalogoConversiones.find((c) => c.id === id);
    },
    [state.catalogoConversiones],
  );

  const getAlmacen = useCallback(
    (id: string) => {
      return state.catalogoAlmacenes.find((a) => a.id === id);
    },
    [state.catalogoAlmacenes],
  );

  const getAlmacenActivo = useCallback(() => {
    return state.catalogoAlmacenes.find((a) => a.activo);
  }, [state.catalogoAlmacenes]);

  const value = useMemo<CatalogosContextValue>(
    () => ({
      ...state,
      loadCatalogos,
      refreshCatalogos,
      getProducto,
      getProveedor,
      getConversion,
      getAlmacen,
      getAlmacenActivo,
    }),
    [
      state,
      loadCatalogos,
      refreshCatalogos,
      getProducto,
      getProveedor,
      getConversion,
      getAlmacen,
      getAlmacenActivo,
    ],
  );

  return <CatalogosContext.Provider value={value}>{children}</CatalogosContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useCatalogosContext(): CatalogosContextValue {
  const context = useContext(CatalogosContext);
  if (!context) {
    throw new Error("useCatalogosContext must be used within a CatalogosProvider");
  }
  return context;
}

export type { CatalogosContextValue };
export default CatalogosContext;
