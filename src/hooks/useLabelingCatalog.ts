/**
 * useLabelingCatalog — Hook for labeling catalog operations
 *
 * Provides access to labeling companies and eligible products.
 * Delegates to LabelingCatalogContext.
 */

import { useCallback } from "react";
import { useLabelingCatalogContext } from "@/context/LabelingCatalogContext";
import type { LabelingCompany, LabelingEligibleProduct } from "@/types/labeling";

export function useLabelingCatalog() {
  const {
    labelingCompanies,
    eligibleProducts,
    catalogosLoading,
    catalogosError,
    loadCatalogs,
    refreshCatalogs,
  } = useLabelingCatalogContext();

  return {
    labelingCompanies: labelingCompanies as LabelingCompany[],
    eligibleProducts: eligibleProducts as LabelingEligibleProduct[],
    catalogosLoading,
    catalogosError,
    loadCatalogs: useCallback((warehouseId: string) => loadCatalogs(warehouseId), [loadCatalogs]),
    refreshCatalogs,
  };
}

export default useLabelingCatalog;
