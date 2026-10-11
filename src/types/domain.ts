/**
 * Tipos Compartidos del Dominio - Single Source of Truth
 *
 * Contratos inmutables que cruzan fronteras (FE/BE, componentes, persistencia).
 * Cualquier cambio aquí = migración coordinada.
 */

// ============================================
// 1. OCR - Lo que viene del backend OCR
// ============================================
export interface OcrProduct {
  linea: number
  codigo: string | null
  nombre: string
  unidad: string | null
  cantidad: number
  precio: number
  importe: number
  confianza: number
}

export interface OcrParsed {
  folio: string | null
  fecha: string | null
  proveedor: string | null
  total: string | null
  productos: OcrProduct[]
  lineas_detectadas: string[]
}

export interface OcrResponse {
  success: boolean
  ocr: {
    blocks: Array<{ text: string; confidence: number; bbox: number[][] }>
    full_text: string
  }
  parsed: OcrParsed
  tipo: "cfdi" | "oc"
  preview?: {
    mimeType: "image/jpeg"
    dataUrl: string
  }
  error?: string
}

// ============================================
// 2. LÍNEA DE RECEPCIÓN - Estado en memoria (UI)
// ============================================
export interface ReceptionLineState {
  productId: string | null
  codigo: string | null
  nombre: string
  unidad: string | null
  cantidad: number
  precio: number
  importe: number
  estadoMatch: "confirmado" | "sugerido" | "manual"
}

export interface Producto {
  id: string
  nombre: string
  sku?: string
  unidad?: string
  codigosProveedor?: string[]
  cajasPorTarima?: number
}

// ============================================
// 3. CONVERSIÓN - Cálculo logístico (tarimas, stickers)
// ============================================
export interface ReceptionConversion {
  producto: string
  codigo: string | null
  unidades: number
  cajas: number
  cajasPorTarima: number
  tarimas: number
  stickers: number
  conversionMatch: boolean
}

// ============================================
// 4. DOCUMENTO PERSISTIDO - Lo que va a Firestore
// ============================================
export interface PersistedReceptionProduct {
  productId: string | null
  codigo: string | null
  nombre: string
  unidad: string | null
  cantidad: number
  precio: number
  importe: number
  estadoMatch: "confirmed" | "unmatched"
}

export interface PersistedReceptionConversion {
  producto: string
  codigo: string | null
  unidades: number
  cajas: number
  cajasPorTarima: number
  tarimas: number
  stickers: number
  conversionMatch: boolean
}

// ============================================
// 5. ESTADO DE PROGRAMACIÓN (lo que emite ProgramacionRecepcion)
// ============================================
export interface ProgramacionRecepcionOutput {
  hasOC: boolean
  ocFolio: string
  tarimas: string
  proveedor: string
  proveedorLogistico: string
  receptionId?: string
  productos: Array<{
    productId: string | null
    codigo: string | null
    nombre: string
    unidad: string | null
    cantidad: number
    cajasPorTarima: number
    tarimas: number
  }>
  conversionesTabla?: ReceptionConversion[]
}

// ============================================
// 6. RECEPCIÓN COMPLETA PARA APP (lo que consume App.tsx)
// ============================================
export interface AppReceptionState {
  folio: string | null
  fecha: string | null
  proveedor: string | null
  proveedorLogistico: string | null
  total: string | null
  lineas: ReceptionLineState[]
  warehouseId?: string | null
  supplierId?: string | null
  tarimasTotal: number
  conversiones: ReceptionConversion[]
}

// ============================================
// 7. DRAFT DE RECEPCIÓN (intermedio para validación)
// ============================================
export interface ReceptionDraft {
  folio: string | null
  fecha: string | null
  proveedor: string | null
  total: string | null
  lineas: ReceptionLineState[]
  warehouseId: string | null
  supplierId: string | null
  tarimasTotal: number
  conversiones: ReceptionConversion[]
}

// ============================================
// 8. CATÁLOGO DE CONVERSIONES
// ============================================
export interface ConversionProp {
  producto: string
  piezasPorCaja: number
  cajasPorTarima: number
}

export const CATALOGO_CONVERSIONES_DEFAULT: ConversionProp[] = [
  { producto: "AJONJOLI", piezasPorCaja: 25, cajasPorTarima: 10 },
  { producto: "AZUCAR", piezasPorCaja: 1, cajasPorTarima: 50 },
  { producto: "CAFE", piezasPorCaja: 24, cajasPorTarima: 12 },
  { producto: "CHILE", piezasPorCaja: 12, cajasPorTarima: 15 },
  { producto: "FRIJOL", piezasPorCaja: 1, cajasPorTarima: 50 },
  { producto: "MAIZ", piezasPorCaja: 1, cajasPorTarima: 50 },
  { producto: "TRIGO", piezasPorCaja: 1, cajasPorTarima: 50 },
]

// ============================================
// 9. RESULTADO DE VALIDACIÓN
// ============================================
export interface ValidationResult {
  valid: boolean
  errors: string[]
}
