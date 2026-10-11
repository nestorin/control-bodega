/**
 * Validación en Frontera - Guards de Entrada
 *
 * Valida datos ANTES de cruzar fronteras críticas:
 * - OCR → Dominio
 * - Wizard → App State
 * - Dominio → Firestore
 */

import type {
  ReceptionDraft,
  ReceptionLineState,
  ReceptionConversion,
  PersistedReceptionProduct,
  ValidationResult,
} from "@/types/domain"

/**
 * Valida una línea de recepción antes de persistir
 */
export function validateReceptionLine(
  line: ReceptionLineState,
): ValidationResult {
  const errors: string[] = []
  const normalizedName =
    typeof line.nombre === "string" ? line.nombre.trim() : ""

  if (normalizedName.length === 0) {
    errors.push("Nombre del producto es requerido")
  }

  if (line.cantidad <= 0) {
    errors.push("Cantidad debe ser mayor a 0")
  }

  if (line.precio < 0) {
    errors.push("Precio no puede ser negativo")
  }

  if (line.importe < 0) {
    errors.push("Importe no puede ser negativo")
  }

  if (!["confirmado", "sugerido", "manual"].includes(line.estadoMatch)) {
    errors.push("Estado de match inválido")
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Valida una conversión
 */
export function validateConversion(
  conv: ReceptionConversion,
): ValidationResult {
  const errors: string[] = []

  if (!conv.producto || conv.producto.trim().length === 0) {
    errors.push("Producto es requerido")
  }

  if (conv.cajas < 0) {
    errors.push("Cajas no puede ser negativo")
  }

  if (conv.cajasPorTarima <= 0) {
    errors.push("Cajas por tarima debe ser mayor a 0")
  }

  if (conv.tarimas < 0) {
    errors.push("Tarimas no puede ser negativo")
  }

  if (conv.stickers < 0) {
    errors.push("Stickers no puede ser negativo")
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Valida draft completo de recepción antes de persistir
 *
 * Esta es la validación crítica: NO se persiste nada sin pasar aquí.
 */
export function validateReceptionDraft(draft: {
  folio: string | null
  fecha: string | null
  proveedor: string | null
  proveedorLogistico: string | null
  lineas: ReceptionLineState[]
  warehouseId: string | null
  supplierId: string | null
  tarimasTotal: number
  conversiones: ReceptionConversion[]
}): ValidationResult {
  const errors: string[] = []

  // Campos obligatorios
  if (!draft.folio || draft.folio.trim() === "") {
    errors.push("Folio es requerido")
  }

  if (!draft.fecha || draft.fecha.trim() === "") {
    errors.push("Fecha es requerida")
  }

  if (!draft.proveedor || draft.proveedor.trim() === "") {
    errors.push("Proveedor es requerido")
  }

  if (!draft.proveedorLogistico || draft.proveedorLogistico.trim() === "") {
    errors.push("Proveedor logístico es requerido")
  }

  if (!draft.warehouseId) {
    errors.push("Almacén destino es requerido")
  }

  if (!draft.supplierId) {
    errors.push("Proveedor logístico (ID) es requerido")
  }

  // Líneas
  if (!draft.lineas.length) {
    errors.push("Al menos un producto es requerido")
  } else {
    draft.lineas.forEach((line, i) => {
      const lineValidation = validateReceptionLine(line)
      if (!lineValidation.valid) {
        errors.push(`Producto ${i + 1}: ${lineValidation.errors.join(", ")}`)
      }
    })
  }

  // Conversiones
  if (draft.tarimasTotal <= 0) {
    errors.push("Total de tarimas debe ser mayor a 0")
  }

  draft.conversiones.forEach((conv, i) => {
    const convValidation = validateConversion(conv)
    if (!convValidation.valid) {
      errors.push(`Conversión ${i + 1}: ${convValidation.errors.join(", ")}`)
    }
  })

  return { valid: errors.length === 0, errors }
}

/**
 * Valida y convierte línea de dominio a formato persistido (Firestore)
 *
 * Lanza si la línea no es válida - fail fast en frontera de persistencia.
 */
export function toPersistedProduct(
  line: ReceptionLineState,
): {
  productId: string | null
  codigo: string | null
  nombre: string
  unidad: string | null
  cantidad: number
  precio: number
  importe: number
  estadoMatch: "confirmed" | "unmatched"
} {
  const validation = validateReceptionLine(line)
  if (!validation.valid) {
    throw new Error(
      `Línea inválida para persistir: ${validation.errors.join(", ")}`,
    )
  }

  return {
    productId: line.productId,
    codigo: line.codigo,
    nombre: line.nombre,
    unidad: line.unidad,
    cantidad: line.cantidad,
    precio: line.precio,
    importe: line.importe,
    estadoMatch: line.estadoMatch === "confirmado" ? "confirmed" : "unmatched",
  }
}

/**
 * Valida y convierte conversión a formato persistido
 */
export function toPersistedConversion(
  conv: ReceptionConversion,
): {
  producto: string
  codigo: string | null
  unidades: number
  cajas: number
  cajasPorTarima: number
  tarimas: number
  stickers: number
  conversionMatch: boolean
} {
  const validation = validateConversion(conv)
  if (!validation.valid) {
    throw new Error(
      `Conversión inválida para persistir: ${validation.errors.join(", ")}`,
    )
  }

  return {
    producto: conv.producto,
    codigo: conv.codigo,
    unidades: conv.unidades,
    cajas: conv.cajas,
    cajasPorTarima: conv.cajasPorTarima,
    tarimas: conv.tarimas,
    stickers: conv.stickers,
    conversionMatch: conv.conversionMatch,
  }
}
