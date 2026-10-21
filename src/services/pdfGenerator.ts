/**
 * Servicio compartido para generación de PDFs
 * Usa jsPDF + html2canvas para renderizar componentes React a PDF
 */

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export interface PdfOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
  unit?: "mm" | "px" | "cm" | "in";
  format?: "a4" | "a3" | "letter" | "legal";
  margin?: number;
  scale?: number;
  backgroundColor?: string;
}

export interface PdfGenerationResult {
  blob: Blob;
  dataUrl: string;
  filename: string;
}

/**
 * Genera PDF desde un elemento DOM (ref)
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: PdfOptions = {},
): Promise<PdfGenerationResult> {
  const {
    filename = "documento.pdf",
    orientation = "portrait",
    unit = "mm",
    format = "a4",
    margin = 10,
    scale = 2,
    backgroundColor = "#ffffff",
  } = options;

  // Renderizar elemento a canvas
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor,
    onclone: (clonedDoc: Document) => {
      // Asegurar estilos en el clon
      const clonedElement = clonedDoc.querySelector("[data-pdf-target]") as HTMLElement;
      if (clonedElement) {
        clonedElement.style.width = `${element.offsetWidth}px`;
      }
    },
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const pdf = new jsPDF({ orientation, unit, format });

  // Calcular dimensiones manteniendo aspect ratio
  const pdfWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  let positionY = margin;
  let remainingHeight = pdfHeight;
  const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;

  while (remainingHeight > 0) {
    if (positionY > margin) {
      pdf.addPage();
      positionY = margin;
    }

    const currentPageHeight = Math.min(remainingHeight, pageHeight);

    // Crear canvas parcial para esta página
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = (currentPageHeight * canvas.width) / pdfWidth;
    const pageCtx = pageCanvas.getContext("2d")!;

    pageCtx.drawImage(
      canvas,
      0,
      canvas.height - remainingHeight - pageCanvas.height,
      canvas.width,
      pageCanvas.height,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height,
    );

    const pageImgData = pageCanvas.toDataURL("image/png", 1.0);
    pdf.addImage(pageImgData, "PNG", margin, positionY, pdfWidth, currentPageHeight);

    remainingHeight -= currentPageHeight;
    positionY += currentPageHeight;
  }

  const blob = pdf.output("blob");
  const dataUrl = pdf.output("datauristring");

  return { blob, dataUrl, filename };
}

/**
 * Genera PDF programáticamente (sin elemento DOM) - para reportes estructurados
 */
export async function generateStructuredPdf(
  content: {
    title: string;
    subtitle?: string;
    sections: Array<{
      title: string;
      rows: Array<{
        label: string;
        value: string;
      }>;
    }>;
    footer?: string;
  },
  options: PdfOptions = {},
): Promise<PdfGenerationResult> {
  const { filename = "reporte.pdf", ...pdfOptions } = options;
  const pdf = new jsPDF({
    orientation: pdfOptions.orientation || "portrait",
    unit: pdfOptions.unit || "mm",
    format: pdfOptions.format || "a4",
  });

  const margin = pdfOptions.margin || 15;
  const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  // Colores
  const primaryColor: [number, number, number] = [22, 52, 63]; // #16343f
  const secondaryColor: [number, number, number] = [96, 112, 120]; // #607078
  const accentColor: [number, number, number] = [37, 211, 102]; // #25D366

  // Header
  pdf.setFontSize(22);
  pdf.setTextColor(...primaryColor);
  pdf.setFont("helvetica", "bold");
  pdf.text(content.title, margin, y);
  y += 12;

  if (content.subtitle) {
    pdf.setFontSize(11);
    pdf.setTextColor(...secondaryColor);
    pdf.setFont("helvetica", "normal");
    pdf.text(content.subtitle, margin, y);
    y += 8;
  }

  // Línea separadora
  pdf.setDrawColor(...accentColor);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, margin + pageWidth, y);
  y += 8;

  // Secciones
  content.sections.forEach((section) => {
    // Título sección
    pdf.setFontSize(13);
    pdf.setTextColor(...primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text(section.title, margin, y);
    y += 8;

    // Filas
    section.rows.forEach((row) => {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...secondaryColor);
      const labelWidth = pdf.getTextWidth(`${row.label}: `);
      pdf.text(`${row.label}: `, margin, y);

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...primaryColor);
      pdf.text(row.value, margin + labelWidth, y);
      y += 6;
    });
    y += 4;
  });

  // Footer
  if (content.footer) {
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setFontSize(8);
    pdf.setTextColor(...secondaryColor);
    pdf.setFont("helvetica", "italic");
    pdf.text(content.footer, margin, pageHeight - 10);
  }

  const blob = pdf.output("blob");
  const dataUrl = pdf.output("datauristring");

  return { blob, dataUrl, filename };
}

/**
 * Abre WhatsApp con mensaje de texto (fallback cuando no se puede adjuntar PDF)
 * Nota: WhatsApp Web API no permite adjuntar archivos directamente via URL.
 * La mejor UX: descargar PDF + abrir WhatsApp con mensaje de referencia.
 */
export function openWhatsAppWithMessage(phoneNumber: string = "", message: string): void {
  const encodedMessage = encodeURIComponent(message);
  const url = phoneNumber
    ? `https://wa.me/${phoneNumber}?text=${encodedMessage}`
    : `https://wa.me/?text=${encodedMessage}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Descarga un blob como archivo
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Genera PDF y lo descarga automáticamente
 */
export async function generateAndDownloadPdf(
  element: HTMLElement,
  filename: string,
  options: Omit<PdfOptions, "filename"> = {},
): Promise<void> {
  const { blob, filename: finalFilename } = await generatePdfFromElement(element, {
    ...options,
    filename,
  });
  downloadBlob(blob, finalFilename);
}

/**
 * Genera PDF estructurado y lo descarga
 */
export async function generateAndDownloadStructuredPdf(
  content: Parameters<typeof generateStructuredPdf>[0],
  filename: string,
  options: Omit<PdfOptions, "filename"> = {},
): Promise<void> {
  const { blob, filename: finalFilename } = await generateStructuredPdf(content, {
    ...options,
    filename,
  });
  downloadBlob(blob, finalFilename);
}
