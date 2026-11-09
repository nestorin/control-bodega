/**
 * InventoryGridTab — Main Inventory Grid View UI
 * Virtualized table with filters, totals, drill-down, export
 */

import { useState, useCallback, useMemo } from "react";
import { useInventoryGrid } from "@/hooks/useInventoryGrid";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useAuthorization } from "@/hooks/useAuthorization";
import { GridCell } from "./GridCell";
import { ExportButtons } from "./ExportButtons";
import { Badge } from "@/components/configuracion/Badge";
import { BreakdownModal } from "./BreakdownModal";
import type { GridData, GridFilters, ReceptionBreakdown } from "@/types/csvImport";

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const VIEW_MODES: { value: "cajas" | "tarimas"; label: string }[] = [
  { value: "cajas", label: "📦 Cajas" },
  { value: "tarimas", label: "📦 Tarimas" },
];

export function InventoryGridTab() {
  const { gridData, isLoading, error, filters, setFilters, refresh, getBreakdown } =
    useInventoryGrid();

  const { catalogoAlmacenes } = useCatalogos();
  const { canQuery } = useAuthorization();

  const [viewMode, setViewMode] = useState<"cajas" | "tarimas">("cajas");
  const [breakdownModal, setBreakdownModal] = useState<ReceptionBreakdown | null>(null);

  const availableWarehouses = catalogoAlmacenes || [];
  const availableYears = useMemo(() => {
    if (!gridData) return [new Date().getFullYear()];
    return Array.from(
      new Set(gridData.rows.flatMap((r) => [filters.year])), // fallback
    );
  }, [gridData, filters.year]);

  // Default to current year
  const currentYear = new Date().getFullYear();
  const selectedWarehouse = availableWarehouses.find((w) => w.id === filters.warehouseId);
  const activeWarehouseName = selectedWarehouse?.nombre || "Todos";

  const handleWarehouseChange = useCallback(
    (warehouseId: string) => {
      setFilters({ ...filters, warehouseId });
    },
    [filters, setFilters],
  );

  const handleYearChange = useCallback(
    (year: number) => {
      setFilters({ ...filters, year });
    },
    [filters, setFilters],
  );

  const handleDrillDown = useCallback((breakdown: ReceptionBreakdown) => {
    setBreakdownModal(breakdown);
  }, []);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (!canQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#607078"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <p
          className="font-bold text-[#172126] text-[14px]"
          style={{ fontFamily: "'Inter',sans-serif" }}
        >
          Sin permisos para ver el grid
        </p>
        <p
          className="text-[#607078] text-[12px] text-center max-w-xs"
          style={{ fontFamily: "'Inter',sans-serif" }}
        >
          Necesitas rol de administrador o gestor para acceder a la vista de inventario.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto p-4 lg:p-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2
            className="font-black text-[#172126] text-[20px] sm:text-[24px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            Vista Grid Inventario
          </h2>
          <p
            className="text-[#607078] text-[13px] mt-1"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Resumen mensual de cajas/tarimas por producto. Haz clic en una celda para ver el
            desglose.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
          >
            {isLoading ? "⟳ Actualizando..." : "⟳ Actualizar"}
          </button>
          <ExportButtons gridData={gridData} filters={filters} viewMode={viewMode} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white border border-[#dce4e7] rounded-[12px] p-4">
        <div className="flex items-center gap-2">
          <label
            className="font-bold text-[12px] text-[#607078]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Almacén:
          </label>
          <select
            value={filters.warehouseId}
            onChange={(e) => handleWarehouseChange(e.target.value)}
            disabled={isLoading}
            className="flex-1 min-w-[180px] px-3 py-[8px] bg-white border border-[#dce4e7] rounded-[8px] text-[13px] focus:outline-none focus:border-[#3276a8] touch-target"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            <option value="">Todos los almacenes</option>
            {availableWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            className="font-bold text-[12px] text-[#607078]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Año:
          </label>
          <select
            value={filters.year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            disabled={isLoading}
            className="px-3 py-[8px] bg-white border border-[#dce4e7] rounded-[8px] text-[13px] focus:outline-none focus:border-[#3276a8] touch-target"
            style={{ fontFamily: "'Inter',sans-serif", minWidth: 100 }}
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label
            className="font-bold text-[12px] text-[#607078]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Vista:
          </label>
          <div className="flex bg-[#f0f4f5] rounded-[8px] p-1" role="radiogroup">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setViewMode(mode.value)}
                role="radio"
                aria-checked={viewMode === mode.value}
                className={`px-3 py-[6px] rounded-[6px] text-[11px] font-bold transition-colors ${
                  viewMode === mode.value
                    ? "bg-white text-[#16343f] shadow-[0px_1px_3px_rgba(22,52,63,0.1)]"
                    : "text-[#607078] hover:text-[#172126]"
                }`}
                style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge label={`Almacén: ${activeWarehouseName}`} color="blue" />
        <Badge label={`Año: ${filters.year}`} color="gray" />
        <Badge label={`Vista: ${viewMode === "cajas" ? "Cajas" : "Tarimas"}`} color="green" />
        {gridData && (
          <>
            <Badge label={`Productos: ${gridData.rows.length}`} color="amber" />
            <Badge
              label={`Total ${viewMode === "cajas" ? "cajas" : "tarimas"}: ${viewMode === "cajas" ? gridData.grandTotalCajas : gridData.grandTotalTarimas}`}
              color="blue"
            />
          </>
        )}
        {isLoading && <Badge label="Cargando..." color="blue" />}
        {error && <Badge label={`Error: ${error.message}`} color="red" />}
      </div>

      {/* Grid Table */}
      {gridData && (
        <div className="bg-white rounded-[12px] border border-[#dce4e7] overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 400px)" }}>
            <table className="w-full text-left sticky-header">
              <thead>
                <tr className="bg-[#f0f4f5] border-b border-[#dce4e7] sticky top-0 z-10">
                  <th
                    className="px-2 py-2 text-[10px] font-bold uppercase text-[#607078] sticky left-0 z-20 bg-[#f0f4f5]"
                    style={{ fontFamily: "'Inter',sans-serif", minWidth: 200 }}
                  >
                    Producto
                  </th>
                  {MONTH_NAMES.map((month, i) => (
                    <th
                      key={i}
                      className="px-2 py-2 text-[10px] font-bold uppercase text-[#607078] text-center sticky top-0 z-10 bg-[#f0f4f5]"
                      style={{ fontFamily: "'Inter',sans-serif", minWidth: 60 }}
                    >
                      {month}
                    </th>
                  ))}
                  <th
                    className="px-2 py-2 text-[10px] font-bold uppercase text-[#607078] text-center sticky right-0 z-20 bg-[#f0f4f5]"
                    style={{ fontFamily: "'Inter',sans-serif", minWidth: 80 }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {gridData.rows.map((cell) => (
                  <tr
                    key={cell.productId}
                    className="border-b border-[#f0f4f5] last:border-0 hover:bg-[#fafbfc]"
                  >
                    <td
                      className="px-2 py-1.5 sticky left-0 z-10 bg-white font-semibold text-[11px] text-[#172126] max-w-[180px] truncate"
                      style={{ fontFamily: "'Inter',sans-serif" }}
                    >
                      <div>{cell.productName}</div>
                      {cell.productSku && (
                        <div className="text-[9px] text-[#aab8be]">{cell.productSku}</div>
                      )}
                    </td>
                    {MONTH_NAMES.map((_, i) => (
                      <GridCell
                        key={i}
                        cell={cell}
                        monthIndex={i}
                        viewMode={viewMode}
                        onDrillDown={handleDrillDown}
                      />
                    ))}
                    <td
                      className="px-2 py-1.5 text-center sticky right-0 bg-white font-bold text-[11px] text-[#16343f]"
                      style={{ fontFamily: "'Inter',sans-serif" }}
                    >
                      {viewMode === "cajas" ? cell.rowTotalCajas : cell.rowTotalTarimas}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#f0f4f5] border-t-2 border-[#dce4e7] font-bold text-[10px] text-[#16343f]">
                  <td
                    className="px-2 py-2 text-right sticky left-0 z-10 bg-[#f0f4f5]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    TOTALES
                  </td>
                  {MONTH_NAMES.map((_, i) => (
                    <td
                      key={i}
                      className="px-2 py-2 text-center sticky right-0 z-10 bg-[#f0f4f5]"
                      style={{ fontFamily: "'Inter',sans-serif" }}
                    >
                      {viewMode === "cajas"
                        ? gridData.columnTotalsCajas[i]
                        : gridData.columnTotalsTarimas[i] || 0}
                    </td>
                  ))}
                  <td
                    className="px-2 py-2 text-center sticky right-0 z-20 bg-[#f0f4f5]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {viewMode === "cajas" ? gridData.grandTotalCajas : gridData.grandTotalTarimas}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!gridData && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#607078"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <p
            className="font-bold text-[#607078] text-[13px]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Sin datos para mostrar
          </p>
          <p
            className="text-[#aab8be] text-[12px] text-center px-4"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Selecciona un almacén y año, luego haz clic en Actualizar.
          </p>
        </div>
      )}

      {/* Breakdown Modal */}
      {breakdownModal && (
        <BreakdownModal breakdown={breakdownModal} onClose={() => setBreakdownModal(null)} />
      )}
    </div>
  );
}
