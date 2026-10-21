/**
 * Paso 1: Seleccionar si tiene Orden de Compra
 */

import { ChevronRight } from "lucide-react";
import { TouchTarget } from "@/components/ui/TouchTarget";

interface Props {
  state: any;
  onSelectHasOC: (hasOC: boolean) => void;
  onNext: () => void;
}

export default function SelectHasOC({ state, onSelectHasOC, onNext }: Props) {
  const hasOC = state.hasOC;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-[#16343f] mb-2">
          ¿Tienes una orden de compra?
        </h2>
        <p className="text-[#607078] text-base md:text-lg">
          La usaremos para relacionar las tarimas y su evidencia.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <TouchTarget
          as="button"
          onClick={() => onSelectHasOC(true)}
          className={`flex flex-col items-center overflow-hidden p-6 rounded-[16px] flex-1 min-w-0 cursor-pointer transition-all ${
            hasOC === true
              ? "bg-[#16343f] shadow-lg shadow-[#16343f]/20"
              : "bg-white border-2 border-[#dce4e7] hover:bg-[#f8fafb] hover:border-[#3276a8]"
          }`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              hasOC === true ? "bg-white/20" : "bg-[#e7f0f2]"
            }`}
          >
            <svg
              className={`w-8 h-8 ${hasOC === true ? "text-white" : "text-[#16343f]"}`}
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
          <p
            className={`text-lg md:text-xl font-bold whitespace-nowrap ${
              hasOC === true ? "text-white" : "text-[#16343f]"
            }`}
          >
            {hasOC === true ? "✓ Sí, tengo OC" : "Sí, tengo OC"}
          </p>
          <p className={`text-sm mt-1 ${hasOC === true ? "text-white/80" : "text-[#607078]"}`}>
            Subir PDF/imagen de la OC
          </p>
        </TouchTarget>

        <TouchTarget
          as="button"
          onClick={() => onSelectHasOC(false)}
          className={`flex flex-col items-center overflow-hidden p-6 rounded-[16px] flex-1 min-w-0 cursor-pointer transition-all ${
            hasOC === false
              ? "bg-[#16343f] shadow-lg shadow-[#16343f]/20"
              : "bg-white border-2 border-[#dce4e7] hover:bg-[#f8fafb] hover:border-[#3276a8]"
          }`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              hasOC === false ? "bg-white/20" : "bg-[#e7f0f2]"
            }`}
          >
            <svg
              className={`w-8 h-8 ${hasOC === false ? "text-white" : "text-[#16343f]"}`}
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
          </div>
          <p
            className={`text-lg md:text-xl font-bold whitespace-nowrap ${
              hasOC === false ? "text-white" : "text-[#16343f]"
            }`}
          >
            {hasOC === false ? "✓ No tengo OC" : "No tengo OC"}
          </p>
          <p className={`text-sm mt-1 ${hasOC === false ? "text-white/80" : "text-[#607078]"}`}>
            Solo foto de la factura
          </p>
        </TouchTarget>
      </div>

      <div className="mt-8 pt-6 border-t border-[#dce4e7]">
        <TouchTarget
          as="button"
          onClick={onNext}
          disabled={hasOC === undefined}
          className={`w-full py-4 rounded-[12px] font-bold text-lg transition-all touch-target ${
            hasOC !== undefined
              ? "bg-[#16343f] text-white hover:bg-[#0d2630]"
              : "bg-[#dce4e7] text-[#607078] cursor-not-allowed"
          }`}
        >
          Continuar <ChevronRight className="inline w-5 h-5 ml-2" />
        </TouchTarget>
      </div>
    </div>
  );
}
