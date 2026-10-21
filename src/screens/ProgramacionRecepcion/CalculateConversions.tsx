/**
 * Paso 5: Calcular conversiones y stickers
 */

import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Package,
  Calculator,
} from "lucide-react";
import { TouchTarget } from "@/components/ui/TouchTarget";

interface Props {
  conversions: any[];
  tarimasTotal: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function CalculateConversions({ conversions, tarimasTotal, onPrev, onNext }: Props) {
  const totalStickers = conversions.reduce((sum, c) => sum + c.stickers, 0);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#16343f] mb-2 flex items-center gap-2">
          <Calculator className="w-8 h-8" />
          Conversiones y Stickers
        </h2>
        <p className="text-[#607078]">
          Cada tarima genera 4 stickers (2 caras × 2 copias). Verifica los cálculos antes de
          continuar.
        </p>
      </div>

      {conversions.length === 0 ? (
        <div className="text-center py-12 bg-[#f8fafb] border border-[#dce4e7] rounded-[16px]">
          <AlertCircle className="w-12 h-12 mx-auto text-[#fca5a5] mb-3" />
          <h3 className="text-lg font-medium text-[#16343f] mb-1">Sin conversiones calculadas</h3>
          <p className="text-[#607078] mb-4">No hay productos confirmados con catálogo.</p>
          <TouchTarget
            as="button"
            onClick={onPrev}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#16343f] text-white rounded-[10px] font-medium hover:bg-[#0d2630] touch-target"
          >
            <ChevronLeft className="w-5 h-5" /> Volver a coincidir
          </TouchTarget>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Package className="w-6 h-6" />}
              label="Productos"
              value={conversions.length}
              color="bg-[#3276a8]/10 text-[#3276a8]"
            />
            <StatCard
              icon={<Package className="w-6 h-6" />}
              label="Tarimas"
              value={tarimasTotal}
              color="bg-[#16343f]/10 text-[#16343f]"
            />
            <StatCard
              icon={<CheckCircle className="w-6 h-6" />}
              label="Stickers"
              value={totalStickers}
              color="bg-[#059669]/10 text-[#059669]"
            />
            <StatCard
              icon={<AlertCircle className="w-6 h-6" />}
              label="Sin conversión"
              value={conversions.filter((c) => !c.conversionMatch).length}
              color="bg-[#fca5a5]/10 text-[#fca5a5]"
            />
          </div>

          {/* Tabla de conversiones */}
          <div className="overflow-x-auto rounded-[12px] border border-[#dce4e7] mb-6">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f8fa] border-b border-[#dce4e7]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[#607078]">Producto</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Cajas</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Cajas/Tarima</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Tarimas</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Stickers</th>
                  <th className="px-4 py-3 text-center font-medium text-[#607078]">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c, idx) => (
                  <tr key={idx} className="border-b border-[#dce4e7] hover:bg-[#f8fafb]">
                    <td className="px-4 py-3 text-[#16343f] font-medium">{c.producto}</td>
                    <td className="px-4 py-3 text-right text-[#16343f] font-mono">
                      {c.cajas?.toLocaleString() || 0}
                    </td>
                    <td className="px-4 py-3 text-right text-[#607078] font-mono">
                      {c.cajasPorTarima}
                    </td>
                    <td className="px-4 py-3 text-right text-[#16343f] font-bold font-mono">
                      {c.tarimas}
                    </td>
                    <td className="px-4 py-3 text-right text-[#059669] font-bold font-mono">
                      {c.stickers}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          c.conversionMatch
                            ? "bg-[#dcfce7] text-[#166534]"
                            : "bg-[#fef3c7] text-[#92400e]"
                        }`}
                      >
                        {c.conversionMatch ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {c.conversionMatch ? "Encontrada" : "Default (10)"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Aviso si hay productos sin conversión */}
          {conversions.some((c) => !c.conversionMatch) && (
            <div className="bg-[#fffbeb] border border-[#fcd34d] rounded-[12px] p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="text-[#f59e0b] text-xl mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-[#92400e] mb-1">
                  Algunos productos usan conversión por defecto (10 cajas/tarima)
                </p>
                <p className="text-sm text-[#92400e]">
                  Agrega la conversión real en el catálogo para cálculos precisos.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-4 border-t border-[#dce4e7]">
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
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`p-4 rounded-[12px] border border-[#dce4e7] ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/50">
          {icon}
        </div>
      </div>
      <p className="text-2xl md:text-3xl font-bold">{value}</p>
    </div>
  );
}
