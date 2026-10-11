/**
 * Mapper OCR → ReceptionLineState
 *
 * Convierte productos OCR crudos a líneas de recepción válidas para el estado de la UI.
 * Esta es la frontera: OCR (externo) → Dominio (interno).
 */

import type {
  OcrProduct,
  OcrResponse,
  ReceptionLineState,
  Producto,
} from "@/types/domain"
import { resolveCatalogProduct } from "./productMatching"

/**
 * Convierte un OcrProduct crudo a ReceptionLineState
 *
 * Reglas de negocio:
 * - cantidad viene del OCR (unidades detectadas)
 * - precio/importe vienen del OCR si existen, sino 0
 * - estadoMatch = "sugerido" por defecto (requiere confirmación humana)
 * - productId = null (se resuelve en MatchProducts contra catálogo)
 */
export function ocrProductToReceptionLine(ocr: OcrProduct): ReceptionLineState {
  return {
    productId: null, // Se resuelve en MatchProducts
    codigo: ocr.codigo,
    nombre: ocr.nombre,
    unidad: ocr.unidad,
    cantidad: ocr.cantidad, // Unidades detectadas por OCR
    precio: ocr.precio ?? 0,
    importe: ocr.importe ?? 0,
    estadoMatch: "sugerido", // Por defecto, requiere confirmación
  }
}

/**
 * Convierte respuesta OCR completa a array de ReceptionLineState
 *
 * Filtra productos inválidos (cantidad <= 0 o nombre vacío).
 * Mantiene solo productos con datos mínimos útiles.
 */
export function ocrResponseToReceptionLines(
  ocr: OcrResponse,
): ReceptionLineState[] {
  if (!ocr.success || !ocr.parsed?.productos?.length) {
    return []
  }

  return ocr.parsed.productos
    .filter((p) => p.cantidad > 0 && p.nombre.trim().length > 0)
    .map(ocrProductToReceptionLine)
}

export function matchReceptionLinesToCatalog(
  lines: ReceptionLineState[],
  catalog: Producto[],
): ReceptionLineState[] {
  return lines.map((line) => {
    const match = resolveCatalogProduct(catalog, {
      name: line.nombre,
      code: line.codigo,
    })
    return {
      ...line,
      productId: match?.id ?? null,
      nombre: match?.nombre ?? line.nombre,
      unidad: match?.unidad ?? line.unidad,
      estadoMatch: match ? "confirmado" : "sugerido",
    }
  })
}

/**
 * Valida que el OCR tenga datos mínimos para crear recepción
 */
export function isOcrValidForReception(ocr: OcrResponse): boolean {
  return (
    ocr.success === true &&
    ocr.parsed?.productos?.length > 0 &&
    ocr.parsed.productos.some(
      (p) => p.cantidad > 0 && p.nombre.trim().length > 0,
    )
  )
}
