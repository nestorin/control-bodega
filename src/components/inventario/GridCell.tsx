/**
 * GridCell — Clickable cell with drill-down for Inventory Grid
 */

import { useState } from "react";
import type { GridCell as GridCellType, ReceptionBreakdown } from "@/types/csvImport";
import { Badge } from "@/components/configuracion/Badge";

interface GridCellProps {
  cell: GridCellType;
  monthIndex: number; // 0-11
  viewMode: "cajas" | "tarimas";
  onDrillDown: (breakdown: ReceptionBreakdown) => void;
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function GridCell({ cell, monthIndex, viewMode, onDrillDown }: GridCellProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const value =
    viewMode === "cajas" ? cell.monthlyCajas[monthIndex] : cell.monthlyTarimas[monthIndex];
  const hasBreakdown = cell.hasBreakdown && cell.breakdown;

  if (value === 0 && !hasBreakdown) {
    return (
      <td
        className="px-2 py-1 text-center text-[#aab8be] text-[11px]"
        style={{ fontFamily: "'Inter',sans-serif" }}
      >
        —
      </td>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasBreakdown && cell.breakdown) {
      onDrillDown(cell.breakdown);
    }
    setShowBreakdown((prev) => !prev);
  };

  return (
    <td
      className={`px-2 py-1 text-center cursor-pointer transition-colors ${hasBreakdown ? "hover:bg-[#e8eef6]" : ""}`}
      onClick={handleClick}
      style={{ minWidth: 60, fontFamily: "'Inter',sans-serif" }}
    >
      <div className="font-bold text-[11px] text-[#172126]">{value}</div>
      {hasBreakdown && (
        <Badge label={`${cell.breakdown!.receptions.length} recepciones`} color="blue" />
      )}
      {showBreakdown && cell.breakdown && (
        <div className="fixed z-50 mt-1 ml-2 w-64 bg-white border border-[#dce4e7] rounded-[8px] shadow-[0px_8px_24px_rgba(22,52,63,0.15)] p-2 text-left">
          <div
            className="font-bold text-[11px] text-[#172126] mb-1"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Desglose: {cell.productName} - {MONTH_NAMES[monthIndex]}
          </div>
          {cell.breakdown.receptions.map((r, i) => (
            <div
              key={i}
              className="text-[10px] text-[#607078] py-0.5 border-b border-[#f0f4f5] last:border-0"
              style={{ fontFamily: "'Inter',sans-serif" }}
            >
              {r.fecha.toLocaleDateString("es-MX")} · {r.proveedor} · {r.cajas} cajas
            </div>
          ))}
          <div
            className="font-bold text-[10px] text-[#172126] mt-1 pt-1 border-t border-[#f0f4f5]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Total: {cell.breakdown.totalCajas} cajas
          </div>
        </div>
      )}
    </td>
  );
}
