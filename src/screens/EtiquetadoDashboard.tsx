/**
 * EtiquetadoDashboard — Pantalla de lista/dashboard de lotes de etiquetado
 *
 * Filtros: estado, empresa, rango de fechas
 * Paginación con cursor
 * Muestra progreso: asignado/devuelto/salida/pendiente por lote
 */

import React, { useState, useCallback, useMemo } from "react";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";

const STATUS_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "planned", label: "Planificado" },
  { value: "in_progress", label: "En progreso" },
  { value: "reconciling", label: "Conciliando" },
  { value: "closed_reconciled", label: "Cerrado reconciliado" },
  { value: "closed_with_discrepancy", label: "Cerrado con discrepancia" },
  { value: "cancelled", label: "Cancelado" },
  { value: "cancelled_with_reversal", label: "Cancelado con reversión" },
] as const;

const ITEMS_PER_PAGE = 10;

function formatDate(dateString: string | null | undefined | Date): string {
  if (!dateString) return "—";
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    planned: "bg-blue-100 text-blue-700",
    in_progress: "bg-green-100 text-green-700",
    reconciling: "bg-yellow-100 text-yellow-700",
    closed_reconciled: "bg-green-100 text-green-700",
    closed_with_discrepancy: "bg-orange-100 text-orange-700",
    cancelled: "bg-red-100 text-red-700",
    cancelled_with_reversal: "bg-red-100 text-red-700",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Borrador",
    planned: "Planificado",
    in_progress: "En progreso",
    reconciling: "Conciliando",
    closed_reconciled: "Cerrado reconciliado",
    closed_with_discrepancy: "Cerrado con discrep.",
    cancelled: "Cancelado",
    cancelled_with_reversal: "Cancelado c/ reversión",
  };
  return labels[status] || status;
}

function ProgressCell({ batch }: { batch: any }) {
  const progress = batch.progress;
  const total = progress.assigned || 0;
  const completed = (progress.returned || 0) + (progress.output || 0);
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <td className="p-3 text-right">
      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {Math.round(
          (((batch.progress?.returned || 0) + (batch.progress?.output || 0)) /
            (batch.progress?.assigned || 1)) *
            100,
        )}
        % completado
      </div>
    </td>
  );
}

const handleViewBatch = (batchId: string) => {
  // Navigate to batch detail view
  console.log("View batch:", batchId);
  // window.location.href = `/etiquetado/${batchId}`;
};

