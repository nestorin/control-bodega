import {
  DocumentoCargado,
  DocumentoItem,
  ConversionRegla,
  CalculoTarimasResultado,
} from "@/types/documento"

export interface EmbarqueConversion {
  producto: string
  piezasPorCaja: number
  cajasPorTarima: number
}

export interface FirestoreConversionRecord {
  productName?: string
  piecesPerBox?: number
  boxesPerPallet?: number
}

/** Firestore values override local fallback values by product name. */
export function mergeCanonicalConversions(
  fallback: EmbarqueConversion[],
  remote: FirestoreConversionRecord[],
): EmbarqueConversion[] {
  const remoteConversions = remote
    .filter(
      (conversion) =>
        typeof conversion.productName === "string" &&
        conversion.productName.trim() !== "" &&
        Number.isFinite(conversion.piecesPerBox) &&
        Number(conversion.piecesPerBox) > 0 &&
        Number.isFinite(conversion.boxesPerPallet) &&
        Number(conversion.boxesPerPallet) > 0,
    )
    .map((conversion) => ({
      producto: conversion.productName!.trim(),
      piezasPorCaja: Number(conversion.piecesPerBox),
      cajasPorTarima: Number(conversion.boxesPerPallet),
    }))

  const remoteNames = new Set(
    remoteConversions.map((conversion) =>
      conversion.producto.toLocaleLowerCase(),
    ),
  )

  return [
    ...remoteConversions,
    ...fallback.filter(
      (conversion) =>
        !remoteNames.has(conversion.producto.trim().toLocaleLowerCase()),
    ),
  ]
}

/**
 * Tabla de conversiones por defecto
 * En producción esto vendría de Firestore (colección 'conversiones')
 */
export const CONVERSIONES_DEFAULT: ConversionRegla[] = [
  // 1 pallet = 1 tarima = 4 stickers
  {
    productoId: "*",
    unidadOrigen: "pallet",
    unidadDestino: "tarima",
    factor: 1,
  },
  {
    productoId: "*",
    unidadOrigen: "tarima",
    unidadDestino: "sticker",
    factor: 4,
  },
  // 1 caja = 0.1 tarima (10 cajas = 1 tarima) = 4 stickers
  {
    productoId: "*",
    unidadOrigen: "caja",
    unidadDestino: "tarima",
    factor: 0.1,
  },
  {
    productoId: "*",
    unidadOrigen: "caja",
    unidadDestino: "sticker",
    factor: 0.4,
  },
  // Pallet a caja (para validar stock)
  {
    productoId: "*",
    unidadOrigen: "pallet",
    unidadDestino: "caja",
    factor: 10,
  },
]

/**
 * Busca regla de conversión para un producto/unidad
 */
export function encontrarConversion(
  productoId: string,
  unidadOrigen: string,
  unidadDestino: string,
  conversiones: ConversionRegla[],
): ConversionRegla | null {
  // Primero busca específica del producto
  let regla = conversiones.find(
    (c) =>
      c.productoId === productoId &&
      c.unidadOrigen === unidadOrigen &&
      c.unidadDestino === unidadDestino,
  )

  // Fallback a wildcard '*'
  if (!regla) {
    regla = conversiones.find(
      (c) =>
        c.productoId === "*" &&
        c.unidadOrigen === unidadOrigen &&
        c.unidadDestino === unidadDestino,
    )
  }

  return regla ?? null
}

/**
 * Convierte cantidad de una unidad a otra
 */
export function convertirCantidad(
  cantidad: number,
  unidadOrigen: string,
  unidadDestino: string,
  conversiones: ConversionRegla[],
  productoId: string,
): number {
  if (unidadOrigen === unidadDestino) return cantidad

  const regla = encontrarConversion(
    productoId,
    unidadOrigen,
    unidadDestino,
    conversiones,
  )
  if (!regla) {
    throw new Error(
      `No hay conversión de ${unidadOrigen} a ${unidadDestino} para producto ${productoId}`,
    )
  }

  return cantidad * regla.factor
}

/**
 * Calcula total de tarimas y stickers desde un documento cargado
 */
export function calcularTarimas(
  documento: DocumentoCargado,
  conversiones: ConversionRegla[] = CONVERSIONES_DEFAULT,
): CalculoTarimasResultado {
  const desglose = documento.items.map((item) => {
    // Convertir a tarimas
    const tarimasCalculadas = convertirCantidad(
      item.cantidad,
      item.unidad,
      "tarima",
      conversiones,
      item.productoId,
    )

    return {
      productoId: item.productoId,
      productoNombre: item.productoNombre,
      cantidadOriginal: item.cantidad,
      unidadOriginal: item.unidad,
      tarimasCalculadas: Math.ceil(tarimasCalculadas), // Redondear hacia arriba
    }
  })

  const totalTarimas = desglose.reduce((sum, d) => sum + d.tarimasCalculadas, 0)
  const totalStickers = totalTarimas * 4 // 4 stickers por tarima

  return {
    totalTarimas,
    totalStickers,
    desglose,
  }
}

/**
 * Valida que haya stock disponible para un documento
 * (Soft validation - no reserva, solo verifica disponibilidad)
 */
export async function validarStockDisponible(
  items: DocumentoItem[],
  getStockFn: (almacenId: string, productoId: string) => Promise<number>,
): Promise<{
  disponible: boolean
  faltantes: { productoId: string; faltante: number }[]
}> {
  const faltantes: { productoId: string; faltante: number }[] = []

  for (const item of items) {
    // Convertir a cajas para comparar con stock (asumiendo stock en cajas)
    const cajasRequeridas = convertirCantidad(
      item.cantidad,
      item.unidad,
      "caja",
      CONVERSIONES_DEFAULT,
      item.productoId,
    )
    const stock = await getStockFn(item.almacenDestinoId || "", item.productoId)

    if (stock < cajasRequeridas) {
      faltantes.push({
        productoId: item.productoId,
        faltante: cajasRequeridas - stock,
      })
    }
  }

  return {
    disponible: faltantes.length === 0,
    faltantes,
  }
}
