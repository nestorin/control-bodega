import type { ReceptionDoc } from "@/services/firestore/types";
import type { ReceptionData, Screen } from "@/types";

export type ResumeTargetScreen = Extract<Screen, "editar-recepcion" | "captura-tarima">;

/**
 * Reception navigation is state-driven, so every resume entry point must map
 * persisted documents to the same context state and target screen.
 */
export function resolveResumeTarget(status: ReceptionDoc["status"]): ResumeTargetScreen | null {
  if (status === "DRAFT") return "editar-recepcion";
  if (status === "IN_PROGRESS") return "captura-tarima";
  return null;
}

/** Maps a persisted reception document into the state consumed by the capture flow. */
export function mapReceptionDocToReceptionData(doc: ReceptionDoc): ReceptionData {
  const plannedPallets = doc.plannedPallets ?? [];
  const productsByLine = new Map<number, (typeof plannedPallets)[number]>();

  for (const pallet of plannedPallets) {
    const lineIndex = pallet.lineIndex ?? 0;
    if (!productsByLine.has(lineIndex)) productsByLine.set(lineIndex, pallet);
  }

  return {
    ocFolio: doc.folio || doc.purchaseOrderNumber || doc.id,
    tarimas: doc.plannedPallets?.length ?? doc.palletCount ?? 0,
    proveedor: doc.supplierName || doc.supplierCode || "",
    proveedorLogistico: doc.logisticsProvider || "",
    receptionId: doc.id,
    warehouseId: doc.warehouseId,
    fechaRecepcion: doc.receivedAt?.toDate?.()?.toLocaleDateString("es-ES") ?? "",
    plannedPallets,
    purchaseOrderId: doc.purchaseOrderId,
    purchaseOrderNumber: doc.purchaseOrderNumber,
    supplierCode: doc.supplierCode,
    supplierName: doc.supplierName,
    logisticsProvider: doc.logisticsProvider,
    scheduledDate: doc.scheduledDate,
    productos: Array.from(productsByLine.entries()).map(([lineIndex, pallet]) => ({
      productId: pallet.productId ?? null,
      codigo: null,
      nombre: pallet.productName,
      unidad: pallet.unit ?? null,
      cantidad: plannedPallets
        .filter((item) => (item.lineIndex ?? 0) === lineIndex)
        .reduce((sum, item) => sum + item.quantity, 0),
      precio: 0,
      importe: 0,
      estadoMatch: "confirmado",
    })),
  };
}
