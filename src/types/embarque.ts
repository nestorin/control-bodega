export type EmbarqueStatus = "planned" | "in_progress" | "completed" | "cancelled"

export interface Embarque {
  id: string
  pedidoId: string
  proveedorId: string
  proveedorNombre: string
  fechaPedido: Date // Timestamp en Firestore
  status: EmbarqueStatus

  totalTarimas: number
  tarimasCompletadas: number

  softReservedAt?: Date
  softReservationExpiresAt?: Date

  confirmedAt?: Date
  confirmedBy?: string

  createdAt: Date
  updatedAt: Date
}

export type TarimaStatus = "pending" | "scanned"

export interface Tarima {
  id: string // QR = ${embarqueId}|${tarimaIndex}
  embarqueId: string
  tarimaIndex: number
  status: TarimaStatus

  // Datos preliminares (lookup al escanear)
  fechaPedido: Date
  proveedorId: string
  proveedorNombre: string
  productoId: string
  productoNombre: string

  // Datos complementarios (captura manual)
  lote?: string
  caducidad?: Date
  observaciones?: string

  // Tracking
  createdAt: Date
  scannedAt?: Date
  scannedBy?: string

  // Auto-fill context (último valor conocido en este embarque)
  lastKnownLote?: string
  lastKnownCaducidad?: Date
}

export interface TarimaScanInput {
  lote?: string
  caducidad?: Date
  observaciones?: string
}

export interface TarimaWithProgress
  extends Tarima { // tarima sugerida siguiente
  isNext: boolean
}

export interface EmbarqueWithProgress extends Embarque {
  progressPercent: number
  tarimas?: Tarima[]
}

// Configuración de soft reservation
export const SOFT_RESERVATION_HOURS = 72
export const SOFT_RESERVATION_MS = SOFT_RESERVATION_HOURS * 60 * 60 * 1000
