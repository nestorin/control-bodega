/**
 * EntregarEtiquetado — Pantalla de entrega (handoff) a empresa etiquetadora
 *
 * Flujo:
 * 1. Escanear QR de pallet origen (TQR-OC123-1)
 * 2. Mostrar datos solo lectura: producto, lote, caducidad, cajas, proveedor, recibido
 * 3. Confirmar cajas físicas (permitir corrección vs origen, nota diferencia)
 * 4. Capturar receptor, entregador, fecha
 * 5. Generar PDF evidencia → subir → cerrar handoff
 */

import { useState, useCallback, useMemo } from "react";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";
import { useLabelingCatalog } from "@/hooks/useLabelingCatalog";
import { QRScanner } from "@/components/labeling/QRScanner";
import { EvidencePreview } from "@/components/labeling/EvidencePreview";
import type { LabelingAssignment } from "@/types/labeling";

export function EntregarEtiquetado() {
  const { currentBatch, status, lines, assignments, isLoading, confirmHandoff, setError } =
    useLabelingBatch();

  const { eligibleProducts, loadCatalogs, catalogosLoading } = useLabelingCatalog();

  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedAssignment, setScannedAssignment] = useState<LabelingAssignment | null>(null);
  const [confirmedBoxes, setConfirmedBoxes] = useState<number>(0);
  const [receiverName, setReceiverName] = useState<string>("");
  const [deliveredByName, setDeliveredByName] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [showEvidencePreview, setShowEvidencePreview] = useState(false);
  const [generatedEvidence, setGeneratedEvidence] = useState<any>(null);

  // Load catalogs
  useMemo(() => {
    if (eligibleProducts.length === 0 && !catalogosLoading) {
      loadCatalogs("");
    }
  }, [eligibleProducts.length, catalogosLoading, loadCatalogs]);

  const handleClose = useCallback(() => {
    setShowQRScanner(false);
    setScannedAssignment(null);
  }, []);

  const handleQRScan = useCallback(
    (qrCode: string) => {
      // Buscar línea por QR
      const line = Array.from(lines.values()).find((l: any) => {
        const product = eligibleProducts.find((p) => p.id === l.productId);
        return product && qrCode.includes(product.id);
      });

      if (line) {
        const line = Array.from(lines.values()).find((l: any) => {
          const product = eligibleProducts.find(
            (p: any) => qrCode.includes(p.id) || qrCode.includes(p.sku),
          );
          return product && l.productId === product.id;
        });

        if (line) {
          const assignment: LabelingAssignment = {
            assignmentId: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            batchId: currentBatch?.batchId || "",
            sourcePalletId: qrCode,
            sourceQr: qrCode,
            trackingKey: (line as any).trackingKey,
            sourceBoxes: (line as any).estimatedBoxes,
            confirmedBoxes: (line as any).estimatedBoxes,
            status: "active",
            actor: "current_user",
            createdAt: new Date().toISOString(),
            idempotencyKey: `idem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          };
          setScannedAssignment(assignment);
          setConfirmedBoxes((line as any).estimatedBoxes);
          setShowQRScanner(false);
        }
      } else {
        setError(`No se encontró línea asociada al QR: ${qrCode}`);
      }
    },
    [lines, eligibleProducts, currentBatch, setError],
  );

  const handleConfirmHandoff = useCallback(async () => {
    if (!scannedAssignment || !currentBatch) return;

    try {
      confirmHandoff({
        assignmentId: scannedAssignment.assignmentId,
        sourceBoxes: scannedAssignment.sourceBoxes,
        confirmedBoxes,
        trackingKey: scannedAssignment.trackingKey,
        sourcePalletId: scannedAssignment.sourcePalletId,
        sourceQr: scannedAssignment.sourceQr,
        actor: "current_user",
        createdAt: new Date().toISOString(),
        idempotencyKey: scannedAssignment.idempotencyKey,
      });

      // Generate evidence PDF
      const evidenceId = `ev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // In real app, would call evidencePdf service
      setGeneratedEvidence({
        evidenceId,
        type: "handoff",
        storagePath: `organizations/org_exepa_001/labeling/evidence/${currentBatch.batchId}/${evidenceId}/handoff.pdf`,
        downloadUrl: "#",
        uploadedAt: new Date().toISOString(),
        uploadedBy: "current_user",
      });
      setShowEvidencePreview(true);
      setScannedAssignment(null);
    } catch (error) {
      setError("Error al confirmar entrega");
    }
  }, [scannedAssignment, currentBatch, confirmedBoxes, confirmHandoff, setError]);

  if (catalogosLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando catálogos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.history.back()}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                aria-label="Volver"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Entregar a Etiquetado</h1>
                <p className="text-sm text-gray-500">
                  Confirme entrega de pallets a empresa etiquetadora
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                  status === "planned"
                    ? "bg-blue-100 text-blue-700"
                    : status === "in_progress"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {isLoading}
          </div>
        )}

        {/* Scan Section */}
        <section className="mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Escanear Pallet de Origen
            </h2>

            {scannedAssignment ? (
              <div className="space-y-4">
                {/* Read-only info */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-3">
                    Información del Pallet (solo lectura)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">QR Origen</p>
                      <p className="font-mono text-gray-900 break-all">
                        {scannedAssignment.sourceQr}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Producto</p>
                      <p className="font-medium text-gray-900">
                        {eligibleProducts.find((p: any) => {
                          const line = Array.from(lines.values()).find(
                            (l: any) => l.trackingKey === scannedAssignment.trackingKey,
                          );
                          return line && p.id === (line as any).productId;
                        })?.name || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Lote</p>
                      <p className="font-mono text-gray-900">
                        {(
                          Array.from(lines.values()).find(
                            (l: any) => l.trackingKey === scannedAssignment.trackingKey,
                          ) as any
                        )?.lotSnapshot || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Caducidad</p>
                      <p className="text-gray-900">
                        {(
                          Array.from(lines.values()).find(
                            (l: any) => l.trackingKey === scannedAssignment.trackingKey,
                          ) as any
                        )?.expiryDate || "—"}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500">Cajas en Origen</p>
                      <p className="font-bold text-xl text-blue-600">
                        {scannedAssignment.sourceBoxes}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500">Cajas Físicas Confirmadas</p>
                      <input
                        type="number"
                        min="1"
                        max={scannedAssignment.sourceBoxes * 2}
                        value={confirmedBoxes}
                        onChange={(e) => setConfirmedBoxes(parseInt(e.target.value) || 0)}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-lg text-center"
                      />
                    </div>
                    {confirmedBoxes !== scannedAssignment.sourceBoxes && (
                      <div className="md:col-span-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                        <strong>Diferencia detectada:</strong>{" "}
                        {confirmedBoxes - scannedAssignment.sourceBoxes > 0 ? "+" : ""}
                        {confirmedBoxes - scannedAssignment.sourceBoxes} cajas vs origen
                      </div>
                    )}
                  </div>
                </div>

                {/* Receptor / Entregado por / Fecha */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quien recibe <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      placeholder="Nombre de quien recibe en etiquetado"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quien entrega <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={deliveredByName}
                      onChange={(e) => setDeliveredByName(e.target.value)}
                      placeholder="Nombre de quien entrega desde bodega"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleClose}
                    className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar / Nuevo escaneo
                  </button>
                  <button
                    onClick={handleConfirmHandoff}
                    disabled={!receiverName.trim() || !deliveredByName.trim()}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Confirmar Entrega
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="text-lg font-medium">Escanear Código QR</span>
                </button>
                <p className="mt-4 text-gray-500">
                  Formato esperado:{" "}
                  <code className="px-2 py-1 bg-gray-100 rounded text-blue-600">TQR-OC123-1</code>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Evidence Preview Modal */}
        {showEvidencePreview && generatedEvidence && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Comprobante de Entrega Generado
                </h2>
                <button
                  onClick={() => {
                    setShowEvidencePreview(false);
                    setGeneratedEvidence(null);
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
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
              <div className="p-4">
                <EvidencePreview
                  batch={{ ...currentBatch, ...{ receiverName, deliveredByName } } as any}
                  lines={lines}
                  evidenceRefs={[generatedEvidence]}
                  onDownload={() => {}}
                  onPrint={() => {}}
                  onEmail={() => {}}
                />
              </div>
            </div>
          </div>
        )}

        {/* QR Scanner Modal */}
        {showQRScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Escanear Pallet de Origen</h2>
                <button
                  onClick={handleClose}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
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
              <div className="p-4">
                <QRScanner onScanSuccess={handleQRScan} onError={handleClose} className="w-full" />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default EntregarEtiquetado;
