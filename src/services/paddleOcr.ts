// services/paddleOcr.ts
// Capa de transporte delgada - solo llama a la Callable Function
// La normalización canónica vive en services/domain/ocrMapper.ts

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

const ocrBaseUrl =
  import.meta.env.VITE_OCR_URL ||
  "https://us-central1-exepa-almacen-safe.cloudfunctions.net"

export async function checkOcrHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${ocrBaseUrl}/health`)
    const data = await res.json()
    return data.status === "ok"
  } catch {
    return false
  }
}
