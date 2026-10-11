/**
 * PdfPreview - Componente reutilizable para vista previa de PDF
 */

import { useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"

// Configurar worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

interface Props {
  fileUrl: string
  fileName?: string | null
  className?: string
}

export function PdfPreview({ fileUrl, fileName, className = "" }: Props) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    async function renderFirstPage() {
      try {
        setLoading(true)
        setError(false)
        const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.5 })

        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext("2d")
        if (!context) return

        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = "100%"
        canvas.style.height = "auto"
        canvas.style.maxWidth = "100%"
        canvas.style.borderRadius = "12px"

        await page.render({ canvas, canvasContext: context, viewport }).promise

        if (!cancelled) {
          const dataUrl = canvas.toDataURL("image/png")
          setPreviewSrc(dataUrl)
        }
      } catch (err) {
        console.error("Error rendering PDF preview:", err)
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    renderFirstPage()
    return () => {
      cancelled = true
    }
  }, [fileUrl])

  if (loading) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 h-full w-full p-4 ${className}`}
      >
        <div className="w-12 h-12 border-3 border-[#3276a8] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#607078] text-[11px]">Generando vista previa...</p>
      </div>
    )
  }

  if (error || !previewSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 h-full w-full p-4 ${className}`}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3276a8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <p className="font-bold text-[#172126] text-[13px] text-center px-2">
          {fileName || "Documento PDF"}
        </p>
        <p className="text-[#607078] text-[11px] text-center">
          Vista previa no disponible · Se procesará con OCR
        </p>
      </div>
    )
  }

  return (
    <img
      src={previewSrc}
      alt={`Preview de ${fileName || "documento"}`}
      className={`${className} w-full h-auto object-cover rounded-[12px]`}
    />
  )
}
