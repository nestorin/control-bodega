export interface EvidenceShareSummary {
  receptionId: string;
  supplier: string;
  item: string;
  palletCount: string | number;
  evidenceLink: string | null;
}

/**
 * Returns an app-local route. It carries no evidence or download token; the
 * recipient must authenticate and Firestore/Storage rules authorize the read.
 */
export function buildAuthenticatedEvidenceLink(
  receptionId: string,
  origin = window.location.origin,
) {
  const url = new URL(origin);
  url.searchParams.set("evidence", receptionId);
  return url.toString();
}

export function buildEvidenceShareMessage(summary: EvidenceShareSummary): string {
  const linkLine = summary.evidenceLink
    ? `🔐 Abrí la evidencia con una sesión autorizada: ${summary.evidenceLink}`
    : "🔐 La evidencia sólo puede abrirse desde una sesión autorizada de Exepa.";

  return [
    "🏭 *EVIDENCIA DE RECEPCIÓN — BODEGA Exapa*",
    "━━━━━━━━━━━━━━━━━━━━",
    `🆔 Recepción: ${summary.receptionId}`,
    `• Proveedor: ${summary.supplier || "Sin dato"}`,
    `• Producto: ${summary.item || "Sin dato"}`,
    `• Tarimas: ${summary.palletCount || "Sin dato"}`,
    "",
    linkLine,
    "Las fotos no se adjuntan a este mensaje; se consultan en la vista protegida.",
    "_Enviado desde TarimaQR_",
  ].join("\n");
}
