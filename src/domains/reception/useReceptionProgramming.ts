/**
 * useReceptionProgramming - Hook adaptador para Programación de Recepción
 *
 * Conecta:
 * - State Machine (receptionMachine.ts)
 * - Domain Logic (receptionDomain.ts + nuevos mappers)
 * - Firebase Services (persistence)
 * - OCR Hook (useOcr)
 *
 * Este hook es el ÚNICO que conoce React + Firebase.
 * La lógica de negocio está en receptionDomain.ts y nuevos mappers (puro TS).
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { useOcr } from "../../hooks/useOcr"
import { useAuth } from "../../context/AuthContext"
import type { ReceptionState, ReceptionStep } from "./receptionMachine"
import type {
  ReceptionLineState,
  ReceptionConversion,
  ReceptionDraft,
  ValidationResult,
  OcrProduct,
} from "@/types/domain"
import {
  getInitialState,
  getNextStep,
  RECEPCION_STEPS,
} from "./receptionMachine"
import {
  ocrProductsToMatchedProducts,
  calculateConversions,
  calculateTotalTarimas,
  buildReceptionDraft,
  validateReceptionDraft,
  CATALOGO_CONVERSIONES_DEFAULT,
} from "./receptionDomain"
import {
  ocrProductToReceptionLine,
  ocrResponseToReceptionLines,
} from "@/services/domain/ocrToReception"
import {
  validateReceptionLine,
  validateConversion,
  toPersistedProduct,
  toPersistedConversion,
} from "@/services/domain/validation"
import type { OcrResponse } from "../../services/domain/ocrMapper"
import type { Producto } from "../../services/firestore/types"
import { createFirestoreServices } from "../../services/firestore"
import { uploadInvoicePreviewWithMetadata } from "../../services/invoiceEvidence"
import { db, storage } from "../../lib/firebase"

// Reuse the app-level Firestore instance so cache configuration is applied
// exactly once before any feature module accesses Firestore.
const ORG_ID = "org_exepa_001"

export interface UseReceptionProgrammingReturn {
  // State
  state: ReceptionState
  currentStep: ReceptionStep
  steps: typeof RECEPCION_STEPS
  matchedProducts: ReceptionLineState[]
  conversions: ReceptionConversion[]
  tarimasTotal: number

  // Actions
  selectHasOC: (hasOC: boolean) => void
  handleFileUpload: (file: File) => Promise<void>
  runOCR: () => Promise<void>
  matchProducts: (catalogProducts: Producto[]) => void
  calculateConversionsAndStickers: () => void
  updateMatchedProduct: (
    index: number,
    updates: Partial<ReceptionLineState>,
  ) => void
  setWarehouseId: (id: string) => void
  setSupplierId: (id: string) => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (step: ReceptionStep) => void
  saveReception: () => Promise<string | null>
  reset: () => void

  // OCR integration
  ocrLoading: boolean
  ocrError: string | null
  ocrResult: OcrResponse | null
}

export function useReceptionProgramming(
  catalogProducts: Producto[] = [],
): UseReceptionProgrammingReturn {
  const { user } = useAuth()
  const {
    runOcr,
    loading: ocrLoading,
    result: ocrResult,
    error: ocrError,
    clear,
  } = useOcr()

  const [state, setState] = useState<ReceptionState>(getInitialState())
  const [currentStep, setCurrentStep] = useState<ReceptionStep>("select-has-oc")
  const [matchedProducts, setMatchedProducts] = useState<ReceptionLineState[]>(
    [],
  )
  const [conversions, setConversions] = useState<ReceptionConversion[]>([])
  const [saving, setSaving] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  // ===== SELECT HAS OC =====
  const selectHasOC = useCallback((hasOC: boolean) => {
    setState((prev) => ({ ...prev, hasOC }))
    setCurrentStep("upload-file")
  }, [])

  // ===== FILE UPLOAD =====
  const handleFileUpload = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file)
      previewUrlRef.current = url

      setState((prev) => ({
        ...prev,
        file,
        fileType: file.type as "application/pdf" | "image/jpeg",
        error: null,
      }))

      // Clear previous OCR
      clear()
    },
    [clear],
  )

  // ===== RUN OCR =====
  const runOCR = useCallback(async () => {
    if (!state.file) return

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      // Usar tipo "oc" para órdenes de compra, "cfdi" para facturas
      const tipo = state.hasOC ? "oc" : "cfdi"
      const ocr = await runOcr(state.file, tipo)

      if (!ocr.success || !ocr.parsed.productos.length) {
        throw new Error("OCR no detectó productos válidos")
      }

      // Convertir OCR a ReceptionLineState usando nuevo mapper
      const receptionLines = ocrResponseToReceptionLines(ocr)

      if (receptionLines.length === 0) {
        throw new Error("OCR no detectó productos válidos")
      }

      // Actualizar estado con resultados OCR
      setState((prev) => ({
        ...prev,
        folio: ocr.parsed.folio,
        fecha: ocr.parsed.fecha,
        proveedor: ocr.parsed.proveedor,
        total: ocr.parsed.total,
        productos: ocr.parsed.productos, // Guardar OcrProduct[] original para match posterior
        loading: false,
      }))

      setCurrentStep("ocr-results")
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Error en OCR",
      }))
    }
  }, [state.file, state.hasOC, runOcr, clear])

  // ===== MATCH PRODUCTS =====
  const matchProducts = useCallback(
    (catalog: Producto[]) => {
      // Convertir OcrProduct[] a ReceptionLineState[] con match contra catálogo
      const matched = ocrProductsToMatchedProducts(state.productos, catalog)
      setMatchedProducts(matched)
      setCurrentStep("match-products")
    },
    [state.productos],
  )

  // ===== CALCULATE CONVERSIONS =====
  const calculateConversionsAndStickers = useCallback(() => {
    const convs = calculateConversions(
      matchedProducts,
      CATALOGO_CONVERSIONES_DEFAULT,
    )
    const tarimasTotal = calculateTotalTarimas(convs)

    setConversions(convs)
    setState((prev) => ({ ...prev, tarimasTotal, conversiones: convs }))
    setCurrentStep("calculate-conversions")
  }, [matchedProducts])

  // ===== UPDATE MATCHED PRODUCT =====
  const updateMatchedProduct = useCallback(
    (index: number, updates: Partial<ReceptionLineState>) => {
      setMatchedProducts((prev) =>
        prev.map((p, i) => (i === index ? { ...p, ...updates } : p)),
      )
    },
    [],
  )

  // ===== SET WAREHOUSE / SUPPLIER =====
  const setWarehouseId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, warehouseId: id }))
  }, [])

  const setSupplierId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, supplierId: id }))
  }, [])

  // ===== NAVIGATION =====
  const nextStep = useCallback(() => {
    const next = getNextStep(currentStep, true)
    if (next) setCurrentStep(next)
  }, [currentStep])

  const prevStep = useCallback(() => {
    const currentIndex = RECEPCION_STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex > 0) {
      setCurrentStep(RECEPCION_STEPS[currentIndex - 1].id)
    }
  }, [currentStep])

  const goToStep = useCallback((step: ReceptionStep) => {
    setCurrentStep(step)
  }, [])

  // ===== SAVE RECEPTION =====
  const saveReception = useCallback(async (): Promise<string | null> => {
    if (!user || !db || !storage) {
      throw new Error("Firestore/Storage no disponible")
    }

    setSaving(true)

    try {
      // Build draft usando matchedProducts (ReceptionLineState[])
      const draft = buildReceptionDraft(
        {
          folio: state.folio,
          fecha: state.fecha,
          proveedor: state.proveedor,
          total: state.total,
          productos: matchedProducts,
          warehouseId: state.warehouseId,
          supplierId: state.supplierId,
          tarimasTotal: state.tarimasTotal,
          conversiones: conversions,
        },
        CATALOGO_CONVERSIONES_DEFAULT,
      )

      // Validate
      const validation = validateReceptionDraft(draft)
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "))
      }

      // Create Firestore services
      const fsServices = createFirestoreServices(db, ORG_ID)

      // Create reception in transaction
      const operationId = `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Date.now()).slice(-3)}`

      const reception = await fsServices.receptions.createReception(
        {
          status: "DRAFT",
          warehouseId: draft.warehouseId!,
          supplierId: draft.supplierId ?? undefined,
          actorUserId: user.uid,
          operationId,
        },
        draft.lineas
          .filter((l) => l.productId)
          .map((l) => {
            toPersistedProduct(l)
            return {
              productId: l.productId!,
              quantity: l.cantidad,
              unit: l.unidad ?? "cajas",
              palletsCreated: 0,
            }
          }),
        user.uid,
        operationId,
      )

      // Upload preview if exists
      if (previewUrlRef.current) {
        await uploadInvoicePreviewWithMetadata(
          storage,
          reception.id,
          previewUrlRef.current,
          (evidence) =>
            fsServices.receptions.updateReception(
              reception.id,
              {
                invoicePreviewPath: evidence.path,
                invoicePreviewUrl: evidence.url,
              },
              user.uid,
              `op-preview-${Date.now()}`,
            ),
        )
      }

      // Reset state
      setState(getInitialState())
      setMatchedProducts([])
      setConversions([])
      setCurrentStep("complete")
      previewUrlRef.current = null

      return reception.id
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err.message }))
      throw err
    } finally {
      setSaving(false)
    }
  }, [state, matchedProducts, conversions, catalogProducts, user])

  // ===== RESET =====
  const reset = useCallback(() => {
    setState(getInitialState())
    setCurrentStep("select-has-oc")
    setMatchedProducts([])
    setConversions([])
    clear()
    previewUrlRef.current = null
  }, [clear])

  return {
    state,
    currentStep,
    steps: RECEPCION_STEPS,
    matchedProducts,
    conversions,
    tarimasTotal: state.tarimasTotal,
    selectHasOC,
    handleFileUpload,
    runOCR,
    matchProducts,
    calculateConversionsAndStickers,
    updateMatchedProduct,
    setWarehouseId,
    setSupplierId,
    nextStep,
    prevStep,
    goToStep,
    saveReception,
    reset,
    ocrLoading,
    ocrError,
    ocrResult,
  }
}
