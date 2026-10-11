/**
 * DTO Canónico para respuesta OCR - Single Source of Truth
 *
 * Este DTO define el contrato ESTABLE entre:
 * - Backend OCR (Cloud Function)
 * - Frontend (useOcr hook)
 * - Dominio (ReceptionDomainService)
 *
 * Cambios aquí = migración coordinada en ambas capas.
 */

export type DocTipo = "cfdi" | "oc"

// ===== DTO DE ENTRADA (RAW - desde backend) =====
export interface RawOcrProductDto {
  linea?: number
  codigo?: string | null
  nombre?: string
  unidad?: string | null
  cantidad?: number
  precio?: number
  importe?: number
  confianza?: number
}

export interface RawOcrParsedDto {
  folio?: string | null
  fecha?: string | null
  proveedor?: string | null
  proveedor_posible?: string | null // compatibilidad
  total?: string | null
  productos?: RawOcrProductDto[]
  lineas_detectadas?: string[] // compatibilidad
}

export interface RawOcrResponseDto {
  success: boolean
  ocr: {
    blocks: Array<{ text: string; confidence: number; bbox: number[][] }>
    full_text: string
  }
  parsed?: RawOcrParsedDto
  tipo?: unknown
  preview?: { mimeType?: unknown; dataUrl?: unknown }
  error?: unknown
}

// ===== DTO CANÓNICO DE SALIDA (NORMALIZADO - para dominio/frontend) =====
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
  lineas_detectadas: string[] // raw text lines para debug
}

export interface OcrResponse {
  success: boolean
  ocr: {
    blocks: Array<{ text: string; confidence: number; bbox: number[][] }>
    full_text: string
  }
  parsed: OcrParsed
  tipo: DocTipo
  preview?: {
    mimeType: "image/jpeg"
    dataUrl: string
  }
  error?: string
}

// Compatibility export for legacy reception fixtures. The canonical catalog
// product contract lives with the Firestore domain types.
export type { Producto } from "../firestore/types"

// ===== MODELO DE DOMINIO (ReceptionDraft) =====
export interface ReceptionLineDraft {
  productId: string | null
  codigo: string | null
  nombre: string
  unidad: string | null
  cantidad: number
  precio: number
  importe: number
  estadoMatch: "confirmado" | "sugerido" | "manual"
}

export interface ReceptionDraft {
  folio: string | null
  fecha: string | null
  proveedor: string | null
  total: string | null
  lineas: ReceptionLineDraft[]
  warehouseId?: string | null
  supplierId?: string | null
}

// ===== MAPPERS =====

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Normaliza un producto RAW del backend al DTO canónico
 */
export function normalizeOcrProduct(
  raw: RawOcrProductDto,
  index = 0,
): OcrProduct {
  return {
    linea: asNumber(raw.linea, index + 1),
    codigo: asString(raw.codigo),
    nombre: asString(raw.nombre) ?? "",
    unidad: asString(raw.unidad),
    cantidad: asNumber(raw.cantidad),
    precio: asNumber(raw.precio),
    importe: asNumber(raw.importe),
    confianza: asNumber(raw.confianza, 1.0),
  }
}

/**
 * Normaliza respuesta RAW completa al DTO canónico
 */
export function normalizeOcrResponse(
  raw: RawOcrResponseDto,
  requestedType: DocTipo,
): OcrResponse {
  const parsed = raw.parsed ?? {}
  const rawProducts = Array.isArray(parsed.productos)
    ? parsed.productos as RawOcrProductDto[]
    : []
  const preview = raw.preview

  return {
    success: raw.success === true,
    ocr: {
      blocks: Array.isArray(raw.ocr?.blocks)
        ? raw.ocr.blocks as Array<{
            text: string
            confidence: number
            bbox: number[][]
          }>
        : [],
      full_text: asString(raw.ocr?.full_text) ?? "",
    },
    parsed: {
      folio: asString(parsed.folio),
      fecha: asString(parsed.fecha),
      proveedor: asString(parsed.proveedor ?? parsed.proveedor_posible),
      total: asString(parsed.total),
      productos: rawProducts.map(normalizeOcrProduct),
      lineas_detectadas: Array.isArray(parsed.lineas_detectadas)
        ? parsed.lineas_detectadas.filter(
            (v): v is string => typeof v === "string",
          )
        : [],
    },
    tipo: requestedType,
    ...(preview?.mimeType === "image/jpeg" &&
    typeof preview.dataUrl === "string"
      ? {
          preview: {
            mimeType: "image/jpeg" as const,
            dataUrl: preview.dataUrl,
          },
        }
      : {}),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
  }
}

/**
 * Mapea OCR normalizado → Draft de Recepción (para dominio)
 * Aquí es donde convertimos campos visuales a campos lógicos
 */
export function ocrToReceptionDraft(ocr: OcrResponse): ReceptionDraft {
  return {
    folio: ocr.parsed.folio,
    fecha: ocr.parsed.fecha,
    proveedor: ocr.parsed.proveedor,
    total: ocr.parsed.total,
    lineas: ocr.parsed.productos.map((p) => ({
      productId: null, // se resuelve en dominio via match
      codigo: p.codigo,
      nombre: p.nombre,
      unidad: p.unidad,
      cantidad: p.cantidad, // ← MAPPING: cantidad (no unidades)
      precio: p.precio,
      importe: p.importe,
      estadoMatch: "sugerido", // por defecto, el dominio lo confirma
    })),
  }
}

/**
 * Valida que el OCR tenga datos mínimos útiles
 */
export function isOcrValid(ocr: OcrResponse): boolean {
  return (
    ocr.success === true &&
    ocr.parsed.productos.length > 0 &&
    ocr.parsed.productos.some(
      (p) => p.cantidad > 0 && p.nombre.trim().length > 0,
    )
  )
}
