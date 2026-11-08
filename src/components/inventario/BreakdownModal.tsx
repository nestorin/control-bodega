/**
 * BreakdownModal — Drill-down modal for inventory grid cell
 */

import type { ReceptionBreakdown } from "@/types/csvImport";

interface BreakdownModalProps {
  breakdown: ReceptionBreakdown;
  onClose: () => void;
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

export function BreakdownModal({ breakdown, onClose }: BreakdownModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22,52,63,0.35)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="breakdown-title"
    >
      <div className="bg-white rounded-[20px] shadow-[0px_20px_60px_rgba(22,52,63,0.25)] w-full max-w-[800px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 lg:px-6 py-4 border-b border-[#dce4e7] shrink-0">
          <p
            id="breakdown-title"
            className="font-black text-[#172126] text-[16px] lg:text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            Desglose: {breakdown.productName} - {MONTH_NAMES[breakdown.month - 1]} {breakdown.year}
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-9 lg:size-8 rounded-[8px] hover:bg-[#f4f7f8] transition-colors text-[#607078] touch-target"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 lg:px-6 py-5">
          <div className="space-y-3">
            {/* Summary */}
            <div className="bg-[#f0f4f5] rounded-[12px] p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase text-[#607078] mb-1"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    Total Cajas
                  </p>
                  <p
                    className="font-bold text-[#172126] text-[18px]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {breakdown.totalCajas}
                  </p>
                </div>
                <div>
                  <p
                    className="text-[10px] font-bold uppercase text-[#607078] mb-1"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    Total Tarimas
                  </p>
                  <p
                    className="font-bold text-[#172126] text-[18px]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {breakdown.totalTarimas}
                  </p>
                </div>
              </div>
            </div>

            {/* Receptions list */}
            {breakdown.receptions.length > 0 ? (
              <div>
                <p
                  className="font-bold text-[#172126] text-[13px] mb-3"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  Recepciones ({breakdown.receptions.length})
                </p>
                <div className="bg-white border border-[#dce4e7] rounded-[12px] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[#f0f4f5] border-b border-[#dce4e7]">
                          <th
                            className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]"
                            style={{ fontFamily: "'Inter',sans-serif" }}
                          >
                            Fecha
                          </th>
                          <th
                            className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]"
                            style={{ fontFamily: "'Inter',sans-serif" }}
                          >
                            Folio
                          </th>
                          <th
                            className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]"
                            style={{ fontFamily: "'Inter',sans-serif" }}
                          >
                            Proveedor
                          </th>
                          <th
                            className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078] text-center"
                            style={{ fontFamily: "'Inter',sans-serif" }}
                          >
                            Cajas
                          </th>
                          <th
                            className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078] text-center"
                            style={{ fontFamily: "'Inter',sans-serif" }}
                          >
                            Tarimas
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.receptions.map((r, i) => (
                          <tr
                            key={i}
                            className="border-b border-[#f0f4f5] last:border-0 hover:bg-[#fafbfc]"
                          >
                            <td
                              className="px-3 py-2 text-[12px] text-[#172126]"
                              style={{ fontFamily: "'Inter',sans-serif" }}
                            >
                              {r.fecha.toLocaleDateString("es-MX")}
                            </td>
                            <td
                              className="px-3 py-2 text-[12px] text-[#172126] font-mono"
                              style={{ fontFamily: "'Inter',sans-serif" }}
                            >
                              {r.folio}
                            </td>
                            <td
                              className="px-3 py-2 text-[12px] text-[#172126]"
                              style={{ fontFamily: "'Inter',sans-serif" }}
                            >
                              {r.proveedor}
                            </td>
                            <td
                              className="px-3 py-2 text-[12px] text-[#172126] text-center font-bold"
                              style={{ fontFamily: "'Inter',sans-serif" }}
                            >
                              {r.cajas}
                            </td>
                            <td
                              className="px-3 py-2 text-[12px] text-[#172126] text-center font-bold"
                              style={{ fontFamily: "'Inter',sans-serif" }}
                            >
                              {r.tarimas}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="text-center py-8 text-[#607078]"
                style={{ fontFamily: "'Inter',sans-serif" }}
              >
                Sin recepciones en este período
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
