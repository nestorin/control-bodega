import { jsPDF } from "jspdf";

export interface ShipmentEvidencePdfInput {
  evidenceId: string;
  shipmentId: string;
  date: string;
  client: string;
  folio: string;
  carrier: string;
  warehouse: string;
  responsible: string;
  loadedTrailerPhotos: string[];
  trailerBoxPhoto?: string | null;
  internalSealPhoto?: string | null;
  externalSealPhoto?: string | null;
  signedDocumentPhoto?: string | null;
  invoicePhoto?: string | null;
  items: Array<{
    productName: string;
    quantity: number;
    unit: string;
  }>;
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

export async function generateShipmentEvidencePdf(input: ShipmentEvidencePdfInput): Promise<Blob> {
  const photos = [
    ...input.loadedTrailerPhotos.map((url, idx) => ({ label: `Embarque cargado ${idx + 1}`, url })),
    input.trailerBoxPhoto
      ? { label: "Número de caja del tráiler", url: input.trailerBoxPhoto }
      : null,
    input.internalSealPhoto ? { label: "Sello interno", url: input.internalSealPhoto } : null,
    input.externalSealPhoto
      ? { label: "Sello puesto en la caja del tráiler", url: input.externalSealPhoto }
      : null,
    input.signedDocumentPhoto
      ? { label: "Documento firmado por el operador", url: input.signedDocumentPhoto }
      : null,
    input.invoicePhoto ? { label: "Factura", url: input.invoicePhoto } : null,
  ].filter((photo): photo is { label: string; url: string } => photo !== null);

  const missingPhotos = [
    input.loadedTrailerPhotos.length === 0 ? "Embarque cargado" : null,
    !input.trailerBoxPhoto ? "Número de caja del tráiler" : null,
    !input.internalSealPhoto ? "Sello interno" : null,
    !input.externalSealPhoto ? "Sello puesto en la caja del tráiler" : null,
    !input.signedDocumentPhoto ? "Documento firmado por el operador" : null,
    !input.invoicePhoto ? "Factura" : null,
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
  pdf.text("EVIDENCIA DE EMBARQUE", margin, y);
  y += 9;
  pdf.setFontSize(13);
  pdf.text("BODEGA Exapa", margin, y);
  y += 9;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  pdf.text("ID: " + input.evidenceId, margin, y);
  pdf.text("ID de embarque: " + input.shipmentId, margin + contentWidth * 0.5, y);
  y += 6;
  pdf.text("Fecha: " + (input.date || "Sin dato"), margin, y);
  y += 10;

  // INFORMACIÓN DEL EMBARQUE - inline format
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...primary);
  pdf.text("INFORMACIÓN DEL EMBARQUE", margin, y);
  y += 7;
  pdf.setFontSize(9);

  const infoParts: Array<[string, string]> = [
    ["Cliente", input.client],
    ["Folio", input.folio],
    ["Transportista", input.carrier],
    ["Almacén", input.warehouse],
    ["Responsable", input.responsible],
    ["Productos", input.items.map((i) => `${i.productName} (${i.quantity} ${i.unit})`).join(", ")],
  ];

  let infoText = "";
  for (const [label, value] of infoParts) {
    infoText += "**" + label + ":** " + (value || "Sin dato") + "  ";
  }

  const infoLines = pdf.splitTextToSize(infoText, contentWidth);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...primary);
  for (const line of infoLines) {
    pdf.text(line, margin, y);
    y += 5;
  }
  y += 5;

  // DETALLE DE PRODUCTOS
  if (input.items.length > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.text("DETALLE DE PRODUCTOS", margin, y);
    y += 6;
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text("Producto", margin, y);
    pdf.text("Cantidad", margin + 80, y);
    pdf.text("Unidad", margin + 120, y);
    y += 4;
    pdf.setDrawColor(220, 228, 231);
    pdf.line(margin, y, width - margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...primary);
    for (const item of input.items) {
      if (y > 250) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(item.productName, margin, y);
      pdf.text(String(item.quantity), margin + 80, y);
      pdf.text(item.unit, margin + 120, y);
      y += 5;
    }
    y += 5;
  }

  // FOTOS DE EVIDENCIA
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
