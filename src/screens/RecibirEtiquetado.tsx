/**
 * RecibirEtiquetado — Pantalla de recepción (return) desde empresa etiquetadora
 *
 * Flujo:
 * 1. Escanear QR de entrega/asignación o pallet origen
 * 2. Mostrar datos solo lectura: producto, lote, caducidad, cajas origen, entregadas
 * 3. Recibir cajas físicas (bloquear exceso)
 * 4. Si faltante: seleccionar motivo (mercancía dañada / mal estado / dañado en etiquetado) + evidencia si dañado_en_etiquetado
 * 4. Crea discrepancia si hay faltante
 */

import { useState, useCallback, useMemo } from "react";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";
import { useLabelingCatalog } from "@/hooks/useLabelingCatalog";
import { QRScanner } from "@/components/labeling/QRScanner";
import { DiscrepancyDialog } from "@/components/labeling/DiscrepancyDialog";
import type { LabelingAssignment } from "@/types/labeling";

const SHORTAGE_REASONS = [
  { value: "damaged_merchandise", label: "Mercancía dañada" },
  { value: "poor_condition", label: "Mal estado" },
  { value: "damaged_during_labeling", label: "Dañado durante etiquetado", requiresEvidence: true },
] as const;

type ShortageReason = (typeof SHORTAGE_REASONS)[number]["value"];

