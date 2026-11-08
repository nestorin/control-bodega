/**
 * DiscrepancyDialog — Diálogo para aprobar/rechazar discrepancias
 *
 * Permite al supervisor/admin aprobar o rechazar discrepancias reportadas.
 * Incluye: tipo, cajas, motivo, evidencias, campos de resolución.
 */

import { useState, useCallback, memo } from "react";
import type { LabelingDiscrepancy, EvidenceRef, Timestamp } from "@/types/labeling";

interface DiscrepancyDialogProps {
  discrepancy: LabelingDiscrepancy | null;
  evidenceRefs: EvidenceRef[];
  onClose: () => void;
  onApprove: (discrepancyId: string, resolution: string, approvedLoss: number) => void;
  onReject: (discrepancyId: string, reason: string) => void;
  isLoading?: boolean;
}

function DiscrepancyDialogInner({
  discrepancy,
  evidenceRefs,
  onClose,
  onApprove,
  onReject,
  isLoading = false,
}: DiscrepancyDialogProps) {
  const [resolution, setResolution] = useState("");
  const [approvedLoss, setApprovedLoss] = useState<number | "">("");
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState<"approve" | "reject">("approve");

  const discrepancyEvidences = evidenceRefs.filter(
    (e) => e.type === "discrepancy" || e.type === "shortage",
  );

  const formatDate = useCallback((dateString: string | Timestamp | null | undefined) => {
    if (!dateString) return "—";
    const date =
      dateString instanceof Date
        ? dateString
        : typeof dateString === "string"
          ? new Date(dateString)
          : dateString.toDate();
    return date.toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const handleApprove = useCallback(() => {
    if (!discrepancy) return;
    const lossNum =
      typeof approvedLoss === "number" ? approvedLoss : parseInt(approvedLoss as string, 10);
    if (isNaN(lossNum) || lossNum < 0) return;
    if (lossNum > discrepancy.boxes) return;
    onApprove(discrepancy.discrepancyId, resolution, lossNum);
  }, [discrepancy, approvedLoss, resolution, onApprove]);

  const handleReject = useCallback(() => {
    if (!discrepancy || !rejectReason.trim()) return;
    onReject(discrepancy.discrepancyId, rejectReason.trim());
  }, [discrepancy, rejectReason, onReject]);

  if (!discrepancy) return null;

  const typeLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    SHORTAGE: {
      label: "Faltante",
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
    },
    DAMAGE: {
      label: "Dañado",
      color: "bg-red-100 text-red-800 border-red-300",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    EXCESS: {
      label: "Exceso",
      color: "bg-green-100 text-green-800 border-green-300",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    OTHER: {
      label: "Otro",
      color: "bg-gray-100 text-gray-800 border-gray-300",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  };

  const typeInfo = typeLabels[discrepancy.type] || typeLabels.OTHER;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg border ${typeInfo.color}`}>{typeInfo.icon}</div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Discrepancia: {typeInfo.label}
                </h2>
                <p className="text-sm text-gray-500">ID: {discrepancy.discrepancyId}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Cerrar"
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

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Discrepancy details */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Tipo</p>
                  <p className="font-medium capitalize">{typeInfo.label}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Cajas reportadas</p>
                  <p className="font-medium text-xl text-red-600">{discrepancy.boxes}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Motivo</p>
                  <p className="font-medium">{discrepancy.reason || "Sin motivo especificado"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reportado por</p>
                  <p className="font-medium">{discrepancy.reportedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fecha reporte</p>
                  <p className="font-medium">{formatDate(discrepancy.reportedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Estado</p>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      discrepancy.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : discrepancy.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {discrepancy.status === "pending"
                      ? "Pendiente"
                      : discrepancy.status === "approved"
                        ? "Aprobada"
                        : "Rechazada"}
                  </span>
                </div>
              </div>

              {/* Tracking key */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">Tracking Key</p>
                <p className="font-mono text-sm text-gray-900 break-all">
                  {discrepancy.trackingKey}
                </p>
              </div>
            </div>

            {/* Evidences */}
            {discrepancyEvidences.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">
                  Evidencias ({discrepancyEvidences.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {discrepancyEvidences.map((evidence) => (
                    <div
                      key={evidence.evidenceId}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                    >
                      <p className="text-xs text-gray-500 capitalize">{evidence.type}</p>
                      <p className="text-sm font-medium truncate">
                        {evidence.storagePath.split("/").pop()}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(evidence.uploadedAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution tabs */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex gap-1 mb-4" role="tablist">
                <button
                  role="tab"
                  aria-selected={activeTab === "approve"}
                  onClick={() => setActiveTab("approve")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === "approve"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <svg
                    className="inline w-4 h-4 mr-1"
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
                  Aprobar
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab === "reject"}
                  onClick={() => setActiveTab("reject")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === "reject"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <svg
                    className="inline w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Rechazar
                </button>
              </div>

              {/* Approve tab */}
              {activeTab === "approve" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pérdida aprobada (cajas) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={discrepancy.boxes}
                      value={approvedLoss}
                      onChange={(e) =>
                        setApprovedLoss(e.target.value === "" ? "" : parseInt(e.target.value, 10))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder={`0 - ${discrepancy.boxes}`}
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Máximo: {discrepancy.boxes} cajas (total reportado)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observaciones de resolución <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="Describa la resolución: ajuste de inventario, nota de crédito, etc."
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      disabled={isLoading}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={
                        isLoading ||
                        !resolution.trim() ||
                        approvedLoss === "" ||
                        isNaN(Number(approvedLoss))
                      }
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {isLoading ? "Aprobando..." : "Aprobar Discrepancia"}
                    </button>
                  </div>
                </div>
              )}

              {/* Reject tab */}
              {activeTab === "reject" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo del rechazo <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Explique por qué se rechaza la discrepancia..."
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      disabled={isLoading}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isLoading || !rejectReason.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {isLoading ? "Rechazando..." : "Rechazar Discrepancia"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const DiscrepancyDialog = memo(function DiscrepancyDialog({
  discrepancy,
  evidenceRefs,
  onClose,
  onApprove,
  onReject,
  isLoading = false,
}: DiscrepancyDialogProps) {
  return <DiscrepancyDialogInner {...arguments[0]} />;
});

export type { DiscrepancyDialogProps };
export default DiscrepancyDialog;
