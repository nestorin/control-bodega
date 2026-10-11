/**
 * State Machine para Programación de Recepción
 *
 * Estados:
 * - SELECT_HAS_OC: Elegir si tiene OC
 * - UPLOAD_FILE: Subir archivo (OC o foto)
 * - OCR_RESULTS: Mostrar resultados OCR
 * - MATCH_PRODUCTS: Coincidir productos con catálogo
 * - CALCULATE_CONVERSIONS: Calcular tarimas, stickers
 * - REVIEW: Revisar datos antes de guardar
 * - COMPLETE: Recepción creada
 */

export type ReceptionStep = "select-has-oc" | "upload-file" | "ocr-results" | "match-products" | "calculate-conversions" | "review" | "complete"

import type {
  OcrProduct,
  ReceptionLineState,
  ReceptionConversion,
} from "@/types/domain"

export interface ReceptionState {
  // Input
  hasOC: boolean
  file: File | null
  fileType: "application/pdf" | "image/jpeg" | null

  // OCR data
  folio: string | null
  fecha: string | null
  proveedor: string | null
  total: string | null
  productos: OcrProduct[]

  // Matches
  warehouseId: string | null
  supplierId: string | null
  tarimasTotal: number
  conversiones: ConversionState[]

  // UI
  loading: boolean
  error: string | null
}

export type { OcrProduct, ReceptionLineState, ReceptionConversion }
export type ConversionState = ReceptionConversion

export const RECEPCION_STEPS: {
  id: ReceptionStep
  label: string
  icon?: string
}[] = [
  { id: "select-has-oc", label: "¿Tienes OC?" },
  { id: "upload-file", label: "Subir archivo" },
  { id: "ocr-results", label: "Resultados OCR" },
  { id: "match-products", label: "Coincidir productos" },
  { id: "calculate-conversions", label: "Calcular conversos" },
  { id: "review", label: "Revisar" },
  { id: "complete", label: "Listo" },
]

export function getNextStep(
  current: ReceptionStep,
  success: boolean,
): ReceptionStep | null {
  if (!success) return null
  switch (current) {
    case "select-has-oc":
      return "upload-file"
    case "upload-file":
      return "ocr-results"
    case "ocr-results":
      return "match-products"
    case "match-products":
      return "calculate-conversions"
    case "calculate-conversions":
      return "review"
    case "review":
      return "complete"
    case "complete":
      return null
    default:
      return null
  }
}

export function getInitialState(): ReceptionState {
  return {
    hasOC: true,
    file: null,
    fileType: null,
    folio: null,
    fecha: null,
    proveedor: null,
    total: null,
    productos: [],
    warehouseId: null,
    supplierId: null,
    tarimasTotal: 0,
    conversiones: [],
    loading: false,
    error: null,
  }
}
