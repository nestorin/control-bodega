/**
 * Generador de PDF específico para Programación de Recepción
 * Usa el servicio compartido pdfGenerator.ts
 */

import { generateStructuredPdf, openWhatsAppWithMessage, downloadBlob } from "./pdfGenerator";

export interface ProgramacionRecepcionData {
  folio: string;
  fechaRecepcion: string;
  proveedor: string;
  proveedorLogistico: string;
  almacenaId?: string;
  productos: Array<{
    nombre: string;
    cantidad: number;
    tarimas: number;
    conversionMatch: boolean;
    codigo?: string;
  }>;
  totalTarimas: number;
}

export async function generateProgramacionRecepcionPdf(data: ProgramacionRecepcionData): Promise<{
  blob: Blob;
  dataUrl: string;
  filename: string;
}> {
  const sections = [
    {
      title: "INFORMACIÓN GENERAL",
      rows: [
        { label: "Folio", value: data.folio },
        { label: "Fecha Recepción", value: data.fechaRecepcion },
        { label: "Proveedor", value: data.proveedor || "—" },
        { label: "Proveedor Logístico", value: data.proveedorLogistico || "—" },
        { label: "Total Tarimas", value: data.totalTarimas.toString() },
      ],
    },
    {
      title: "PRODUCTOS PROGRAMADOS",
      rows: data.productos.map((p, i) => ({
        label: `${i + 1}. ${p.nombre}${p.codigo ? ` (${p.codigo})` : ""}`,
        value: `${p.cantidad} cajas · ${p.tarimas} tarimas${
          !p.conversionMatch ? " ⚠ sin conversión" : ""
        }`,
      })),
    },
  ];

  return generateStructuredPdf(
    {
      title: "PROGRAMACIÓN DE RECEPCIÓN",
      subtitle: "Bodega Exapa — Control de Bodega v1.4",
      sections,
      footer: `Generado el ${new Date().toLocaleString("es-MX")} desde TarimaQR`,
    },
    {
      filename: `programacion-recepcion-${data.folio}.pdf`,
      orientation: "portrait",
      format: "a4",
    },
  );
}

export function buildWhatsAppMessage(data: ProgramacionRecepcionData): string {
  const lines = [
    "🏭 *PROGRAMACIÓN RECEPCIÓN — BODEGA Exapa*",
    "━━━━━━━━━━━━━━━━━━━━",
    `📋 Folio: ${data.folio}`,
    `📅 Fecha Recepción: ${data.fechaRecepcion}`,
    `🏢 Proveedor: ${data.proveedor || "—"}`,
    `🚚 Proveedor Logístico: ${data.proveedorLogistico || "—"}`,
    "",
    "📦 *PRODUCTOS PROGRAMADOS:*",
  ];

  data.productos.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.nombre}`);
    lines.push(`   Cajas: ${p.cantidad} | Tarimas: ${p.tarimas}${!p.conversionMatch ? " ⚠" : ""}`);
  });

  lines.push("");
  lines.push(`📊 Total Tarimas: ${data.totalTarimas}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("_Generado desde TarimaQR_");

  return lines.join("\n");
}

export async function handleEnviarWhatsApp(
  data: ProgramacionRecepcionData,
  phoneNumber: string = "",
): Promise<void> {
  try {
    // 1. Generar PDF
    const { blob, filename } = await generateProgramacionRecepcionPdf(data);

    // 2. Descargar PDF localmente (UX: usuario tiene el archivo)
    downloadBlob(blob, filename);

    // 3. Abrir WhatsApp con mensaje de referencia
    // Nota: WhatsApp Web API no permite adjuntar archivos via URL
    // La mejor UX: descargar PDF + mensaje con referencia al archivo
    const message =
      buildWhatsAppMessage(data) +
      "\n\n📎 *PDF generado y descargado en tu dispositivo. Adjúntalo manualmente en WhatsApp.*";
    openWhatsAppWithMessage(phoneNumber, message);
  } catch (error) {
    console.error("Error generando PDF para WhatsApp:", error);
    // Fallback: solo mensaje de texto
    const message = buildWhatsAppMessage(data);
    openWhatsAppWithMessage(phoneNumber, message);
  }
}
