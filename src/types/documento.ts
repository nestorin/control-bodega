export interface DocumentoItem {
  productoId: string
  productoNombre: string
  cantidad: number
  unidad: string // 'caja', 'pallet', 'unidad'
  conversionFactor?: number // cajas por pallet, etc.
  almacenDestinoId?: string
}

export interface DocumentoCargado {
  id: string // folio del pedido
  proveedorId: string
  proveedorNombre: string
  fecha: Date
  items: DocumentoItem[]
  almacenDestinoId: string
}

export interface ConversionRegla {
  productoId: string
  unidadOrigen: string // 'pallet', 'caja'
  unidadDestino: string // 'tarima', 'sticker'
  factor: number // ej: 1 pallet = 1 tarima = 4 stickers
}

export interface CalculoTarimasResultado {
  totalTarimas: number
  totalStickers: number // totalTarimas * 4
  desglose: {
    productoId: string
    productoNombre: string
    cantidadOriginal: number
    unidadOriginal: string
    tarimasCalculadas: number
  }[]
}

export interface PrintEtiquetaData {
  qr: string // ${embarqueId}|${tarimaIndex}
  productoNombre: string
  productoCodigo: string
  folioPedido: string
  tarimaNumero: number // 1-based para usuario
  copias: 4 // 4 stickers por tarima (2 caras)
}

export interface PrintJob {
  embarqueId: string
  etiquetas: PrintEtiquetaData[]
  generatedAt: Date
}
