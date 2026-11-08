/**
 * EvidencePreview — Previsualización de evidencia PDF para Etiquetado
 *
 * Permite previsualizar el PDF generado antes de subirlo a Storage.
 * Usa html2canvas + jspdf para generar el PDF en cliente.
 */

import { useState, useCallback, useMemo, memo } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { EvidenceRef, LabelingBatch, Timestamp } from "@/types/labeling";

interface EvidencePreviewProps {
  batch: LabelingBatch | null;
  lines: Map<string, any>; // Add lines from context
  evidenceRefs: EvidenceRef[];
  onDownload?: (evidenceId: string) => void;
  onPrint?: (evidenceId: string) => void;
  onEmail?: (evidenceId: string, email: string) => void;
  className?: string;
}

function EvidencePreviewInner({
  batch,
  lines,
  evidenceRefs,
  onDownload,
  onPrint,
  onEmail,
  className = "",
}: EvidencePreviewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRef | null>(null);
  const contentRef = useMemo(() => ({ current: null }), []) as React.RefObject<HTMLDivElement>;

  // Generate handoff PDF
  const generateHandoffPdf = useCallback(async () => {
    if (!batch || !contentRef.current) return;

    setIsGenerating(true);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      const blob = pdf.output("blob");
      setGeneratedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [batch]);

  // Handle download
  const handleDownload = useCallback(
    (evidence: EvidenceRef) => {
      if (evidence.downloadUrl) {
        const a = document.createElement("a");
        a.href = evidence.downloadUrl;
        a.download = `evidencia-${evidence.evidenceId}.pdf`;
        a.click();
      }
      onDownload?.(evidence.evidenceId);
    },
    [onDownload],
  );

  // Handle print
  const handlePrint = useCallback(
    (evidence: EvidenceRef) => {
      if (evidence.downloadUrl) {
        const printWindow = window.open(evidence.downloadUrl, "_blank");
        printWindow?.addEventListener("load", () => {
          printWindow?.print();
        });
      }
      onPrint?.(evidence.evidenceId);
    },
    [onPrint],
  );

  // Handle email
  const handleEmail = useCallback(
    (evidence: EvidenceRef) => {
      const email = prompt("Ingrese el email de destino:");
      if (email) {
        onEmail?.(evidence.evidenceId, email);
      }
    },
    [onEmail],
  );

  // Format date for display
  const formatDate = useCallback(
    (dateString: string | { toDate: () => Date } | Date | Timestamp | null) => {
      if (!dateString) return "—";
      const date =
        typeof dateString === "string"
          ? new Date(dateString)
          : dateString instanceof Date
            ? dateString
            : "toDate" in dateString
              ? dateString.toDate()
              : new Date();
      return date.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [],
  );

  // Render evidence content for PDF generation
  const renderEvidenceContent = useMemo(() => {
    if (!batch) return null;

    const handoffEvidence = evidenceRefs.find((e: any) => e.type === "handoff");
    const shortageEvidences = evidenceRefs.filter((e: any) => e.type === "shortage");
    const discrepancyEvidences = evidenceRefs.filter((e: any) => e.type === "discrepancy");

    return (
      <div
        ref={contentRef}
        className="evidence-content p-8 bg-white"
        style={{ width: "210mm", minHeight: "297mm" }}
      >
        {/* Header */}
        <div className="mb-8 border-b-2 border-blue-800 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-blue-800">Control de Bodega v1.4</h1>
              <p className="text-gray-600">Comprobante de Entrega - Módulo Etiquetado</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                Folio: <span className="font-mono text-gray-900">{batch.batchId}</span>
              </p>
              <p className="text-sm text-gray-500">
                Fecha:{" "}
                <span className="font-mono text-gray-900">
                  {formatDate(batch?.openedAt || new Date().toISOString())}
                </span>
              </p>
              <p className="text-sm text-gray-500">
                Estado:{" "}
                <span className="font-medium capitalize text-gray-900">
                  {batch.status.replace(/_/g, " ")}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Batch Info */}
        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Empresa Etiquetadora</p>
            <p className="font-medium">{batch.labelingCompanyName}</p>
          </div>
          <div>
            <p className="text-gray-500">Receptor</p>
            <p className="font-medium">{batch.receiverName}</p>
          </div>
          <div>
            <p className="text-gray-500">Entregado por</p>
            <p className="font-medium">{batch.deliveredByName}</p>
          </div>
          <div>
            <p className="text-gray-500">Bodega</p>
            <p className="font-medium">{batch.warehouseId}</p>
          </div>
        </div>

        {/* Lines Table */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-300 pb-1">
            Líneas del Lote
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2 border-b border-gray-300 font-medium">Producto</th>
                  <th className="text-left p-2 border-b border-gray-300 font-medium">Lote</th>
                  <th className="text-left p-2 border-b border-gray-300 font-medium">Caducidad</th>
                  <th className="text-right p-2 border-b border-gray-300 font-medium">
                    Cajas Est.
                  </th>
                  <th className="text-right p-2 border-b border-gray-300 font-medium">
                    Cajas Entregadas
                  </th>
                  <th className="text-right p-2 border-b border-gray-300 font-medium">
                    Diferencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(lines.values()).map((line: any) => (
                  <tr key={line.lineId} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-2">{line.productSnapshot?.name || line.productId}</td>
                    <td className="p-2 font-mono">{line.lotSnapshot}</td>
                    <td className="p-2">{line.expiryDate || "—"}</td>
                    <td className="p-2 text-right">{line.estimatedBoxes}</td>
                    <td className="p-2 text-right font-medium text-blue-700">
                      {line.assignedBoxes}
                    </td>
                    <td className="p-2 text-right">
                      <span
                        className={
                          line.assignedBoxes >= line.estimatedBoxes
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {line.assignedBoxes - line.estimatedBoxes > 0 ? "+" : ""}
                        {line.assignedBoxes - line.estimatedBoxes}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="mb-6 bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">Totales</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Cajas Estimadas</p>
              <p className="font-bold text-lg">{batch?.estimatedTotals?.boxes || 0}</p>
            </div>
            <div>
              <p className="text-gray-500">Cajas Entregadas</p>
              <p className="font-bold text-lg text-blue-700">
                {batch?.actualTotals?.assigned || 0}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Pallets Estimados</p>
              <p className="font-bold text-lg">{batch?.estimatedTotals?.pallets || 0}</p>
            </div>
            <div>
              <p className="text-gray-500">Diferencia</p>
              <p
                className={`font-bold text-lg ${(batch?.actualTotals?.assigned || 0) >= (batch?.estimatedTotals?.boxes || 0) ? "text-green-600" : "text-red-600"}`}
              >
                {(batch?.actualTotals?.assigned || 0) - (batch?.estimatedTotals?.boxes || 0) > 0
                  ? "+"
                  : ""}
                {(batch?.actualTotals?.assigned || 0) - (batch?.estimatedTotals?.boxes || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="mb-6 grid grid-cols-2 gap-8">
          <div className="border-t border-gray-400 pt-4">
            <p className="text-sm text-gray-500">Entregado por</p>
            <p className="font-medium mt-2">{batch.deliveredByName}</p>
            <p className="text-xs text-gray-400 mt-1">Firma y fecha</p>
          </div>
          <div className="border-t border-gray-400 pt-4">
            <p className="text-sm text-gray-500">Recibido por</p>
            <p className="font-medium mt-2">{batch.receiverName}</p>
            <p className="text-xs text-gray-400 mt-1">Firma y fecha</p>
          </div>
        </div>

        {/* QR Code placeholder */}
        <div className="text-center">
          <div className="inline-block p-4 bg-gray-100 rounded">
            <div className="w-32 h-32 bg-white border border-gray-300 flex items-center justify-center">
              <span className="text-xs text-gray-500">QR: {batch.batchId}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Código de verificación</p>
          </div>
        </div>

        {/* Evidence references */}
        {(handoffEvidence || shortageEvidences.length > 0 || discrepancyEvidences.length > 0) && (
          <div className="mt-8 pt-4 border-t border-gray-300">
            <h3 className="font-semibold text-gray-900 mb-2">Evidencias Adjuntas</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {handoffEvidence && (
                <li>
                  • Entrega: {handoffEvidence.storagePath} (
                  {formatDate(handoffEvidence?.uploadedAt)})
                </li>
              )}
              {shortageEvidences.map((e) => (
                <li key={e.evidenceId}>
                  • Falta: {e.storagePath} ({formatDate(e?.uploadedAt)})
                </li>
              ))}
              {discrepancyEvidences.map((e) => (
                <li key={e.evidenceId}>
                  • Discrepancia: {e.storagePath} ({formatDate(e?.uploadedAt)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400 border-t border-gray-300 pt-4">
          <p>Control de Bodega v1.4 - Módulo Etiquetado</p>
          <p>Generado automáticamente el {formatDate(new Date().toISOString())}</p>
          <p>Este documento es válido sin firma física si contiene el código QR de verificación</p>
        </div>
      </div>
    );
  }, [batch, evidenceRefs, formatDate]);

  // UI Render
  return (
    <div className={`evidence-preview ${className}`}>
      {/* Hidden content for PDF generation */}
      <div className="hidden" aria-hidden="true">
        {renderEvidenceContent}
      </div>

      {/* Visible preview card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <div>
              <h3 className="font-semibold text-gray-900">Comprobante de Entrega</h3>
              <p className="text-sm text-gray-500">Lote: {batch?.batchId || "—"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={generateHandoffPdf}
              disabled={isGenerating || !batch}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <svg className="inline w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generando...
                </>
              ) : (
                "Generar PDF"
              )}
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="p-6">
          {batch ? (
            <div className="space-y-4">
              {/* Quick info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Empresa</p>
                  <p className="font-medium text-sm truncate">{batch.labelingCompanyName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Receptor</p>
                  <p className="font-medium text-sm truncate">{batch.receiverName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Entregado por</p>
                  <p className="font-medium text-sm truncate">{batch.deliveredByName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Estado</p>
                  <p className="font-medium text-sm capitalize">
                    {batch.status.replace(/_/g, " ")}
                  </p>
                </div>
              </div>

              {/* Lines summary */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Líneas ({lines.size || 0})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-2 font-medium">Producto</th>
                        <th className="text-left p-2 font-medium">Lote</th>
                        <th className="text-right p-2 font-medium">Est.</th>
                        <th className="text-right p-2 font-medium">Entregado</th>
                        <th className="text-right p-2 font-medium">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(lines.values())
                        .slice(0, 5)
                        .map((line: any) => (
                          <tr
                            key={line.lineId}
                            className="border-t border-gray-100 hover:bg-gray-50"
                          >
                            <td className="p-2 truncate max-w-xs">
                              {line.productSnapshot?.name || line.productId}
                            </td>
                            <td className="p-2 font-mono text-xs">{line.lotSnapshot}</td>
                            <td className="p-2 text-right">{line.estimatedBoxes}</td>
                            <td className="p-2 text-right font-medium text-blue-700">
                              {line.assignedBoxes}
                            </td>
                            <td className="p-2 text-right">
                              <span
                                className={
                                  line.assignedBoxes >= line.estimatedBoxes
                                    ? "text-green-600"
                                    : "text-red-600"
                                }
                              >
                                {line.assignedBoxes - line.estimatedBoxes > 0 ? "+" : ""}
                                {line.assignedBoxes - line.estimatedBoxes}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {lines.size > 5 && (
                        <tr>
                          <td colSpan={5} className="p-2 text-center text-gray-500 text-xs">
                            +{lines.size - 5} líneas más...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Cajas Estimadas</p>
                  <p className="font-bold text-xl">{batch?.estimatedTotals?.boxes || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Cajas Entregadas</p>
                  <p className="font-bold text-xl text-blue-700">
                    {batch?.actualTotals?.assigned || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Pallets Estimados</p>
                  <p className="font-bold text-xl">{batch?.estimatedTotals?.pallets || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Diferencia</p>
                  <p
                    className={`font-bold text-xl ${(batch?.actualTotals?.assigned || 0) >= (batch?.estimatedTotals?.boxes || 0) ? "text-green-600" : "text-red-600"}`}
                  >
                    {(batch?.actualTotals?.assigned || 0) - (batch?.estimatedTotals?.boxes || 0) > 0
                      ? "+"
                      : ""}
                    {(batch?.actualTotals?.assigned || 0) - (batch?.estimatedTotals?.boxes || 0)}
                  </p>
                </div>
              </div>

              {/* Existing evidence */}
              {evidenceRefs.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3">
                    Evidencias Subidas ({evidenceRefs.length})
                  </h4>
                  <div className="space-y-2">
                    {evidenceRefs.map((evidence) => (
                      <div
                        key={evidence.evidenceId}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full ${evidence.type === "handoff" ? "bg-blue-500" : evidence.type === "shortage" ? "bg-yellow-500" : "bg-red-500"}`}
                          />
                          <div>
                            <p className="font-medium text-sm capitalize">{evidence.type}</p>
                            <p className="text-xs text-gray-500">
                              {formatDate(evidence.uploadedAt)} • Por: {evidence.uploadedBy}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(evidence)}
                            className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700"
                          >
                            Descargar
                          </button>
                          <button
                            onClick={() => handlePrint(evidence)}
                            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-700"
                          >
                            Imprimir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <h4 className="mt-4 text-lg font-medium text-gray-900">Sin lote seleccionado</h4>
              <p className="mt-2 text-gray-500">
                Cree o seleccione un lote para ver el comprobante
              </p>
            </div>
          )}

          {/* Generated PDF preview */}
          {previewUrl && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-blue-900">PDF Generado - Vista Previa</h4>
                <button
                  onClick={() => {
                    URL.revokeObjectURL(previewUrl!);
                    setPreviewUrl(null);
                    setGeneratedBlob(null);
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <iframe
                src={previewUrl}
                className="w-full h-96 rounded border"
                title="Vista previa PDF"
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    if (generatedBlob) {
                      const url = URL.createObjectURL(generatedBlob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `comprobante-entrega-${batch?.batchId}-${Date.now()}.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <svg
                    className="inline w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Descargar PDF
                </button>
                <button
                  onClick={() => {
                    if (previewUrl) {
                      const printWindow = window.open(previewUrl, "_blank");
                      printWindow?.addEventListener("load", () => printWindow?.print());
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <svg
                    className="inline w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2h2"
                    />
                  </svg>
                  Imprimir
                </button>
                <button
                  onClick={() => {
                    const email = prompt("Ingrese el email de destino:");
                    if (email && onEmail && batch) {
                      onEmail(batch.batchId, email);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <svg
                    className="inline w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  Enviar por email
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const EvidencePreview = memo(function EvidencePreview({
  batch,
  evidenceRefs,
  onDownload,
  onPrint,
  onEmail,
  className = "",
}: EvidencePreviewProps) {
  return <EvidencePreviewInner {...arguments[0]} />;
});

export type { EvidencePreviewProps };
export default EvidencePreview;
