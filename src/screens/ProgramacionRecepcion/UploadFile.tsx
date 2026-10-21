/**
 * Paso 2: Subir archivo (PDF/Imagen)
 */

import {
  FileText,
  Image,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { TouchTarget } from "@/components/ui/TouchTarget"

interface Props {
  state: any
  onUpload: (file: File) => Promise<void>
  onRunOCR: () => Promise<void>
  onPrev: () => void
  ocrLoading: boolean
  ocrError: string | null
}

export default function UploadFile({
  state,
  onUpload,
  onRunOCR,
  onPrev,
  ocrLoading,
  ocrError,
}: Props) {
  const isPdf = state.fileType === "application/pdf"
  const file = state.file

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-[#16343f] mb-2">
          {state.hasOC ? "Subir Orden de Compra" : "Subir Factura"}
        </h2>
        <p className="text-[#607078]">
          {state.hasOC
            ? "Carga el PDF o imagen de la OC para extraer datos automáticamente"
            : "Sube una foto o PDF de la factura"}
        </p>
      </div>

      <div className="space-y-6">
        {!file ? (
          // Dropzone
          <div
            className={`border-2 border-dashed rounded-[16px] p-8 md:p-12 text-center transition-all ${
              isPdf
                ? "border-[#3276a8] bg-[#e7f0f2]"
                : "border-[#dce4e7] hover:border-[#3276a8]"
            }`}
          >
            <div
              className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
                isPdf ? "bg-[#3276a8]/10" : "bg-[#e7f0f2]"
              }`}
            >
              {isPdf ? (
                <FileText className="w-10 h-10 text-[#3276a8]" />
              ) : (
                <Image className="w-10 h-10 text-[#16343f]" />
              )}
            </div>
            <p className="text-lg font-medium text-[#16343f] mb-2">
              {isPdf ? "PDF detectado" : "Arrastra tu archivo aquí"}
            </p>
            <p className="text-[#607078] mb-6">
              {isPdf
                ? "El PDF se procesará automáticamente"
                : "PDF o imagen (JPG/PNG), máx 10MB"}
            </p>
            <input
              type="file"
              accept={state.hasOC ? ".pdf,image/*" : ".pdf,image/*"}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onUpload(f)
              }}
              className="sr-only"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <TouchTarget
                as="button"
                type="button"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#16343f] text-white rounded-[10px] font-medium hover:bg-[#0d2630] transition-colors touch-target"
              >
                <Loader2 className="w-5 h-5" />
                Seleccionar archivo
              </TouchTarget>
            </label>
          </div>
        ) : (
          // File selected preview
          <div className="bg-[#f8fafb] border border-[#dce4e7] rounded-[16px] p-6">
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-[12px] flex items-center justify-center ${
                  isPdf ? "bg-[#3276a8]/10" : "bg-[#e7f0f2]"
                }`}
              >
                {isPdf ? (
                  <FileText className="w-8 h-8 text-[#3276a8]" />
                ) : (
                  <Image className="w-8 h-8 text-[#16343f]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#16343f] truncate">
                  {file.name}
                </p>
                <p className="text-sm text-[#607078]">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <TouchTarget
                as="button"
                onClick={() => onUpload(new File([], ""))}
                // trigger re-upload
                className="p-2 text-[#607078] hover:text-[#ef4444] hover:bg-[#fee2e2] rounded-lg transition-colors"
                aria-label="Cambiar archivo"
              >
                ✕
              </TouchTarget>
            </div>
          </div>
        )}

        {ocrError && (
          <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-[12px] p-4 flex items-center gap-3">
            <span className="text-[#ef4444] text-xl">⚠</span>
            <p className="text-[#991b1b] flex-1">{ocrError}</p>
          </div>
        )}

        <div className="flex gap-4 pt-4 border-t border-[#dce4e7]">
          <TouchTarget
            as="button"
            onClick={onPrev}
            className="flex-1 py-4 rounded-[12px] font-bold text-lg bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f0f4f5] transition-colors touch-target"
          >
            <ChevronLeft className="inline w-5 h-5 mr-2" /> Volver
          </TouchTarget>
          <TouchTarget
            as="button"
            onClick={onRunOCR}
            disabled={!file || ocrLoading}
            className={`flex-1 py-4 rounded-[12px] font-bold text-lg transition-colors touch-target ${
              file && !ocrLoading
                ? "bg-[#16343f] text-white hover:bg-[#0d2630]"
                : "bg-[#dce4e7] text-[#607078] cursor-not-allowed"
            }`}
          >
            {ocrLoading ? (
              <>
                <Loader2 className="inline w-5 h-5 mr-2 animate-spin" />
                Procesando OCR...
              </>
            ) : (
              <>
                Procesar OCR <ChevronRight className="inline w-5 h-5 ml-2" />
              </>
            )}
          </TouchTarget>
        </div>
      </div>
    </div>
  )
}
