import { useState, useCallback, useRef, useEffect } from "react"
import { Tarima, TarimaScanInput } from "@/types/embarque"
import { escanearTarima, getAutoFillData } from "@/services/embarques"

interface UseScannerReturn {
  // Estado
  scanning: boolean
  lastScanned: Tarima | null
  autoFillData: { lote?: string; caducidad?: Date } | null
  error: string | null

  // Acciones
  escanear: (qr: string, input: TarimaScanInput) => Promise<Tarima | null>
  cargarAutoFill: (embarqueId: string) => Promise<void>
  limpiar: () => void
}

export function useScanner(embarqueId?: string): UseScannerReturn {
  const [scanning, setScanning] = useState(false)
  const [lastScanned, setLastScanned] = useState<Tarima | null>(null)
  const [autoFillData, setAutoFillData] = useState<{
    lote?: string
    caducidad?: Date
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const autoFillCacheRef = useRef<Map<string, {
    lote?: string
    caducidad?: Date
  }>>(new Map())

  const limpiar = useCallback(() => {
    setLastScanned(null)
    setError(null)
  }, [])

  const cargarAutoFill = useCallback(async (eId: string) => {
    // Check cache first
    if (autoFillCacheRef.current.has(eId)) {
      setAutoFillData(autoFillCacheRef.current.get(eId)!)
      return
    }

    try {
      const data = await getAutoFillData(eId)
      autoFillCacheRef.current.set(eId, data)
      setAutoFillData(data)
    } catch (err) {
      console.error("Error cargando auto-fill:", err)
      setAutoFillData({})
    }
  }, [])

  const escanear = useCallback(
    async (qr: string, input: TarimaScanInput): Promise<Tarima | null> => {
      setScanning(true)
      setError(null)

      try {
        // Merge input with auto-fill data
        const mergedInput: TarimaScanInput = {
          lote: input.lote ?? autoFillData?.lote,
          caducidad: input.caducidad ?? autoFillData?.caducidad,
          observaciones: input.observaciones,
        }

        const tarima = await escanearTarima(qr, mergedInput)

        // Update auto-fill cache for this embarque
        if (tarima.embarqueId) {
          const newAutoFill = {
            lote: tarima.lote,
            caducidad: tarima.caducidad,
          }
          autoFillCacheRef.current.set(tarima.embarqueId, newAutoFill)
          setAutoFillData(newAutoFill)
        }

        setLastScanned(tarima)
        return tarima
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al escanear"
        setError(msg)
        return null
      } finally {
        setScanning(false)
      }
    },
    [autoFillData],
  )

  // Cargar auto-fill al cambiar embarqueId
  useEffect(() => {
    if (embarqueId) {
      cargarAutoFill(embarqueId)
    }
  }, [embarqueId, cargarAutoFill])

  return {
    scanning,
    lastScanned,
    autoFillData,
    error,
    escanear,
    cargarAutoFill,
    limpiar,
  }
}
