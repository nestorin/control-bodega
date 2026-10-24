export interface ReceptionListSource {
  id: string;
  operationId?: string;
  folio?: string;
  purchaseOrderNumber?: string;
  supplierName?: string;
  supplierCode?: string;
  productName?: string;
  palletCount?: number;
  status?: string;
  plannedPallets?: Array<{ productName?: string; status?: string }>;
  createdAt?: { toDate?: () => Date };
  receivedAt?: { toDate?: () => Date };
}

export function mapReceptionListItem(source: ReceptionListSource) {
  const palletNames = [
    ...new Set((source.plannedPallets ?? []).map((pallet) => pallet.productName).filter(Boolean)),
  ];
  const date = source.receivedAt?.toDate?.() ?? source.createdAt?.toDate?.();
  return {
    id: source.id,
    displayId: source.folio || source.purchaseOrderNumber || source.id,
    supplier: source.supplierName || source.supplierCode || "Sin proveedor",
    product: source.productName || palletNames.join(", ") || "Sin producto",
    palletCount: source.plannedPallets?.length ?? source.palletCount ?? 0,
    date: date?.toLocaleDateString("es-ES") ?? "",
    status: source.status ?? "DRAFT",
    canResume:
      (source.status === "DRAFT" || source.status === "IN_PROGRESS") &&
      Boolean(source.plannedPallets?.length),
  };
}

export function getFirstIncompletePalletIndex(pallets: Array<{ status?: string }>): number {
  const firstIncomplete = pallets.findIndex(
    (pallet) => !["ACTIVE", "RECEIVED"].includes(pallet.status || ""),
  );
  return firstIncomplete >= 0 ? firstIncomplete : Math.max(0, pallets.length - 1);
}

export function shouldReadLocalPalletCache(
  hasCanonicalPlan: boolean,
  firestoreEnabled: boolean,
): boolean {
  return !(hasCanonicalPlan && firestoreEnabled);
}
