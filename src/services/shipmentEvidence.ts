import { ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

export type ShipmentEvidenceFileSlot =
  | "loadedTrailer"
  | "trailerBox"
  | "internalSeal"
  | "externalSeal"
  | "signedDocument"
  | "invoice";

const FILE_NAMES: Record<Exclude<ShipmentEvidenceFileSlot, "loadedTrailer">, string> = {
  trailerBox: "trailer-box",
  internalSeal: "internal-seal",
  externalSeal: "external-seal",
  signedDocument: "signed-document",
  invoice: "invoice",
};

function imageExtension(file: File): "jpg" | "png" | "webp" {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function shipmentEvidencePath(
  organizationId: string,
  warehouseId: string,
  shipmentId: string,
  slot: ShipmentEvidenceFileSlot,
  file: File,
  uniqueId = crypto.randomUUID(),
): string {
  const name = slot === "loadedTrailer" ? `loaded-${uniqueId}` : FILE_NAMES[slot];
  return `organizations/${organizationId}/warehouses/${warehouseId}/shipments/${shipmentId}/evidence/${name}.${imageExtension(file)}`;
}

export async function uploadShipmentEvidence(
  storage: FirebaseStorage,
  organizationId: string,
  warehouseId: string,
  shipmentId: string,
  slot: ShipmentEvidenceFileSlot,
  file: File,
): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    throw new Error("Evidence must be a JPG, PNG, or WebP image");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Evidence image must be 10 MB or smaller");
  }
  const path = shipmentEvidencePath(organizationId, warehouseId, shipmentId, slot, file);
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return path;
}
