/**
 * ReconcileDashboard — Dashboard de conciliación y cierre de lote
 *
 * Muestra líneas con: estimado, asignado, devuelto, pérdida, pendiente, salida, diff.
 * Permite aprobación de discrepancias y cierre: reconciled / with_discrepancy.
 */

import { useState, useCallback, useMemo, memo } from "react";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";
import { DiscrepancyDialog } from "./DiscrepancyDialog";
import type { LabelingDiscrepancy, EvidenceRef } from "@/types/labeling";

export interface ReconcileDashboardProps {
  onClose?: () => void;
}

export function ReconcileDashboard({ onClose }: ReconcileDashboardProps) {
  const {
    currentBatch,
    status,
    lines,
    discrepancies,
    evidenceRefs,
    reconcileBatch,
    closeBatch,
    isLoading,
  } = useLabelingBatch();

  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<LabelingDiscrepancy | null>(null);
  const [closeMode, setCloseMode] = useState<"reconciled" | "with_discrepancy">("reconciled");
  const [closeReason, setCloseReason] = useState("");

  // Compute reconciliation data per trackingKey
  const reconcileData = useMemo(() => {
    if (!currentBatch) return [];

    return Array.from(lines.values()).map((line: any) => {
      const estimated = line.estimatedBoxes;
      const assigned = line.assignedBoxes;
      const returned = line.returnedBoxes;
      const loss = line.approvedLossBoxes;
      const output = line.outputBoxes;
      const pending = assigned - returned - loss;
      const diff = assigned - estimated;

      // Find discrepancies for this trackingKey
      const trackingDiscrepancies = Array.from(discrepancies.values()).filter(
        (d: any) => d.trackingKey === line.trackingKey,
      );

      const hasApprovedDiscrepancy = trackingDiscrepancies.some(
        (d: any) => d.status === "approved",
      );
      const hasPendingDiscrepancy = trackingDiscrepancies.some((d: any) => d.status === "pending");

      return {
        lineId: line.lineId,
        trackingKey: line.trackingKey,
        productName: line.productSnapshot?.name || line.productId,
        lot: line.lotSnapshot,
        expiry: line.expiryDate,
        estimated,
        assigned,
        returned,
        loss,
        output,
        pending,
        diff,
        hasApprovedDiscrepancy,
        hasPendingDiscrepancy,
        discrepancies: trackingDiscrepancies,
      };
    });
  }, [currentBatch, lines, discrepancies]);

  // Check if fully reconciled
  const isFullyReconciled = useMemo(() => {
    return reconcileData.every((d) => d.pending === 0 || d.hasApprovedDiscrepancy);
  }, [reconcileData]);

  // Check if can close
  const canClose = useMemo(() => {
    if (!currentBatch) return false;
    if (closeMode === "reconciled") {
      return isFullyReconciled;
    }
    // with_discrepancy: all pending must have approved discrepancy
    return reconcileData.every((d) => d.pending === 0 || d.hasApprovedDiscrepancy);
  }, [currentBatch, closeMode, isFullyReconciled, reconcileData]);

  const formatDate = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const handleReconcile = useCallback(() => {
    if (!currentBatch) return;
    reconcileBatch(currentBatch.version);
  }, [currentBatch, reconcileBatch]);

  const handleClose = useCallback(() => {
    if (!currentBatch) return;
    closeBatch(
      {
        type: closeMode === "reconciled" ? "reconciled" : "with_discrepancy",
        reason: closeReason,
      },
      currentBatch.version,
    );
  }, [currentBatch, closeMode, closeReason, closeBatch]);

  const handleOpenDiscrepancy = useCallback((discrepancy: LabelingDiscrepancy) => {
    setSelectedDiscrepancy(discrepancy);
  }, []);

  const handleDiscrepancyClose = useCallback(() => {
    setSelectedDiscrepancy(null);
  }, []);

  const handleApproveDiscrepancy = useCallback(
    (discrepancyId: string, resolution: string, approvedLoss: number) => {
      // This would call the appropriate action - for now just close
      setSelectedDiscrepancy(null);
    },
    [],
  );

  const handleRejectDiscrepancy = useCallback((discrepancyId: string, reason: string) => {
    setSelectedDiscrepancy(null);
  }, []);

  if (!currentBatch) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
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
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">Sin lote seleccionado</h3>
        <p className="mt-2 text-gray-500">Seleccione o cree un lote para conciliar</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conciliar y Cerrar Lote</h1>
          <p className="text-gray-600 mt-1">
            Lote: <span className="font-mono text-blue-600">{currentBatch.batchId}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
              status === "planned"
                ? "bg-gray-100 text-gray-700"
                : status === "in_progress"
                  ? "bg-blue-100 text-blue-700"
                  : status === "reconciling"
                    ? "bg-yellow-100 text-yellow-700"
                    : status === "closed_reconciled"
                      ? "bg-green-100 text-green-700"
                      : status === "closed_with_discrepancy"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-red-100 text-red-700"
            }`}
          >
            {status.replace(/_/g, " ")}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Volver
          </button>
        </div>
      </div>

      {/* Reconcile action */}
      {status === "in_progress" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-yellow-800">Lote listo para conciliar</h3>
                <p className="text-sm text-yellow-700">
                  Revise las líneas, apruebe discrepancias y concilie el lote
                </p>
              </div>
            </div>
            <button
              onClick={handleReconcile}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:opacity-50"
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Conciliar Lote
            </button>
          </div>
        </div>
      )}

      {/* Close action */}
      {status === "reconciling" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-blue-800">Lote conciliado - Listo para cerrar</h3>
                <p className="text-sm text-blue-700">Seleccione modo de cierre y confirme</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <select
                value={closeMode}
                onChange={(e) => setCloseMode(e.target.value as "reconciled" | "with_discrepancy")}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="reconciled">Cerrar reconciliado (todo cuadrado)</option>
                <option value="with_discrepancy">Cerrar con discrepancias aprobadas</option>
              </select>
              {closeMode === "with_discrepancy" && (
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Motivo del cierre con discrepancias"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 flex-1 min-w-[200px]"
                />
              )}
              <button
                onClick={handleClose}
                disabled={isLoading || !canClose}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
                Cerrar Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Table */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Conciliación por TrackingKey ({reconcileData.length})
            </h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                ✓ {reconcileData.filter((d) => d.pending === 0).length} OK
              </span>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                ⚠ {reconcileData.filter((d) => d.pending > 0 && d.hasApprovedDiscrepancy).length}{" "}
                Con discrep. aprobada
              </span>
              <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                ✗ {reconcileData.filter((d) => d.pending > 0 && !d.hasApprovedDiscrepancy).length}{" "}
                Pendientes
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 font-medium">Producto / Lote</th>
                <th className="text-right p-3 font-medium">Estimado</th>
                <th className="text-right p-3 font-medium">Asignado</th>
                <th className="text-right p-3 font-medium">Devuelto</th>
                <th className="text-right p-3 font-medium">Pérdida</th>
                <th className="text-right p-3 font-medium">Salida</th>
                <th className="text-right p-3 font-medium">Pendiente</th>
                <th className="text-right p-3 font-medium">Diff</th>
                <th className="text-center p-3 font-medium">Discrep.</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reconcileData.map((d) => (
                <tr
                  key={d.lineId}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${
                    d.pending > 0 && !d.hasApprovedDiscrepancy
                      ? "bg-red-50"
                      : d.pending > 0 && d.hasApprovedDiscrepancy
                        ? "bg-yellow-50"
                        : ""
                  }`}
                >
                  <td className="p-3">
                    <div className="font-medium">{d.productName}</div>
                    <div className="text-xs text-gray-500 font-mono">Lote: {d.lot}</div>
                    <div className="text-xs text-gray-500">Cad: {d.expiry || "—"}</div>
                    <div className="text-xs text-gray-400 font-mono">{d.trackingKey}</div>
                  </td>
                  <td className="p-3 text-right font-medium">{d.estimated}</td>
                  <td className="p-3 text-right font-medium text-blue-700">{d.assigned}</td>
                  <td className="p-3 text-right">{d.returned}</td>
                  <td className="p-3 text-right">{d.loss}</td>
                  <td className="p-3 text-right">{d.output}</td>
                  <td
                    className="p-3 text-right font-bold {
                    d.pending === 0 ? 'text-green-600' :
                    d.hasApprovedDiscrepancy ? 'text-yellow-600' :
                    'text-red-600'
                  }"
                  >
                    {d.pending > 0 ? "+" : ""}
                    {d.pending}
                  </td>
                  <td
                    className="p-3 text-right font-medium {
                    d.diff === 0 ? 'text-green-600' :
                    d.diff > 0 ? 'text-red-600' :
                    'text-yellow-600'
                  }"
                  >
                    {d.diff > 0 ? "+" : ""}
                    {d.diff}
                  </td>
                  <td className="p-3 text-center">
                    {d.discrepancies.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          d.hasApprovedDiscrepancy
                            ? "bg-green-100 text-green-700"
                            : d.hasPendingDiscrepancy
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {d.hasApprovedDiscrepancy
                          ? "Aprobada"
                          : d.hasPendingDiscrepancy
                            ? "Pendiente"
                            : "Rechazada"}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {d.discrepancies.length > 0 && d.hasPendingDiscrepancy && (
                      <button
                        onClick={() => handleOpenDiscrepancy(d.discrepancies[0] as any)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded hover:bg-yellow-200"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        Revisar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Estimado</p>
              <p className="font-bold text-lg">
                {reconcileData.reduce((s, d) => s + d.estimated, 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Asignado</p>
              <p className="font-bold text-lg text-blue-700">
                {reconcileData.reduce((s, d) => s + d.assigned, 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Devuelto</p>
              <p className="font-bold text-lg">
                {reconcileData.reduce((s, d) => s + d.returned, 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Pérdida</p>
              <p className="font-bold text-lg">{reconcileData.reduce((s, d) => s + d.loss, 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Pendiente</p>
              <p className="font-bold text-lg text-red-600">
                {reconcileData.reduce((s, d) => s + d.pending, 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Discrepancy Dialog */}
      <DiscrepancyDialog
        discrepancy={selectedDiscrepancy}
        evidenceRefs={evidenceRefs}
        onClose={handleDiscrepancyClose}
        onApprove={handleApproveDiscrepancy}
        onReject={handleRejectDiscrepancy}
        isLoading={isLoading}
      />
    </div>
  );
}

export default ReconcileDashboard;