export function EtiquetadoDashboard() {
  const {
    currentBatch,
    status,
    lines,
    assignments,
    returns,
    outputPallets,
    discrepancies,
    evidenceRefs,
    version,
    isLoading,
    error,
    createBatch,
    planBatch,
    cancelBatch,
    addLine,
    updateLine,
    removeLine,
    confirmHandoff,
    registerReturn,
    createOutputPallets,
    reconcileBatch,
    closeBatch,
    cancelBatchWithReversal,
    setEvidenceRef,
    setError,
    setLoading,
    resetAll,
  } = useLabelingBatch();

  const [batches, setBatches] = useState<Array<any>>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const mockBatches = useMemo(() => {
    const mock: Array<any> = [
      {
        batchId: "batch-2024-001",
        warehouseId: "wh_exepa_001",
        labelingCompanyId: "comp_etiquetas_001",
        labelingCompanyName: "Etiquetas Express SA",
        receiverName: "Juan Pérez",
        deliveredByName: "Carlos López",
        status: "closed_reconciled",
        estimatedTotals: { boxes: 500, pallets: 10 },
        actualTotals: { assigned: 500, returned: 480, loss: 10, pending: 10, output: 490 },
        openedAt: "2024-01-15T08:00:00Z",
        closedAt: "2024-01-20T14:30:00Z",
        version: 5,
        evidenceRefs: [],
        progress: { assigned: 500, returned: 480, output: 490, pending: 10 },
      },
      {
        batchId: "batch-2024-002",
        warehouseId: "wh_exepa_001",
        labelingCompanyId: "comp_etiquetas_002",
        labelingCompanyName: "Etiquetas del Norte",
        receiverName: "María García",
        deliveredByName: "Pedro Ruiz",
        status: "in_progress",
        estimatedTotals: { boxes: 300, pallets: 6 },
        actualTotals: { assigned: 200, returned: 50, loss: 5, pending: 145, output: 150 },
        openedAt: "2024-01-22T09:00:00Z",
        closedAt: null,
        version: 3,
        evidenceRefs: [],
        progress: { assigned: 200, returned: 50, output: 150, pending: 145 },
      },
      {
        batchId: "batch-2024-003",
        warehouseId: "wh_exepa_001",
        labelingCompanyId: "comp_etiquetas_001",
        labelingCompanyName: "Etiquetas Express SA",
        receiverName: "Ana Martín",
        deliveredByName: "Luis Gómez",
        status: "planned",
        estimatedTotals: { boxes: 800, pallets: 16 },
        actualTotals: { assigned: 0, returned: 0, loss: 0, pending: 0, output: 0 },
        openedAt: "2024-01-25T10:00:00Z",
        closedAt: null,
        version: 1,
        evidenceRefs: [],
        progress: { assigned: 0, returned: 0, output: 0, pending: 0 },
      },
      {
        batchId: "batch-2024-004",
        warehouseId: "wh_exepa_001",
        labelingCompanyId: "comp_etiquetas_003",
        labelingCompanyName: "Etiquetas Central",
        receiverName: "Roberto Silva",
        deliveredByName: "Jorge Herrera",
        status: "reconciling",
        estimatedTotals: { boxes: 450, pallets: 9 },
        actualTotals: { assigned: 450, returned: 400, loss: 20, pending: 30, output: 420 },
        openedAt: "2024-01-18T08:30:00Z",
        closedAt: null,
        version: 4,
        evidenceRefs: [],
        progress: { assigned: 450, returned: 400, output: 420, pending: 30 },
      },
      {
        batchId: "batch-2024-005",
        warehouseId: "wh_exepa_001",
        labelingCompanyId: "comp_etiquetas_002",
        labelingCompanyName: "Etiquetas del Norte",
        receiverName: "Carmen Vega",
        deliveredByName: "Andrés Torres",
        status: "closed_with_discrepancy",
        estimatedTotals: { boxes: 600, pallets: 12 },
        actualTotals: { assigned: 600, returned: 550, loss: 30, pending: 20, output: 580 },
        openedAt: "2024-01-10T07:00:00Z",
        closedAt: "2024-01-15T16:00:00Z",
        version: 6,
        evidenceRefs: [],
        progress: { assigned: 600, returned: 550, output: 580, pending: 20 },
      },
    ];
    return mock;
  }, []);

  const filteredBatches = useMemo(() => {
    return mockBatches.filter((batch) => {
      if (statusFilter && batch.status !== statusFilter) return false;
      if (companyFilter && batch.labelingCompanyId !== companyFilter) return false;
      if (dateFrom && batch.openedAt && batch.openedAt < dateFrom) return false;
      if (dateTo && batch.openedAt && batch.openedAt > dateTo) return false;
      return true;
    });
  }, [mockBatches, statusFilter, companyFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredBatches.length / 10);
  const paginatedBatches = filteredBatches.slice(currentPage * 10, (currentPage + 1) * 10);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
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
                <h1 className="text-xl font-bold text-gray-900">Dashboard Etiquetado</h1>
                <p className="text-sm text-gray-500">
                  Gestión y seguimiento de lotes de etiquetado
                </p>
              </div>
            </div>
            <button
              onClick={() => (window.location.href = "/etiquetado/nuevo")}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Nuevo Lote
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {isLoading}
          </div>
        )}

        {/* Filters */}
        <section className="mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empresa Etiquetadora
                </label>
                <select
                  value={companyFilter}
                  onChange={(e) => {
                    setCompanyFilter(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  <option value="comp_etiquetas_001">Etiquetas Express SA</option>
                  <option value="comp_etiquetas_002">Etiquetas del Norte</option>
                  <option value="comp_etiquetas_003">Etiquetas Central</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Hasta</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="lg:col-span-5 flex justify-end">
                <button
                  onClick={() => {
                    setStatusFilter("");
                    setCompanyFilter("");
                    setDateFrom("");
                    setDateTo("");
                    setCurrentPage(0);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Results Summary */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Mostrando {paginatedBatches.length} de {filteredBatches.length} lote(s)
          </p>
        </div>

        {/* Batches Table */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-medium">Folio</th>
                  <th className="text-left p-3 font-medium">Empresa</th>
                  <th className="text-left p-3 font-medium">Receptor / Entregado por</th>
                  <th className="text-center p-3 font-medium">Estado</th>
                  <th className="text-right p-3 font-medium">Cajas</th>
                  <th className="text-right p-3 font-medium">Progreso</th>
                  <th className="text-left p-3 font-medium">Fechas</th>
                  <th className="text-center p-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                        />
                      </svg>
                      <h3 className="mt-4 text-lg font-medium text-gray-900">
                        No se encontraron lotes
                      </h3>
                      <p className="mt-2 text-gray-500">
                        Intente ajustar los filtros o cree un nuevo lote
                      </p>
                    </td>
                  </tr>
                ) : (
                  <React.Fragment>
                    {paginatedBatches.map((batch) => (
                      <tr
                        key={batch.batchId}
                        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleViewBatch(batch.batchId)}
                      >
                        <td className="p-3">
                          <div className="font-mono font-medium text-gray-900">{batch.batchId}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-900">
                            {batch.labelingCompanyName}
                          </div>
                          <div className="text-xs text-gray-500">{batch.warehouseId}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm text-gray-900">Recibe: {batch.receiverName}</div>
                          <div className="text-xs text-gray-500">
                            Entrega: {batch.deliveredByName}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(batch.status)}`}
                          >
                            {formatStatus(batch.status)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-medium text-gray-900">
                            {batch.estimatedTotals?.boxes || 0} /{" "}
                            {batch.actualTotals?.assigned || 0}
                          </div>
                          <div className="text-xs text-gray-500">Est. / Asignadas</div>
                        </td>
                        <td className="p-3 text-right">
                          <ProgressCell batch={batch} />
                        </td>
                        <td className="p-3">
                          <div className="text-xs text-gray-500">
                            Creado: {formatDate(batch.openedAt)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Cerrado: {formatDate(batch.closedAt)}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewBatch(batch.batchId);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
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
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z"
                              />
                            </svg>
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Página {currentPage + 1} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage === totalPages - 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Stats Cards */}
        <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Lotes</p>
                <p className="text-3xl font-bold text-gray-900">{filteredBatches.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">En Progreso</p>
                <p className="text-3xl font-bold text-green-600">
                  {filteredBatches.filter((b) => b.status === "in_progress").length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pendientes Conciliar</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {filteredBatches.filter((b) => b.status === "reconciling").length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77-1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cerrados</p>
                <p className="text-3xl font-bold text-blue-600">
                  {filteredBatches.filter((b) => b.status.startsWith("closed_")).length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
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
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default EtiquetadoDashboard;
