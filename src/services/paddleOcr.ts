// services/paddleOcr.ts
// Capa de transporte delgada - solo llama a la Callable Function
// La normalización canónica vive en services/domain/ocrMapper.ts

import { getFunctions, httpsCallable } from "firebase/functions"
import { getApp } from "firebase/app"

const app = getApp()
const functions = getFunctions(app, "us-central1")

export type DocTipo = "cfdi" | "oc"

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
  proveedor_posible?: string | null
  total?: string | null
  productos?: RawOcrProductDto[]
  lineas_detectadas?: string[]
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

export interface OcrBlock {
  text: string
  confidence: number
  bbox: number[][]
}

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
    blocks: OcrBlock[]
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

function buildOcrEndpoint(tipo: DocTipo): string {
  const base =
    import.meta.env.VITE_OCR_URL ||
    "https://us-central1-exepa-almacen-safe.cloudfunctions.net"
  return `${base}/extract_ocr?tipo=${tipo}`
}

export async function extractWithPaddleOcr(
  file: File,
  tipo: DocTipo = "cfdi",
): Promise<OcrResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const res = await fetch(buildOcrEndpoint(tipo), {
    method: "POST",
    body: formData,
  })

  const data = (await res.json()) as RawOcrResponseDto

  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" && data.error) ||
        `OCR falló: ${res.status}`,
    )
  }

  // DEPRECATED: This normalization is duplicated in ocrMapper.ts
  // Kept for backward compatibility during migration
  return normalizeLegacyResponse(data, tipo)
}

function normalizeLegacyResponse(
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
        ? raw.ocr.blocks as OcrBlock[]
        : [],
      full_text:
        typeof raw.ocr?.full_text === "string" ? raw.ocr.full_text : "",
    },
    parsed: {
      folio: typeof parsed.folio === "string" ? parsed.folio : null,
      fecha: typeof parsed.fecha === "string" ? parsed.fecha : null,
      proveedor:
        typeof parsed.proveedor === "string"
          ? parsed.proveedor
          : typeof parsed.proveedor_posible === "string"
            ? parsed.proveedor_posible
            : null,
      total: typeof parsed.total === "string" ? parsed.total : null,
      productos: rawProducts.map((p, i) => ({
        linea: p.linea ?? i + 1,
        codigo: p.codigo ?? null,
        nombre: p.nombre ?? "",
        unidad: p.unidad ?? null,
        cantidad: p.cantidad ?? 0,
        precio: p.precio ?? 0,
        importe: p.importe ?? 0,
        confianza: p.confianza ?? 1.0,
      })),
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

export async function checkOcrHealth(): Promise<boolean> {
  try {
    const base =
      import.meta.env.VITE_OCR_URL ||
      "https://us-central1-exepa-almacen-safe.cloudfunctions.net"
    const res = await fetch(`${base}/health`)
    const data = await res.json()
    return data.status === "ok"
  } catch {
    return false
  }
}
