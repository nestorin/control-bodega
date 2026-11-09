/**
 * ExportButtons — Export Inventory Grid to CSV/PDF
 */

import type { GridData, GridFilters } from "@/types/csvImport";

interface ExportButtonsProps {
  gridData: GridData | null;
  filters: GridFilters;
  viewMode: "cajas" | "tarimas";
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

export function ExportButtons({ gridData, filters, viewMode }: ExportButtonsProps) {
  const exportCsv = () => {
    if (!gridData) return;

    const headers = ["Producto", "SKU", ...MONTH_NAMES, "Total"];
    const rows = gridData.rows.map((cell) => {
      const values = viewMode === "cajas" ? cell.monthlyCajas : cell.monthlyTarimas;
      const total = viewMode === "cajas" ? cell.rowTotalCajas : cell.rowTotalTarimas;
      return [cell.productName, cell.productSku || "", ...values.map(String), String(total)];
    });

    // Add column totals row
    const colTotals = gridData.columnTotalsCajas;
    if (viewMode === "tarimas") {
      // Use columnTotalsTarimas if available, otherwise calculate
    }

    const csv = [headers.join(","), ...rows.map((r) => r.join(",")), ""].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `grid-${filters.warehouseId}-${filters.year}-${viewMode}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportPdf = () => {
    if (!gridData) return;

    // Use browser print for PDF generation
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const headers = ["Producto", "SKU", ...MONTH_NAMES, "Total"];
    const rows = gridData.rows.map((cell) => {
      const values = viewMode === "cajas" ? cell.monthlyCajas : cell.monthlyTarimas;
      const total = viewMode === "cajas" ? cell.rowTotalCajas : cell.rowTotalTarimas;
      return [cell.productName, cell.productSku || "", ...values.map(String), String(total)];
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Grid Inventario - ${filters.warehouseId} - ${filters.year} - ${viewMode}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; font-size: 10px; }
            th, td { border: 1px solid #ddd; padding: 4px; text-align: center; }
            th { background: #f0f4f5; font-weight: bold; }
            .header { text-align: center; margin-bottom: 20px; }
            .filters { text-align: center; margin-bottom: 10px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Inventario Grid - ${viewMode === "cajas" ? "Cajas" : "Tarimas"}</h2>
            <div class="filters">
              Almacén: ${filters.warehouseId} | Año: ${filters.year}
            </div>
          </div>
          <table>
            <thead>
              <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!gridData) {
    return (
      <div className="flex gap-2">
        <button
          disabled
          className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#aab8be] font-bold px-4 py-[9px] rounded-[9px] cursor-not-allowed touch-target"
          style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
        >
          📥 CSV
        </button>
        <button
          disabled
          className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#aab8be] font-bold px-4 py-[9px] rounded-[9px] cursor-not-allowed touch-target"
          style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
        >
          📄 PDF
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={exportCsv}
        className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
        style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
      >
        📥 CSV
      </button>
      <button
        onClick={exportPdf}
        className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
        style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
      >
        📄 PDF
      </button>
    </div>
  );
}
