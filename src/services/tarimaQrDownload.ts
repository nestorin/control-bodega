import QRCode from "qrcode";
import { jsPDF } from "jspdf";

export type TarimaQrFormat = "SVG" | "PNG" | "JPEG" | "PDF";

const QR_OPTIONS = {
  width: 512,
  margin: 2,
  errorCorrectionLevel: "H" as const,
};

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, encoded] = dataUrl.split(",");
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1];
  if (!mimeType || !encoded) throw new Error("La imagen QR no es válida.");

  const bytes = atob(encoded);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }
  return new Blob([buffer], { type: mimeType });
}

async function pngDataUrlToJpeg(pngDataUrl: string): Promise<Blob> {
  const image = new Image();
  image.src = pngDataUrl;
  if (typeof image.decode === "function") {
    await image.decode();
  } else {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo preparar la imagen QR."));
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo preparar la imagen JPEG.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen JPEG."))),
      "image/jpeg",
      0.95,
    );
  });
}

export async function createTarimaQrFile(
  qrIdentifier: string,
  format: TarimaQrFormat,
): Promise<Blob> {
  if (!qrIdentifier.trim()) throw new Error("No hay un identificador QR para descargar.");

  if (format === "SVG") {
    const svg = await QRCode.toString(qrIdentifier, { ...QR_OPTIONS, type: "svg" });
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  }

  const pngDataUrl = await QRCode.toDataURL(qrIdentifier, QR_OPTIONS);
  const pngBlob = dataUrlToBlob(pngDataUrl);
  if (format === "PNG") return pngBlob;
  if (format === "JPEG") return pngDataUrlToJpeg(pngDataUrl);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const qrSize = 100;
  const x = (pageWidth - qrSize) / 2;
  pdf.addImage(pngDataUrl, "PNG", x, 45, qrSize, qrSize);
  pdf.setFontSize(14);
  pdf.text(qrIdentifier, pageWidth / 2, 45 + qrSize + 12, { align: "center" });
  return pdf.output("blob");
}

export async function createTarimaQrBatchPdf(qrIdentifiers: string[]): Promise<Blob> {
  const identifiers = [
    ...new Set(qrIdentifiers.map((identifier) => identifier.trim()).filter(Boolean)),
  ];
  if (identifiers.length === 0) throw new Error("No hay códigos QR para descargar.");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const columns = 2;
  const rows = 2;
  const cellWidth = (pageWidth - margin * 2) / columns;
  const cellHeight = (pageHeight - margin * 2) / rows;
  const qrSize = 55;
  const total = identifiers.length;

  for (const [index, identifier] of identifiers.entries()) {
    if (index > 0 && index % (columns * rows) === 0) pdf.addPage();
    const position = index % (columns * rows);
    const column = position % columns;
    const row = Math.floor(position / columns);
    const left = margin + column * cellWidth;
    const top = margin + row * cellHeight;
    const qrDataUrl = await QRCode.toDataURL(identifier, QR_OPTIONS);
    const palletNumber = Number(identifier.match(/-(\d+)$/)?.[1]) || index + 1;

    pdf.setDrawColor(170, 185, 190);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.rect(left + 4, top + 4, cellWidth - 8, cellHeight - 8);
    pdf.setLineDashPattern([], 0);
    pdf.addImage(qrDataUrl, "PNG", left + (cellWidth - qrSize) / 2, top + 15, qrSize, qrSize);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Tarima ${palletNumber} de ${total}`, left + cellWidth / 2, top + 80, {
      align: "center",
    });
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(identifier, left + cellWidth / 2, top + 88, {
      align: "center",
      maxWidth: cellWidth - 16,
    });
  }

  return pdf.output("blob");
}

/** Trigger a mobile-friendly download and delay URL revocation for Android browsers. */
export async function downloadTarimaQr(
  qrIdentifier: string,
  format: TarimaQrFormat,
): Promise<void> {
  const blob = await createTarimaQrFile(qrIdentifier, format);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeIdentifier = qrIdentifier.replace(/[^a-zA-Z0-9._-]/g, "_");
  anchor.href = objectUrl;
  anchor.download = `${safeIdentifier}.${format.toLowerCase()}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function downloadTarimaQrBatch(
  qrIdentifiers: string[],
  receptionFolio: string,
): Promise<void> {
  const blob = await createTarimaQrBatchPdf(qrIdentifiers);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeFolio = receptionFolio.replace(/[^a-zA-Z0-9._-]/g, "_");
  anchor.href = objectUrl;
  anchor.download = `QRs-${safeFolio}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
