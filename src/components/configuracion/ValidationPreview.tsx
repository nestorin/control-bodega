/**
 * ValidationPreview — Expandable row details for CSV import validation
 */

import { useState } from "react";
import type { ValidationResult, CsvRow } from "@/types/csvImport";
import { Badge } from "./Badge";

interface ValidationPreviewProps {
  validation: ValidationResult;
  rowNumber: number;
}

function getRowDisplayName(data: CsvRow | undefined): string {
  if (!data) return "Sin nombre";
  // ProductCsvRow has nombre, sku
  // SupplierCsvRow has nombre
  // ConversionCsvRow has producto
  // WarehouseCsvRow has nombre
  return (data as any).nombre ?? (data as any).sku ?? (data as any).producto ?? "Sin nombre";
}

export function ValidationPreview({ validation, rowNumber }: ValidationPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  if (validation.isValid) {
    return (
      <div
        className="text-center text-[#607078] text-[12px] py-2"
        style={{ fontFamily: "'Inter',sans-serif" }}
      >
        ✓ Sin errores
      </div>
    );
  }

  const errorCount = validation.errors.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge label={`${errorCount} error${errorCount > 1 ? "es" : ""}`} color="amber" />
        <span className="text-[12px] text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>
          Fila {rowNumber} · {getRowDisplayName(validation.data)}
        </span>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[#3276a8] text-[11px] font-bold hover:underline"
        style={{ fontFamily: "'Inter',sans-serif" }}
      >
        {expanded ? "▲" : "▼"} Ver detalles
      </button>

      {expanded && (
        <div
          className="bg-[#fef8e6] border border-[#f2b84b] rounded-[8px] p-3 text-[11px] space-y-1"
          style={{ fontFamily: "'Inter',sans-serif" }}
        >
          {validation.errors.map((err, i) => (
            <div key={i} className="flex gap-2">
              <Badge label={err.code} color="amber" className="shrink-0" />
              <span className="text-[#7a5c00]">{err.message}</span>
              {err.column && <span className="text-[#607078]">(col: {err.column})</span>}
            </div>
          ))}
          <details className="mt-2">
            <summary className="text-[#607078] cursor-pointer">Datos crudos de la fila</summary>
            <pre
              className="mt-1 p-2 bg-white rounded text-[10px] overflow-auto max-h-32"
              style={{ fontFamily: "monospace" }}
            >
              {JSON.stringify(validation.data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
