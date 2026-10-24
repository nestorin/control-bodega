import { jsPDF } from "jspdf";

export interface EvidencePalletRow {
  palletNumber: number;
  qrIdentifier?: string;
  lot?: string;
  expiryDate?: string | Date | { toDate?: () => Date };
}

export interface EvidencePdfInput {
  evidenceId: string;
  receptionId: string;
  date: string;
  item: string;
  supplier: string;
  logisticsProvider: string;
  purchaseOrderNumber: string;
  lot?: string;
  expiryDate?: string;
  receivedPalletCount: number;
  trailerPhoto?: string | null;
  productPhoto?: string | null;
  pallets: EvidencePalletRow[];
}

export interface EvidencePdfViewModel {
  evidenceId: string;
  receptionId: string;
  date: string;
  item: string;
  supplier: string;
  logisticsProvider: string;
  purchaseOrderNumber: string;
  receivedPalletCount: number;
  palletRows: Array<{ pallet: string; lot: string; expiry: string }>;
  trailerPhoto?: string;
  productPhoto?: string;
}

function formatExpiry(value: EvidencePalletRow["expiryDate"]): string {
  if (!value) return "Sin dato";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "object" && typeof value.toDate === "function") date = value.toDate();
  else date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "Sin dato" : date.toLocaleDateString("es-MX");
}

export function buildEvidencePdfViewModel(input: EvidencePdfInput): EvidencePdfViewModel {
  return {
    evidenceId: input.evidenceId,
    receptionId: input.receptionId,
    date: input.date,
    item: input.item,
    supplier: input.supplier,
    logisticsProvider: input.logisticsProvider,
    purchaseOrderNumber: input.purchaseOrderNumber,
    receivedPalletCount: input.receivedPalletCount,
    palletRows: input.pallets.map((pallet) => ({
      pallet: String(pallet.palletNumber) + "/" + String(input.receivedPalletCount),
      lot: pallet.lot || input.lot || "Sin dato",
      expiry: formatExpiry(pallet.expiryDate || input.expiryDate),
    })),
    trailerPhoto: input.trailerPhoto || undefined,
    productPhoto: input.productPhoto || undefined,
  };
}

async function imageDataUrl(url: string): Promise<{ data: string; format: "JPEG" | "PNG" }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Evidence photo download failed (" + response.status + ")");
  const blob = await response.blob();
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Evidence photo could not be read"));
    reader.readAsDataURL(blob);
  });
  return { data, format: blob.type.toLowerCase().includes("png") ? "PNG" : "JPEG" };
}

export async function generateEvidencePdf(input: EvidencePdfInput): Promise<Blob> {
  const view = buildEvidencePdfViewModel(input);
  const photos = [
    view.trailerPhoto ? { label: "Mercancía en tráiler", url: view.trailerPhoto } : null,
    view.productPhoto ? { label: "Producto y caducidad", url: view.productPhoto } : null,
  ].filter((photo): photo is { label: string; url: string } => photo !== null);
  const missingPhotos = [
    !view.trailerPhoto ? "Mercancía en tráiler" : null,
    !view.productPhoto ? "Producto y caducidad" : null,
  ].filter((label): label is string => label !== null);
  const photoEntries = await Promise.all(
    photos.map(async (photo) => ({ label: photo.label, ...(await imageDataUrl(photo.url)) })),
  );
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = width - margin * 2;
  let y = 18;
  const primary: [number, number, number] = [22, 52, 63];
  const muted: [number, number, number] = [96, 112, 120];

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  pdf.setTextColor(...primary);
  pdf.text("EVIDENCIA DE RECEPCIÓN", margin, y);
  y += 9;
  pdf.setFontSize(13);
  pdf.text("BODEGA Exapa", margin, y);
  y += 9;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  pdf.text("ID: " + view.evidenceId, margin, y);
  pdf.text("ID de recepción: " + view.receptionId, margin + contentWidth * 0.5, y);
  y += 6;
  pdf.text("Fecha: " + (view.date || "Sin dato"), margin, y);
  y += 7;
  pdf.setDrawColor(205, 216, 220);
  pdf.line(margin, y, width - margin, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...primary);
  pdf.text("INFORMACIÓN DE LA MERCANCÍA", margin, y);
  y += 7;
  const rows: Array<[string, string]> = [
    ["Ítem", view.item],
    ["Proveedor", view.supplier],
    ["Proveedor logístico", view.logisticsProvider],
    ["Orden de compra", view.purchaseOrderNumber],
    ["Tarimas recibidas", String(view.receivedPalletCount) + " tarimas"],
  ];
  pdf.setFontSize(9);
  for (const [label, value] of rows) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...muted);
    pdf.text(label + ":", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...primary);
    pdf.text(value || "Sin dato", margin + 39, y);
    y += 5.5;
  }
  y += 3;
  pdf.setFont("helvetica", "bold");
  pdf.text("DETALLE POR TARIMA", margin, y);
  y += 6;
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text("Tarima", margin, y);
  pdf.text("Lote", margin + 35, y);
  pdf.text("Caducidad", margin + 100, y);
  y += 4;
  pdf.setDrawColor(220, 228, 231);
  pdf.line(margin, y, width - margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...primary);
  const palletRows = view.palletRows.length
    ? view.palletRows
    : [{ pallet: "Sin detalle", lot: "Sin dato", expiry: "Sin dato" }];
  for (const row of palletRows) {
    if (y > 250) {
      pdf.addPage();
      y = 18;
    }
    pdf.text(row.pallet, margin, y);
    pdf.text(row.lot, margin + 35, y);
    pdf.text(row.expiry, margin + 100, y);
    y += 5;
  }
  y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("FOTOS DE EVIDENCIA", margin, y);
  y += 7;
  for (const photo of photoEntries) {
    if (y > 245) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFontSize(9);
    pdf.setTextColor(...primary);
    pdf.text(photo.label, margin, y);
    y += 3;
    const imgWidth = Math.min(contentWidth, 110);
    const imgHeight = 58;
    pdf.addImage(photo.data, photo.format, margin, y, imgWidth, imgHeight, undefined, "FAST");
    y += imgHeight + 8;
  }
  if (photoEntries.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...muted);
    pdf.text("No hay fotografías asociadas a esta evidencia.", margin, y);
    y += 6;
  }
  for (const missing of missingPhotos) {
    if (y > 270) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text(missing + ": fotografía no adjuntada.", margin, y);
    y += 5;
  }
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(7);
    pdf.setTextColor(...muted);
    pdf.text("Generado desde TarimaQR - BODEGA Exapa", margin, 286);
    pdf.text("Página " + page + " de " + pageCount, width - margin, 286, { align: "right" });
  }
  return pdf.output("blob");
}
