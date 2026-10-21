import { useState } from "react";
import {
  CheckCircle,
  FileText,
  Package,
  ChevronLeft,
  ChevronRight,
  Share2,
  Download,
  Loader2,
} from "lucide-react";
import { TouchTarget } from "@/components/ui/TouchTarget";
import {
  handleEnviarWhatsApp,
  type ProgramacionRecepcionData,
} from "@/services/programacionRecepcionPdf";

interface Props {
  state: any;
  receptionId: string | null;
  onPrev: () => void;
  onNew: () => void;
}

export default function CompleteStep({ state, receptionId, onPrev, onNew }: Props) {
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const buildData = (): ProgramacionRecepcionData => ({
    folio: state.folio || "",
    fechaRecepcion: state.fecha || "",
    proveedor: state.proveedor || "",
    proveedorLogistico: state.supplierId || "",
    totalTarimas: state.tarimasTotal || 0,
    productos:
      state.matchedProducts?.map((p: any) => ({
        nombre: p.nombre,
        cantidad: p.cantidad,
        tarimas: p.tarimas || Math.ceil(p.cantidad / (p.cajasPorTarima || 10)),
        conversionMatch: p.conversionMatch || false,
        codigo: p.codigo,
      })) || [],
  });

  const handleWhatsApp = async () => {
    setWhatsappLoading(true);
    try {
      await handleEnviarWhatsApp(buildData());
    } finally {
      setWhatsappLoading(false);
    }
  };

  return (
    <div className="p-8 md:p-12 max-w-2xl mx-auto text-center">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#dcfce7] flex items-center justify-center">
        <CheckCircle className="w-12 h-12 text-[#166534]" />
      </div>

      <h2 className="text-3xl md:text-4xl font-bold text-[#16343f] mb-2">¡Recepción creada!</h2>
      <p className="text-[#607078] text-lg mb-8">
        La programación de recepción se ha guardado correctamente.
      </p>

      {receptionId && (
        <div className="bg-[#f0f4f5] border border-[#dce4e7] rounded-[16px] p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-[#16343f]" />
            <div>
              <p className="text-sm text-[#607078]">ID de Recepción</p>
              <p className="font-mono text-lg text-[#16343f] break-all">{receptionId}</p>
            </div>
          </div>
          <p className="text-sm text-[#607078]">
            Usa este ID para consultar el estado en el dashboard de recepciones.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatBox icon={<FileText className="w-6 h-6" />} label="Folio" value={state.folio || "—"} />
        <StatBox
          icon={<Package className="w-6 h-6" />}
          label="Tarimas"
          value={state.tarimasTotal.toString()}
        />
        <StatBox
          icon={<Package className="w-6 h-6" />}
          label="Stickers"
          value={(state.tarimasTotal * 4).toString()}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
        <TouchTarget
          as="button"
          onClick={onNew}
          className="flex-1 sm:flex-none py-4 px-8 rounded-[12px] font-bold text-lg bg-[#16343f] text-white hover:bg-[#0d2630] transition-colors touch-target"
        >
          Nueva Recepción
        </TouchTarget>
        <TouchTarget
          as="button"
          onClick={onPrev}
          className="flex-1 sm:flex-none py-4 px-8 rounded-[12px] font-bold text-lg bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f0f4f5] transition-colors touch-target"
        >
          Volver al inicio
        </TouchTarget>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 border-t border-[#dce4e7]">
        <TouchTarget
          as="button"
          onClick={handleWhatsApp}
          disabled={whatsappLoading}
          className="flex-1 sm:flex-none py-4 px-8 rounded-[12px] font-bold text-lg bg-[#25D366] text-white hover:bg-[#1ebd5a] transition-colors touch-target flex items-center justify-center gap-2"
        >
          {whatsappLoading ? (
            <>
              <Loader2 className="inline w-5 h-5 animate-spin" />
              Generando PDF...
            </>
          ) : (
            <>
              <Share2 className="w-5 h-5" />
              Enviar por WhatsApp
            </>
          )}
        </TouchTarget>
        <TouchTarget
          as="button"
          onClick={() => handleEnviarWhatsApp(buildData()).then(() => {})}
          className="flex-1 sm:flex-none py-4 px-8 rounded-[12px] font-bold text-lg bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f0f4f5] transition-colors touch-target flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          Descargar PDF
        </TouchTarget>
      </div>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-[#dce4e7] rounded-[12px] p-4">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="w-10 h-10 rounded-lg bg-[#e7f0f2] flex items-center justify-center text-[#16343f]">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-[#16343f]">{value}</p>
      <p className="text-xs text-[#607078] mt-1">{label}</p>
    </div>
  );
}

// Need to import useState and Loader2
