import { useState, useEffect, useRef } from "react";
import { PrintJob, PrintEtiquetaData } from "@/types/documento";
import { generarImpresion } from "@/services/embarques";
import { useEmbarques } from "@/hooks/useEmbarques";

interface ImprimirEtiquetasProps {
  embarqueId: string;
  onClose: () => void;
  onPrintComplete?: () => void;
}

export function ImprimirEtiquetas({
  embarqueId,
  onClose,
  onPrintComplete,
}: ImprimirEtiquetasProps) {
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printRange, setPrintRange] = useState<"all" | "range">("all");
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [copiesPerTarima, setCopiesPerTarima] = useState(4);

  const { cargarEmbarque } = useEmbarques();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    cargarPrintJob();
  }, [embarqueId]);

  const cargarPrintJob = async () => {
    setLoading(true);
    setError(null);
    try {
      const job = await generarImpresion(embarqueId);
      setPrintJob(job);
      // Inicializar range end
      if (job.etiquetas.length > 0) {
        setRangeEnd(job.etiquetas.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar impresión");
    } finally {
      setLoading(false);
    }
  };

  const etiquetasFiltradas =
    printJob?.etiquetas.filter((e) => {
      if (printRange === "all") return true;
      return e.tarimaNumero >= rangeStart && e.tarimaNumero <= rangeEnd;
    }) ?? [];

  const totalStickers = etiquetasFiltradas.reduce((sum, e) => sum + copiesPerTarima, 0);

  const handlePrint = () => {
    if (!iframeRef.current || !printJob) return;

    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) return;

    // Generar HTML para impresión
    const html = generarHTMLImpresion(etiquetasFiltradas, copiesPerTarima);
    doc.open();
    doc.write(html);
    doc.close();

    // Esperar a que cargue e imprimir
    iframeRef.current.onload = () => {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
      onPrintComplete?.();
    };
  };

  const handleDownloadPDF = () => {
    if (!printJob) return;

    const html = generarHTMLImpresion(etiquetasFiltradas, copiesPerTarima);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etiquetas-${embarqueId}-${new Date().toISOString().split("T")[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50 p-4">
        <div className="text-red-600 mb-4">{error}</div>
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Imprimir Etiquetas</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {etiquetasFiltradas.length} tarimas · {totalStickers} stickers
          </span>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
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
      </div>

      {/* Controles */}
      <div className="p-4 space-y-4">
        {/* Resumen embarque */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Embarque</p>
              <p className="font-medium">{embarqueId}</p>
            </div>
            <div>
              <p className="text-gray-500">Folio Pedido</p>
              <p className="font-medium">{printJob?.etiquetas[0]?.folioPedido ?? "-"}</p>
            </div>
            <div>
              <p className="text-gray-500">Producto</p>
              <p className="font-medium">{printJob?.etiquetas[0]?.productoNombre ?? "-"}</p>
            </div>
            <div>
              <p className="text-gray-500">Total Tarimas</p>
              <p className="font-medium">{printJob?.etiquetas.length ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Opciones de impresión */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Rango de impresión</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="printRange"
                  value="all"
                  checked={printRange === "all"}
                  onChange={() => setPrintRange("all")}
                  className="text-blue-600"
                />
                Todas las tarimas
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="printRange"
                  value="range"
                  checked={printRange === "range"}
                  onChange={() => setPrintRange("range")}
                  className="text-blue-600"
                />
                Rango:
              </label>
            </div>
          </div>

          {printRange === "range" && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Desde tarima</label>
                <input
                  type="number"
                  min={1}
                  max={printJob?.etiquetas.length ?? 1}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Math.min(parseInt(e.target.value) || 1, rangeEnd))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Hasta tarima</label>
                <input
                  type="number"
                  min={1}
                  max={printJob?.etiquetas.length ?? 1}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Math.max(parseInt(e.target.value) || 1, rangeStart))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Copias por tarima (stickers por lado × 2 caras)
            </label>
            <select
              value={copiesPerTarima}
              onChange={(e) => setCopiesPerTarima(parseInt(e.target.value))}
              className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={2}>2 (1 por cara)</option>
              <option value={4}>4 (2 por cara) - Estándar</option>
              <option value={6}>6 (3 por cara)</option>
              <option value={8}>8 (4 por cara)</option>
            </select>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-4">
          <label className="block text-sm font-medium mb-2">Vista previa (primera etiqueta)</label>
          <div className="border border-gray-300 rounded p-4 bg-white max-w-xs mx-auto">
            {etiquetasFiltradas[0] && <EtiquetaPreview etiqueta={etiquetasFiltradas[0]} />}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDownloadPDF}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
          >
            <svg
              className="w-5 h-5 inline mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Descargar HTML
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            <svg
              className="w-5 h-5 inline mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Imprimir
          </button>
        </div>
      </div>

      {/* Iframe oculto para impresión */}
      <iframe ref={iframeRef} className="hidden" title="Print frame" />
    </div>
  );
}

function EtiquetaPreview({ etiqueta }: { etiqueta: PrintEtiquetaData }) {
  return (
    <div className="font-mono text-xs space-y-1" style={{ width: "100px", fontSize: "10px" }}>
      <div
        className="border-2 border-black p-2 mb-2 flex items-center justify-center"
        style={{ height: "60px" }}
      >
        <span className="text-[8px]">QR: {etiqueta.qr}</span>
      </div>
      <div className="text-center font-bold">{etiqueta.productoNombre}</div>
      <div className="text-center">Cód: {etiqueta.productoCodigo}</div>
      <div className="text-center">Pedido: {etiqueta.folioPedido}</div>
      <div className="text-center">Tarima: {etiqueta.tarimaNumero}</div>
      <div className="text-center text-[8px] border-t border-gray-300 pt-1">
        4 stickers por tarima (2 caras)
      </div>
    </div>
  );
}

function generarHTMLImpresion(etiquetas: PrintEtiquetaData[], copies: number): string {
  const etiquetasHTML = etiquetas
    .flatMap((etiqueta) =>
      Array(copies)
        .fill(null)
        .map(
          (_, i) => `
      <div class="etiqueta" style="page-break-inside: avoid;">
        <div class="qr-placeholder">
          <div class="qr-code">${etiqueta.qr}</div>
        </div>
        <div class="info">
          <div class="producto">${etiqueta.productoNombre}</div>
          <div class="codigo">Cód: ${etiqueta.productoCodigo}</div>
          <div class="folio">Pedido: ${etiqueta.folioPedido}</div>
          <div class="tarima">Tarima: ${etiqueta.tarimaNumero} · Sticker ${i + 1}/${copies}</div>
        </div>
      </div>
    `,
        )
        .join(""),
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Etiquetas - ${etiquetas[0]?.folioPedido}</title>
      <style>
        @page { margin: 0; size: 100mm 150mm; }
        body { margin: 0; padding: 5mm; font-family: monospace; font-size: 10px; }
        .etiqueta { 
          width: 90mm; height: 130mm; 
          border: 1px solid #000; 
          padding: 3mm; 
          box-sizing: border-box;
          display: inline-block;
          margin: 2mm;
          page-break-inside: avoid;
        }
        .qr-placeholder { 
          width: 100%; height: 60mm; 
          border: 2px solid #000; 
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 3mm;
          font-size: 8px;
          word-break: break-all;
        }
        .qr-code { font-family: monospace; font-size: 7px; line-height: 1.2; }
        .info { text-align: center; }
        .producto { font-weight: bold; font-size: 12px; margin-bottom: 2mm; }
        .codigo { font-size: 9px; margin-bottom: 1mm; }
        .folio { font-size: 9px; margin-bottom: 1mm; }
        .tarima { font-size: 8px; color: #666; border-top: 1px dashed #999; padding-top: 2mm; }
        @media print {
          .no-print { display: none; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      ${etiquetasHTML}
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;
}
