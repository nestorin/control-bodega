import type { ReceptionDoc } from "@/services/firestore/types";
import type { PalletDoc } from "@/services/firestore/types";
import type { PlannedReceptionPallet } from "@/services/firestore/types";
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

/**
 * Maps a PalletDoc status (from the pallets/ subcollection) to a
 * PlannedReceptionPallet status (used by the capture flow).
 *
 * The reception document's plannedPallets array is NOT updated when individual
 * pallets are captured; real pallet status lives in the pallets/ subcollection.
 * On resume we must merge real statuses so that CapturaTarima can compute the
 * correct continuation point (first incomplete pallet).
 */
function mapPalletDocStatusToPlanned(
  status: PalletDoc["status"],
): PlannedReceptionPallet["status"] {
  switch (status) {
    case "RECEIVED":
    case "STORED":
      return "RECEIVED";
    case "CREATED":
      return "PLANNED";
    case "BLOCKED":
      return "PLANNED";
    default:
      return "PLANNED";
  }
}

/**
 * Merges real pallet statuses from the pallets/ subcollection into plannedPallets.
 * Returns a new array where each planned pallet has the real status if a matching
 * pallet exists (matched by qrIdentifier), otherwise keeps the original planned status.
 */
export function mergePalletStatuses(
  plannedPallets: PlannedReceptionPallet[],
  realPallets: PalletDoc[],
): PlannedReceptionPallet[] {
  const realByQr = new Map(realPallets.map((p) => [p.qrIdentifier, p]));
  return plannedPallets.map((planned) => {
    const real = realByQr.get(planned.qrIdentifier);
    if (!real) return planned;
    return { ...planned, status: mapPalletDocStatusToPlanned(real.status) };
  });
}

/**
 * Loads the real pallets for a reception and merges their statuses into the
 * ReceptionData that will be passed to CapturaTarima.
 */
export async function loadReceptionDataForResume(
  fsServices: ReturnType<typeof import("@/services/firestore").createFirestoreServices>,
  receptionId: string,
  warehouseIds: string[],
): Promise<ReceptionData> {
  const doc = await fsServices.receptions.getById(receptionId);
  if (!doc) throw new Error("Reception not found");
  const realPallets = await fsServices.pallets.getByReception(receptionId, warehouseIds);
  const baseData = mapReceptionDocToReceptionData(doc);
  return {
    ...baseData,
    plannedPallets: mergePalletStatuses(baseData.plannedPallets ?? [], realPallets),
  };
}
