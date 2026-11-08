/**
 * LabelingCatalogContext — Labeling Module Phase 2
 *
 * Catalogs loading/sync with Firestore: labeling companies, products eligible for labeling.
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
import type { LabelingCompany, LabelingEligibleProduct } from "@/types/labeling";
import { createFirestoreServices } from "@/services/firestore";
import { db } from "@/lib/firebase";
import { isFeatureEnabled } from "@/config/featureFlags";
import { ORGANIZATION_ID } from "@/config/organization";

// ============================================
// State & Action Types
// ============================================

interface LabelingCatalogState {
  labelingCompanies: any[];
  eligibleProducts: LabelingEligibleProduct[];
  catalogosLoading: boolean;
  catalogosError: Error | null;
}

type LabelingCatalogAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: Error | null }
  | { type: "SET_COMPANIES"; payload: any[] }
  | { type: "SET_ELIGIBLE_PRODUCTS"; payload: any[] }
  | { type: "RESET_ALL" };

const initialState: LabelingCatalogState = {
  labelingCompanies: [],
  eligibleProducts: [],
  catalogosLoading: false,
  catalogosError: null,
};

function labelingCatalogReducer(
  state: LabelingCatalogState,
  action: LabelingCatalogAction,
): LabelingCatalogState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, catalogosLoading: action.payload };
    case "SET_ERROR":
      return { ...state, catalogosError: action.payload };
    case "SET_COMPANIES":
      return { ...state, labelingCompanies: action.payload };
    case "SET_ELIGIBLE_PRODUCTS":
      return { ...state, eligibleProducts: action.payload };
    case "RESET_ALL":
      return initialState;
    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface LabelingCatalogContextValue extends LabelingCatalogState {
  loadCatalogs: (warehouseId: string) => Promise<void>;
  refreshCatalogs: () => Promise<void>;
}

const LabelingCatalogContext = createContext<LabelingCatalogContextValue | null>(null);

interface LabelingCatalogProviderProps {
  children: ReactNode;
  canQuery: boolean;
}

export function LabelingCatalogProvider({ children, canQuery }: LabelingCatalogProviderProps) {
  const [state, dispatch] = useReducer(labelingCatalogReducer, initialState);

  const loadCatalogs = useCallback(async () => {
    if (!canQuery || !isFeatureEnabled("USE_FIRESTORE_LABELING_CATALOGOS") || !db) {
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const services = createFirestoreServices(db, ORGANIZATION_ID);

      // Load labeling companies (if collection exists)
      const [companiesResult, productsResult] = await Promise.allSettled([
        // Try to get labeling companies - may not exist yet
        Promise.resolve({ data: [] }),
        // Get products that are lotControlled or expiryControlled (eligible for labeling)
        services.products.getAll({
          where: [
            ["lotControlled", "==", true],
            ["expiryControlled", "==", true],
          ],
          orderBy: ["name", "asc"],
        }),
      ]);

      if (productsResult.status === "fulfilled") {
        dispatch({
          type: "SET_ELIGIBLE_PRODUCTS",
          payload: productsResult.value.data.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            lotControlled: p.lotControlled,
            expiryControlled: p.expiryControlled,
          })),
        });
      } else {
        console.error("Failed to load eligible products:", productsResult.reason);
        dispatch({
          type: "SET_ELIGIBLE_PRODUCTS",
          payload: [],
        });
      }

      // For now, return empty companies (can be extended later)
      dispatch({
        type: "SET_COMPANIES",
        payload: [],
      });
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error : new Error("Error loading labeling catalogs"),
      });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [canQuery]);

  const refreshCatalogs = useCallback(async () => {
    await loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  const value = useMemo<LabelingCatalogContextValue>(
    () => ({
      ...state,
      loadCatalogs,
      refreshCatalogs,
    }),
    [state, loadCatalogs, refreshCatalogs],
  );

  return (
    <LabelingCatalogContext.Provider value={value}>{children}</LabelingCatalogContext.Provider>
  );
}

export function useLabelingCatalogContext(): LabelingCatalogContextValue {
  const context = useContext(LabelingCatalogContext);
  if (!context) {
    throw new Error("useLabelingCatalogContext must be used within a LabelingCatalogProvider");
  }
  return context;
}

export default LabelingCatalogContext;