export function RecibirEtiquetado() {
  const { currentBatch, status, lines, assignments, isLoading, registerReturn, setError } =
    useLabelingBatch();

  const { eligibleProducts, loadCatalogs, catalogosLoading } = useLabelingCatalog();

  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedAssignment, setScannedAssignment] = useState<LabelingAssignment | null>(null);
  const [receivedBoxes, setReceivedBoxes] = useState<number>(0);
  const [shortageBoxes, setShortageBoxes] = useState<number>(0);
  const [shortageReason, setShortageReason] = useState<ShortageReason>("damaged_merchandise");
  const [showDiscrepancyDialog, setShowDiscrepancyDialog] = useState(false);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<any>(null);

  useMemo(() => {
    if (eligibleProducts.length === 0 && !catalogosLoading) {
      loadCatalogs("");
    }
  }, [eligibleProducts.length, catalogosLoading, loadCatalogs]);

  const handleClose = useCallback(() => {
    setShowQRScanner(false);
  }, []);

  const handleQRScan = useCallback(
    (qrCode: string) => {
      // Buscar asignación por QR
      const assignment = Array.from(assignments.values()).find(
        (a: any) => a.sourceQr === qrCode,
      ) as LabelingAssignment | undefined;

      if (assignment) {
        setScannedAssignment(assignment);
        setReceivedBoxes(assignment.confirmedBoxes); // default to confirmed
        setShortageBoxes(0);
        setShowQRScanner(false);
      } else {
        // Buscar en líneas por QR de origen
        const line = Array.from(lines.values()).find((l: any) => {
          const product = eligibleProducts.find(
            (p: any) => qrCode.includes(p.id) || qrCode.includes(p.sku),
          );
          return product && l.productId === product.id;
        });

        const typedLine = line as any;
        if (typedLine) {
          // Create a temporary assignment-like object
          setScannedAssignment({
            assignmentId: `assign-${Date.now()}`,
            batchId: currentBatch?.batchId || "",
            sourcePalletId: qrCode,
            sourceQr: qrCode,
            trackingKey: typedLine.trackingKey,
            sourceBoxes: typedLine.estimatedBoxes,
            confirmedBoxes: typedLine.assignedBoxes,
            status: "active",
            actor: "system",
            createdAt: new Date().toISOString(),
            idempotencyKey: `idem-${Date.now()}`,
          } as any);
          setReceivedBoxes(typedLine.assignedBoxes);
          setShortageBoxes(0);
          setShowQRScanner(false);
        } else {
          setError(`No se encontró asignación o línea para QR: ${qrCode}`);
        }
      }
    },
    [assignments, lines, eligibleProducts, currentBatch, setError],
  );

  const maxReceivable = useMemo(() => {
    if (!scannedAssignment) return 0;
    return (scannedAssignment as any).confirmedBoxes;
  }, [scannedAssignment]);

  const handleReceive = useCallback(() => {
    if (!scannedAssignment || !currentBatch) return;

    const shortage = Math.max(0, ((scannedAssignment as any).confirmedBoxes || 0) - receivedBoxes);

    if (shortage > 0) {
      if (shortageReason === "damaged_during_labeling") {
        // Require evidence - show discrepancy dialog for approval
        const discrepancy = {
          discrepancyId: `disc-${Date.now()}`,
          batchId: currentBatch.batchId,
          trackingKey: (scannedAssignment as any).trackingKey,
          type: "SHORTAGE",
          boxes: shortage,
          reason: shortageReason,
          evidenceRefs: [],
          reportedBy: "current_user",
          reportedAt: new Date().toISOString(),
          status: "pending",
        };
        setSelectedDiscrepancy(discrepancy);
        setShowDiscrepancyDialog(true);
      } else {
        // Register return with shortage
        registerReturn({
          returnId: `ret-${Date.now()}`,
          assignmentId: scannedAssignment.assignmentId,
          receivedBoxes,
          shortageBoxes: shortage,
          shortageReason,
          evidenceRefs: [],
          trackingKey: (scannedAssignment as any).trackingKey,
          actor: "current_user",
          receivedAt: new Date().toISOString(),
          idempotencyKey: `idem-${Date.now()}`,
        });
        setScannedAssignment(null);
      }
    } else {
      // Full receipt
      registerReturn({
        returnId: `ret-${Date.now()}`,
        assignmentId: scannedAssignment.assignmentId,
        receivedBoxes,
        shortageBoxes: 0,
        shortageReason: null,
        evidenceRefs: [],
        trackingKey: (scannedAssignment as any).trackingKey,
        actor: "current_user",
        receivedAt: new Date().toISOString(),
        idempotencyKey: `idem-${Date.now()}`,
      });
      setScannedAssignment(null);
    }
  }, [
    scannedAssignment,
    currentBatch,
    receivedBoxes,
    shortageBoxes,
    shortageReason,
    registerReturn,
  ]);

  const handleDiscrepancyClose = useCallback(() => {
    setShowDiscrepancyDialog(false);
    setSelectedDiscrepancy(null);
  }, []);

  const handleDiscrepancyApprove = useCallback(
    (discrepancyId: string, resolution: string, approvedLoss: number) => {
      // In real app, would call approveDiscrepancy
      console.log("Approve discrepancy", discrepancyId, resolution, approvedLoss);
      setShowDiscrepancyDialog(false);
      setSelectedDiscrepancy(null);
      // Register return after approval
      if (scannedAssignment && currentBatch) {
        registerReturn({
          returnId: `ret-${Date.now()}`,
          assignmentId: scannedAssignment.assignmentId,
          receivedBoxes,
          shortageBoxes: shortageBoxes,
          shortageReason,
          evidenceRefs: [],
          trackingKey: (scannedAssignment as any).trackingKey,
          actor: "current_user",
          receivedAt: new Date().toISOString(),
          idempotencyKey: `idem-${Date.now()}`,
        });
        setScannedAssignment(null);
      }
    },
    [scannedAssignment, currentBatch, receivedBoxes, shortageBoxes, shortageReason, registerReturn],
  );

  const handleDiscrepancyReject = useCallback((discrepancyId: string, reason: string) => {
    console.log("Reject discrepancy", discrepancyId, reason);
    setShowDiscrepancyDialog(false);
    setSelectedDiscrepancy(null);
  }, []);

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
                <h1 className="text-xl font-bold text-gray-900">Recibir de Etiquetado</h1>
                <p className="text-sm text-gray-500">
                  Registre recepción de pallets desde etiquetado
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                  status === "in_progress"
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
              Escanear Asignación / Pallet
            </h2>

            {scannedAssignment ? (
              <div className="space-y-4">
                {/* Read-only info */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-3">
                    Información de la Entrega (solo lectura)
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
                      <p className="font-medium text-gray-900">{"Producto detectado"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Lote</p>
                      <p className="font-mono text-gray-900">—</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Caducidad</p>
                      <p className="text-gray-900">—</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500">Cajas Entregadas</p>
                      <p className="font-bold text-xl text-blue-600">
                        {(scannedAssignment as any).confirmedBoxes || 0}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500">
                        Cajas Recibidas <span className="text-red-500">*</span>
                      </p>
                      <input
                        type="number"
                        min="0"
                        max={(scannedAssignment as any).confirmedBoxes || 0}
                        value={receivedBoxes}
                        onChange={(e) =>
                          setReceivedBoxes(
                            Math.min(
                              parseInt(e.target.value) || 0,
                              (scannedAssignment as any).confirmedBoxes || 0,
                            ),
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-lg text-center"
                      />
                    </div>
                  </div>
                </div>

                {/* Shortage handling */}
                {((scannedAssignment as any).confirmedBoxes || 0) - receivedBoxes > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-800 mb-2">
                      Faltante detectado:{" "}
                      {(scannedAssignment as any).confirmedBoxes - receivedBoxes} cajas
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Motivo del faltante <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={shortageReason}
                          onChange={(e) => setShortageReason(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          {SHORTAGE_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {shortageReason === "damaged_during_labeling" && (
                        <div className="md:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                          <strong>Requiere evidencia:</strong> Al seleccionar "Dañado durante
                          etiquetado", se creará una discrepancia que requerirá aprobación del
                          supervisor con evidencia fotográfica.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setScannedAssignment(null)}
                    className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar / Nuevo escaneo
                  </button>
                  <button
                    onClick={handleReceive}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
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
                    Registrar Recepción
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
                  Escanear QR de asignación (entrega) o pallet origen
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  Formato: <code className="px-2 py-1 bg-gray-100 rounded">TQR-OC123-1</code>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* QR Scanner Modal */}
        {showQRScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Escanear QR de Asignación</h2>
                <button
                  onClick={() => setShowQRScanner(false)}
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
                <QRScanner
                  onScanSuccess={handleQRScan}
                  onError={() => setShowQRScanner(false)}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Discrepancy Dialog */}
        {showDiscrepancyDialog && selectedDiscrepancy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Aprobar Discrepancia</h2>
                <button
                  onClick={() => {
                    setShowDiscrepancyDialog(false);
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
                <p className="text-gray-600 mb-4">
                  Se detectó un faltante de <strong>{shortageBoxes}</strong> cajas. Se requiere
                  aprobación del supervisor para registrar la pérdida.
                </p>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pérdida aprobada (cajas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={shortageBoxes}
                    value={shortageBoxes}
                    onChange={(e) => {}}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowDiscrepancyDialog(false)}
                    className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    Aprobar y registrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QR Scanner Modal */}
        {showQRScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Escanear QR de Asignación</h2>
                <button
                  onClick={() => setShowQRScanner(false)}
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
                <QRScanner
                  onScanSuccess={handleQRScan}
                  onError={() => setShowQRScanner(false)}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default RecibirEtiquetado;
