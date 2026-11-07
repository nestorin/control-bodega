const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateEvidenceDocument(file: File): string | null {
  if (!DOCUMENT_EXTENSIONS[file.type]) {
    return "El documento debe ser PDF, JPG, PNG o WebP.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return "El documento no puede superar 10 MB.";
  }
  return null;
}

export function evidenceDocumentPath(
  orgId: string,
  warehouseId: string,
  receptionId: string,
  file: File,
): string {
  const extension = DOCUMENT_EXTENSIONS[file.type];
  if (!extension || validateEvidenceDocument(file)) {
    throw new Error("Invalid evidence document");
  }
  return `organizations/${orgId}/warehouses/${warehouseId}/receptions/${receptionId}/evidence/documentation.${extension}`;
}
