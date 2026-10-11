import { useState, useEffect, useRef, useCallback } from "react"
import { Tarima, TarimaScanInput, TarimaStatus } from "@/types/embarque"
import { useScanner } from "@/hooks/useScanner"
import {
  escanearTarima,
  getAutoFillData,
  confirmarEmbarque,
} from "@/services/embarques"

interface ScannerTarimasProps {
  embarqueId: string
  onClose: () => void
  onTarimaEscaneada?: (tarima: Tarima) => void
  onEmbarqueCompletado?: () => void
}

export function ScannerTarimas({
  embarqueId,
  onClose,
  onTarimaEscaneada,
  onEmbarqueCompletado,
}: ScannerTarimasProps) {
  const [tarimas, setTarimas] = useState<Tarima[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [currentInput, setCurrentInput] = useState("")
  const [showResult, setShowResult] = useState<{
    tarima: Tarima
    isNew: boolean
    autoFilled: boolean
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const {
    escanear: escanearHook,
    scanning: hookLoading,
    error: hookError,
    autoFillData,
    limpiar: clearError,
  } = useScanner(embarqueId)

  useEffect(() => {
    cargarTarimas()
    iniciarCamara()

    return () => {
      detenerCamara()
    }
  }, [embarqueId])

  const cargarTarimas = async () => {
    setLoading(true)
    setError(null)
    try {
      // En producción: fetch desde Firestore
      // const tarimas = await getTarimas(embarqueId);
      // setTarimas(tarimas);

      // Mock para desarrollo
      setTarimas([])
    } catch (err) {
      setError("Error cargando tarimas")
    } finally {
      setLoading(false)
    }
  }

  const iniciarCamara = async () => {
    if (!videoRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    } catch (err) {
      console.warn("No se pudo acceder a la cámara:", err)
      // Fallback a input manual
    }
  }

  const detenerCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const handleScan = useCallback(
    async (qrCode: string) => {
      if (scanning) return

      setScanning(true)
      setError(null)
      clearError()

      try {
        // Parsear QR: embarqueId|tarimaIndex
        const [qrEmbarqueId, tarimaIndexStr] = qrCode.split("|")
        const tarimaIndex = parseInt(tarimaIndexStr, 10)

        if (qrEmbarqueId !== embarqueId) {
          throw new Error("QR no pertenece a este embarque")
        }

        // Buscar si ya existe
        let tarimaExistente = tarimas.find((t) => t.tarimaIndex === tarimaIndex)
        let isNew = false

        if (!tarimaExistente) {
          // Tarima nueva - obtener auto-fill
          isNew = true
          const autoFill = await getAutoFillData(embarqueId)

          // Crear tarima temporal para el formulario
          tarimaExistente = ({
            id: qrCode,
            embarqueId,
            tarimaIndex,
            status: "pending",
            fechaPedido: new Date(),
            proveedorId: "",
            proveedorNombre: "",
            productoId: "",
            productoNombre: "",
            lote: autoFill.lote,
            caducidad: autoFill.caducidad,
            createdAt: new Date(),
            lastKnownLote: autoFill.lote,
            lastKnownCaducidad: autoFill.caducidad,
          } as Tarima)
        }

        // Mostrar formulario con datos pre-llenados
        setShowResult({
          tarima: tarimaExistente,
          isNew,
          autoFilled:
            isNew && !!(tarimaExistente.lote || tarimaExistente.caducidad),
        })

        // Focus en lote si es nuevo, sino en caducidad
        setTimeout(() => {
          const focusEl = isNew
            ? document.getElementById("input-lote")
            : document.getElementById("input-caducidad")
          focusEl?.focus()
        }, 100)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error escaneando QR")
      } finally {
        setScanning(false)
      }
    },
    [embarqueId, tarimas, getAutoFillData, clearError, scanning],
  )

  const handleManualInput = (e: React.FormEvent) => {
    e.preventDefault()
    if (currentInput.trim()) {
      handleScan(currentInput.trim())
      setCurrentInput("")
    }
  }

  const handleSave = async (data: {
    lote: string
    caducidad: string
    observaciones?: string
  }) => {
    if (!showResult) return

    setScanning(true)
    setError(null)

    try {
      const input: TarimaScanInput = {
        lote: data.lote,
        caducidad: new Date(data.caducidad),
        observaciones: data.observaciones,
      }

      const tarimaActualizada = await escanearHook(showResult.tarima.id, input)
      if (!tarimaActualizada) {
        throw new Error("No se pudo actualizar la tarima")
      }

      // Actualizar lista local
      setTarimas((prev) => {
        const idx = prev.findIndex((t) => t.id === tarimaActualizada.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = tarimaActualizada
          return next
        }
        return [...prev, tarimaActualizada]
      })

      onTarimaEscaneada?.(tarimaActualizada)
      setShowResult(null)

      // Verificar si completó el embarque
      const embarqueCompleto = tarimas.length + 1 >= getTotalTarimas()
      if (embarqueCompleto) {
        await confirmarEmbarque(embarqueId)
        onEmbarqueCompletado?.()
        setTimeout(() => onClose(), 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando")
    } finally {
      setScanning(false)
    }
  }

  const handleSkip = () => {
    setShowResult(null)
    setCurrentInput("")
    inputRef.current?.focus()
  }

  const getTotalTarimas = () => {
    // En producción: desde embarque
    return tarimas.length > 0
      ? Math.max(...tarimas.map((t) => t.tarimaIndex)) + 1
      : 0
  }

  const tarimasCompletadas = tarimas.filter(
    (t) => t.status === "scanned",
  ).length
  const totalTarimas = getTotalTarimas()
  const progreso =
    totalTarimas > 0 ? (tarimasCompletadas / totalTarimas) * 100 : 0

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded"
            disabled={scanning}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold">Escanear Tarimas</h1>
            <p className="text-sm text-gray-500">Embarque: {embarqueId}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 text-right min-w-[150px]">
          <div className="text-sm text-gray-600">
            {tarimasCompletadas} / {totalTarimas} tarimas
          </div>
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Scanner area */}
        <div className="mb-6">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            {videoRef.current && (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-3/4 border-2 border-blue-500 rounded-lg relative">
                <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-blue-500 rounded-tl-lg" />
                <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-blue-500 rounded-tr-lg" />
                <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-blue-500 rounded-bl-lg" />
                <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-blue-500 rounded-br-lg" />
              </div>
            </div>
            {!videoRef.current && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                <svg
                  className="w-16 h-16 mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <p className="text-center">Cámara no disponible</p>
                <p className="text-sm opacity-75">Use el input manual abajo</p>
              </div>
            )}
          </div>
        </div>

        {/* Input manual QR */}
        <form onSubmit={handleManualInput} className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Escanear o ingresar QR manualmente
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              placeholder="Ej: EMB-001|0"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
              disabled={scanning}
              autoFocus
            />
            <button
              type="submit"
              disabled={scanning || !currentInput.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {scanning ? "Procesando..." : "Escanear"}
            </button>
          </div>
        </form>

        {/* Resultado / Formulario captura */}
        {showResult && (
          <TarimaForm
            tarima={showResult.tarima}
            isNew={showResult.isNew}
            autoFilled={showResult.autoFilled}
            onSave={handleSave}
            onSkip={handleSkip}
            loading={scanning}
          />
        )}

        {/* Lista tarimas escaneadas */}
        {tarimas.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Tarimas procesadas</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tarimas
                .sort((a, b) => a.tarimaIndex - b.tarimaIndex)
                .map((tarima) => (
                  <div
                    key={tarima.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      tarima.status === "scanned"
                        ? "bg-green-50 border border-green-200"
                        : "bg-gray-50 border border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          tarima.status === "scanned"
                            ? "bg-green-500 text-white"
                            : "bg-gray-300 text-gray-600"
                        }`}
                      >
                        {tarima.tarimaIndex + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">
                          Tarima {tarima.tarimaIndex + 1}
                        </p>
                        {tarima.status === "scanned" && (
                          <p className="text-xs text-gray-500">
                            Lote: {tarima.lote} · Cad:{" "}
                            {tarima.caducidad
                              ? new Date(tarima.caducidad).toLocaleDateString()
                              : "-"}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        tarima.status === "scanned"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {tarima.status === "scanned" ? "Escaneada" : "Pendiente"}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tarimas.length === 0 && !showResult && (
          <div className="text-center py-12 text-gray-500">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p>No hay tarimas registradas aún</p>
            <p className="text-sm mt-1">Escanee el primer QR para comenzar</p>
          </div>
        )}
      </main>
    </div>
  )
}

// Sub-componente: Formulario captura tarima
function TarimaForm({
  tarima,
  isNew,
  autoFilled,
  onSave,
  onSkip,
  loading,
}: {
  tarima: Tarima
  isNew: boolean
  autoFilled: boolean
  onSave: (data: {
    lote: string
    caducidad: string
    observaciones?: string
  }) => void
  onSkip: () => void
  loading: boolean
}) {
  const [lote, setLote] = useState(tarima.lote || "")
  const [caducidad, setCaducidad] = useState(
    tarima.caducidad
      ? new Date(tarima.caducidad).toISOString().split("T")[0]
      : "",
  )
  const [observaciones, setObservaciones] = useState(tarima.observaciones || "")

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">
            Tarima {tarima.tarimaIndex + 1} {isNew ? "(Nueva)" : ""}
          </h3>
          {autoFilled && (
            <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded ml-2">
              Auto-llenado
            </span>
          )}
        </div>
        <button onClick={onSkip} className="text-gray-500 hover:text-gray-700">
          ×
        </button>
      </div>

      {/* Datos del pedido (solo lectura) */}
      <div className="bg-white rounded-lg p-3 mb-4 border border-gray-200 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">Producto:</span>{" "}
            <span className="font-medium ml-1">{tarima.productoNombre}</span>
          </div>
          <div>
            <span className="text-gray-500">Código:</span>{" "}
            <span className="font-medium ml-1">{tarima.productoId}</span>
          </div>
          <div>
            <span className="text-gray-500">Folio:</span>{" "}
            <span className="font-medium ml-1">{tarima.embarqueId}</span>
          </div>
          <div>
            <span className="text-gray-500">Proveedor:</span>{" "}
            <span className="font-medium ml-1">{tarima.proveedorNombre}</span>
          </div>
        </div>
      </div>

      {/* Captura datos */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lote *
          </label>
          <input
            id="input-lote"
            type="text"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            placeholder="Ej: LOTE-2026-045"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha caducidad *
          </label>
          <input
            id="input-caducidad"
            type="date"
            value={caducidad}
            onChange={(e) => setCaducidad(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observaciones
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-4 pt-4 border-t border-blue-200">
        <button
          onClick={onSkip}
          className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          disabled={loading}
        >
          Saltar
        </button>
        <button
          onClick={() => onSave({ lote, caducidad, observaciones })}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          disabled={loading || !lote.trim() || !caducidad}
        >
          {loading ? "Guardando..." : "Guardar y continuar"}
        </button>
      </div>
    </div>
  )
}

// CSS animation
const style = document.createElement("style")
style.textContent = `
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-up { animation: slide-up 0.3s ease-out; }
`
if (typeof document !== "undefined") document.head.appendChild(style)
