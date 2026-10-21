/**
 * Paso 3: Resultados OCR
 */

import {
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { TouchTarget } from "@/components/ui/TouchTarget";
import { PdfPreview } from "@/components/PdfPreview";

interface Props {
  state: any;
  onPrev: () => void;
  onNext: () => void;
  ocrLoading: boolean;
  ocrError: string | null;
}

export default function OcrResults({ state, onPrev, onNext, ocrLoading, ocrError }: Props) {
  const productos = state.productos || [];

  if (ocrLoading) {
    return (
      <div className="p-8 md:p-12 max-w-3xl mx-auto text-center">
        <Loader2 className="w-12 h-12 mx-auto animate-spin text-[#16343f] mb-4" />
        <h3 className="text-xl font-bold text-[#16343f]">Procesando OCR...</h3>
        <p className="text-[#607078] mt-2">Extrayendo productos de la orden de compra</p>
      </div>
    );
  }

  if (ocrError || productos.length === 0) {
    return (
      <div className="p-8 md:p-12 max-w-3xl mx-auto text-center">
        <AlertCircle className="w-16 h-16 mx-auto text-[#fca5a5] mb-4" />
        <h3 className="text-xl font-bold text-[#16343f] mb-2">No se detectaron productos</h3>
        <p className="text-[#607078] mb-6">
          Intenta con una imagen más clara o un PDF con texto seleccionable
        </p>
        <TouchTarget
          as="button"
          onClick={onPrev}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#16343f] text-white rounded-[10px] font-medium hover:bg-[#0d2630] touch-target"
        >
          <ChevronLeft className="w-5 h-5" /> Volver a subir
        </TouchTarget>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#16343f]">Productos detectados</h2>
          <p className="text-[#607078] mt-1">
            {productos.length} producto{productos.length !== 1 ? "s" : ""} encontrado
            {productos.length !== 1 ? "s" : ""}
            {state.folio && (
              <span className="ml-3 px-2 py-1 bg-[#e7f0f2] rounded-full text-sm text-[#16343f]">
                OC: {state.folio}
              </span>
            )}
          </p>
        </div>
        {state.preview?.dataUrl && (
          <PdfPreview
            fileUrl={state.preview.dataUrl}
            fileName={`${state.folio || "OC"}-preview.pdf`}
            className="w-20 h-28"
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-[#dce4e7]">
        <table className="w-full text-sm">
          <thead className="bg-[#f5f8fa] border-b border-[#dce4e7]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#607078]">#</th>
              <th className="px-4 py-3 text-left font-medium text-[#607078]">Código</th>
              <th className="px-4 py-3 text-left font-medium text-[#607078]">Producto</th>
              <th className="px-4 py-3 text-right font-medium text-[#607078]">Cant.</th>
              <th className="px-4 py-3 text-right font-medium text-[#607078]">Unidad</th>
              <th className="px-4 py-3 text-right font-medium text-[#607078]">Precio</th>
              <th className="px-4 py-3 text-right font-medium text-[#607078]">Importe</th>
              <th className="px-4 py-3 text-center font-medium text-[#607078]">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p: any, idx: number) => (
              <tr key={idx} className="border-b border-[#dce4e7] hover:bg-[#f8fafb]">
                <td className="px-4 py-3 text-[#607078]">{p.linea || idx + 1}</td>
                <td className="px-4 py-3 text-[#16343f] font-mono">{p.codigo || "—"}</td>
                <td className="px-4 py-3 text-[#16343f] max-w-xs truncate">{p.nombre}</td>
                <td className="px-4 py-3 text-right text-[#16343f] font-mono">
                  {p.cantidad?.toLocaleString() || 0}
                </td>
                <td className="px-4 py-3 text-right text-[#607078]">{p.unidad || "cajas"}</td>
                <td className="px-4 py-3 text-right text-[#16343f] font-mono">
                  ${p.precio?.toFixed(2) || "0.00"}
                </td>
                <td className="px-4 py-3 text-right text-[#16343f] font-bold font-mono">
                  ${p.importe?.toFixed(2) || "0.00"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      (p.confianza || 1) >= 0.9
                        ? "bg-[#dcfce7] text-[#166534]"
                        : (p.confianza || 1) >= 0.7
                          ? "bg-[#fef3c7] text-[#92400e]"
                          : "bg-[#fee2e2] text-[#991b1b]"
                    }`}
                  >
                    {(p.confianza || 1) >= 0.9 && <CheckCircle className="w-3 h-3" />}
                    {(p.confianza || 1) * 100}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.folio && (
        <div className="mt-6 p-4 bg-[#f0f4f5] rounded-[12px]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[#607078]">Folio:</span>{" "}
              <span className="font-medium text-[#16343f] ml-2">{state.folio}</span>
            </div>
            <div>
              <span className="text-[#607078]">Fecha:</span>{" "}
              <span className="font-medium text-[#16343f] ml-2">{state.fecha || "—"}</span>
            </div>
            <div>
              <span className="text-[#607078]">Proveedor:</span>{" "}
              <span className="font-medium text-[#16343f] ml-2">{state.proveedor || "—"}</span>
            </div>
            <div>
              <span className="text-[#607078]">Total:</span>{" "}
              <span className="font-bold text-[#16343f] ml-2">${state.total || "0.00"}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 pt-6 border-t border-[#dce4e7]">
        <TouchTarget
          as="button"
          onClick={onPrev}
          className="flex-1 py-4 rounded-[12px] font-bold text-lg bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f0f4f5] touch-target"
        >
          <ChevronLeft className="inline w-5 h-5 mr-2" /> Volver
        </TouchTarget>
        <TouchTarget
          as="button"
          onClick={onNext}
          className="flex-1 py-4 rounded-[12px] font-bold text-lg bg-[#16343f] text-white hover:bg-[#0d2630] touch-target"
        >
          Continuar <ChevronRight className="inline w-5 h-5 ml-2" />
        </TouchTarget>
      </div>
    </div>
  );
}
