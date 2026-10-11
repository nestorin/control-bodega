import {
  Embarque,
  Tarima,
  TarimaScanInput,
  EmbarqueStatus,
  TarimaStatus,
  SOFT_RESERVATION_MS,
} from "@/types/embarque"
import {
  DocumentoCargado,
  CalculoTarimasResultado,
  PrintEtiquetaData,
  PrintJob,
} from "@/types/documento"
import { calcularTarimas, validarStockDisponible } from "./conversiones"
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
  DocumentSnapshot,
} from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { getFunctions, httpsCallable } from "firebase/functions"
import { db as firebaseDb } from "@/lib/firebase"

// Reuse the app-level Firestore instance; initializing a second default
// instance here would race with the configured persistent cache.
const DB = firebaseDb as Firestore
const EMBARQUES_COL = "embarques"
const TARIMAS_COL = "tarimas"
const INVENTARIO_MOVIMIENTOS_COL = "inventario_movimientos"

function now(): Date {
  return new Date()
}

function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

function fromTimestamp(ts: Timestamp | Date | undefined): Date | undefined {
  if (!ts) return undefined
  return ts instanceof Timestamp ? ts.toDate() : ts
}

function currentUser(): string {
  return getAuth().currentUser?.uid ?? "unknown"
}

function generateQR(embarqueId: string, tarimaIndex: number): string {
  return `${embarqueId}|${tarimaIndex}`
}

function parseQR(
  qr: string,
): { embarqueId: string tarimaIndex: number } | null {
  const parts = qr.split("|")
  if (parts.length !== 2) return null
  const index = parseInt(parts[1], 10)
  if (isNaN(index)) return null
  return { embarqueId: parts[0], tarimaIndex: index }
}

// ============================================
// 1. PLANIFICAR EMBARQUE (Soft Reserve)
// ============================================
export async function planificarEmbarque(
  documento: DocumentoCargado,
  getStockFn: (almacenId: string, productoId: string) => Promise<number>,
): Promise<Embarque> {
  // 1. Calcular tarimas
  const calculo: CalculoTarimasResultado = calcularTarimas(documento)
  if (calculo.totalTarimas === 0) {
    throw new Error("El documento no genera tarimas")
  }

  // 2. Validar stock disponible (soft)
  const stockCheck = await validarStockDisponible(documento.items, getStockFn)
  if (!stockCheck.disponible) {
    const msg = stockCheck.faltantes
      .map((f) => `${f.productoId}: faltan ${f.faltante}`)
      .join(", ")
    throw new Error(`Stock insuficiente: ${msg}`)
  }

  // 3. Crear embarque
  const embarqueRef = doc(collection(DB, EMBARQUES_COL))
  const embarque: Embarque = {
    id: embarqueRef.id,
    pedidoId: documento.id,
    proveedorId: documento.proveedorId,
    proveedorNombre: documento.proveedorNombre,
    fechaPedido: documento.fecha,
    status: "planned",
    totalTarimas: calculo.totalTarimas,
    tarimasCompletadas: 0,
    softReservedAt: now(),
    softReservationExpiresAt: new Date(now().getTime() + SOFT_RESERVATION_MS),
    createdAt: now(),
    updatedAt: now(),
  }

  await setDoc(embarqueRef, {
    ...embarque,
    fechaPedido: toTimestamp(embarque.fechaPedido),
    softReservedAt: toTimestamp(embarque.softReservedAt!),
    softReservationExpiresAt: toTimestamp(embarque.softReservationExpiresAt!),
    createdAt: toTimestamp(embarque.createdAt),
    updatedAt: toTimestamp(embarque.updatedAt),
  })

  // 4. Crear tarimas (batch)
  const batch = writeBatch(DB)
  for (let i = 0; i < calculo.totalTarimas; i++) {
    const tarimaRef = doc(collection(DB, TARIMAS_COL))
    const tarima: Tarima = {
      id: generateQR(embarqueRef.id, i),
      embarqueId: embarqueRef.id,
      tarimaIndex: i,
      status: "pending",
      fechaPedido: documento.fecha,
      proveedorId: documento.proveedorId,
      proveedorNombre: documento.proveedorNombre,
      productoId: documento.items[0]?.productoId ?? "",
      productoNombre: documento.items[0]?.productoNombre ?? "",
      createdAt: now(),
    }
    batch.set(tarimaRef, {
      ...tarima,
      fechaPedido: toTimestamp(tarima.fechaPedido),
      createdAt: toTimestamp(tarima.createdAt),
    })
  }
  await batch.commit()

  // 5. Programar cleanup (en producción: Cloud Scheduler / Function)
  scheduleSoftReservationCleanup(embarqueRef.id)

  return embarque
}

// ============================================
// 2. GENERAR IMPRESIÓN
// ============================================
export async function generarImpresion(embarqueId: string): Promise<PrintJob> {
  const embarqueSnap = await getDoc(doc(DB, EMBARQUES_COL, embarqueId))
  if (!embarqueSnap.exists()) throw new Error("Embarque no encontrado")

  const embarque = embarqueSnap.data() as Embarque

  const tarimasSnap = await getDocs(
    query(
      collection(DB, TARIMAS_COL),
      where("embarqueId", "==", embarqueId),
      orderBy("tarimaIndex", "asc"),
    ),
  )

  const etiquetas: PrintEtiquetaData[] = tarimasSnap.docs.map((snap) => {
    const tarima = snap.data() as Tarima
    return {
      qr: tarima.id,
      productoNombre: tarima.productoNombre,
      productoCodigo: tarima.productoId,
      folioPedido: embarque.pedidoId,
      tarimaNumero: tarima.tarimaIndex + 1,
      copias: 4,
    }
  })

  return {
    embarqueId,
    etiquetas,
    generatedAt: now(),
  }
}

// ============================================
// 3. ESCANEAR TARIMA
// ============================================
export async function escanearTarima(
  qr: string,
  input: TarimaScanInput,
): Promise<Tarima> {
  const parsed = parseQR(qr)
  if (!parsed) throw new Error("QR inválido")

  const { embarqueId, tarimaIndex } = parsed

  // Buscar tarima por ID (que es el QR)
  const tarimaRef = doc(DB, TARIMAS_COL, qr)
  const tarimaSnap = await getDoc(tarimaRef)

  if (!tarimaSnap.exists()) {
    throw new Error("Tarima no encontrada")
  }

  const tarima = tarimaSnap.data() as Tarima

  if (tarima.status === "scanned") {
    throw new Error("Esta tarima ya fue escaneada")
  }

  // Auto-fill: última tarima escaneada en este embarque
  const autoFill = await getAutoFillData(embarqueId)

  const lote = input.lote ?? autoFill.lote ?? tarima.lastKnownLote
  const caducidad =
    input.caducidad ?? autoFill.caducidad ?? tarima.lastKnownCaducidad

  // Actualizar tarima
  const updateData = {
    status: "scanned" as TarimaStatus,
    lote,
    caducidad: caducidad ? toTimestamp(caducidad) : undefined,
    observaciones: input.observaciones,
    scannedAt: toTimestamp(now()),
    scannedBy: currentUser(),
    lastKnownLote: lote,
    lastKnownCaducidad: caducidad,
  }

  // Limpiar undefined
  Object.keys(updateData).forEach(
    (key) =>
      updateData[(key as keyof typeof updateData)] === undefined &&
      delete updateData[(key as keyof typeof updateData)],
  )

  await updateDoc(tarimaRef, updateData)

  // Incrementar contador en embarque
  const embarqueRef = doc(DB, EMBARQUES_COL, embarqueId)
  await updateDoc(embarqueRef, {
    tarimasCompletadas: increment(1),
    status: "in_progress",
    updatedAt: toTimestamp(now()),
  })

  // Verificar si es la última tarima
  const embarqueSnap = await getDoc(embarqueRef)
  const embarqueData = embarqueSnap.data() as Embarque

  if (embarqueData.tarimasCompletadas + 1 >= embarqueData.totalTarimas) {
    // Disparar confirmación asíncrona
    confirmarEmbarque(embarqueId).catch(console.error)
  }

  return {
    ...tarima,
    status: "scanned",
    lote,
    caducidad: caducidad ? new Date(caducidad) : undefined,
    observaciones: input.observaciones,
    scannedAt: now(),
    scannedBy: currentUser(),
    lastKnownLote: lote,
    lastKnownCaducidad: caducidad,
  }
}

// ============================================
// 4. AUTO-FILL DATA
// ============================================
export async function getAutoFillData(
  embarqueId: string,
): Promise<{ lote?: string caducidad?: Date }> {
  const snap = await getDocs(
    query(
      collection(DB, TARIMAS_COL),
      where("embarqueId", "==", embarqueId),
      where("status", "==", "scanned"),
      orderBy("scannedAt", "desc"),
      limit(1),
    ),
  )

  if (snap.empty) return {}

  const ultima = snap.docs[0].data() as Tarima
  return {
    lote: ultima.lote,
    caducidad: ultima.caducidad,
  }
}

// ============================================
// 5. CONFIRMAR EMBARQUE (Hard Reserve + Inventory)
// ============================================
export async function confirmarEmbarque(embarqueId: string): Promise<void> {
  const confirm = httpsCallable<{ shipmentId: string operationId: string }, {
    shipmentId: string
    status: string
    idempotent: boolean
  }>(getFunctions(), "confirm_shipment")
  await confirm({
    shipmentId: embarqueId,
    operationId: `web-${embarqueId}-${Date.now()}`,
  })
}

// ============================================
// 6. TARIMA EXTRA
// ============================================
export async function crearTarimaExtra(_embarqueId: string): Promise<never> {
  // This operation changes inventory workflow state and must run in a trusted
  // backend with server-side authorization and an audit record.
  throw new Error(
    "La creación de tarimas extra requiere un backend autorizado.",
  )
}

// ============================================
// 7. CLEANUP SOFT RESERVATION
// ============================================
function scheduleSoftReservationCleanup(embarqueId: string): void {
  // En producción: usar Cloud Scheduler o Cloud Function programada
  // Aquí solo registramos para que un job externo lo procese
  console.log(
    `[Cleanup] Programado para embarque ${embarqueId} en ${SOFT_RESERVATION_MS / (60 * 60 * 1000)}h`,
  )
}

export async function cleanupSoftReservation(
  embarqueId: string,
): Promise<void> {
  const embarqueRef = doc(DB, EMBARQUES_COL, embarqueId)
  const embarqueSnap = await getDoc(embarqueRef)

  if (!embarqueSnap.exists()) return

  const embarque = embarqueSnap.data() as Embarque

  if (embarque.status === "planned" && embarque.softReservationExpiresAt) {
    const expiracion = fromTimestamp(embarque.softReservationExpiresAt)
    if (expiracion && expiracion < now()) {
      await updateDoc(embarqueRef, {
        status: "cancelled",
        updatedAt: toTimestamp(now()),
      })
      // Opcional: notificar al usuario
    }
  }
}

// ============================================
// HELPERS: GETTERS
// ============================================
export async function getEmbarque(
  embarqueId: string,
): Promise<Embarque | null> {
  const snap = await getDoc(doc(DB, EMBARQUES_COL, embarqueId))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    ...data,
    fechaPedido: fromTimestamp(data.fechaPedido)!,
    softReservedAt: fromTimestamp(data.softReservedAt),
    softReservationExpiresAt: fromTimestamp(data.softReservationExpiresAt),
    confirmedAt: fromTimestamp(data.confirmedAt),
    createdAt: fromTimestamp(data.createdAt)!,
    updatedAt: fromTimestamp(data.updatedAt)!,
  } as Embarque
}

export async function getTarimas(embarqueId: string): Promise<Tarima[]> {
  const snap = await getDocs(
    query(
      collection(DB, TARIMAS_COL),
      where("embarqueId", "==", embarqueId),
      orderBy("tarimaIndex", "asc"),
    ),
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      fechaPedido: fromTimestamp(data.fechaPedido)!,
      caducidad: fromTimestamp(data.caducidad),
      createdAt: fromTimestamp(data.createdAt)!,
      scannedAt: fromTimestamp(data.scannedAt),
      lastKnownCaducidad: fromTimestamp(data.lastKnownCaducidad),
    } as Tarima
  })
}

export async function getTarima(
  embarqueId: string,
  tarimaIndex: number,
): Promise<Tarima | null> {
  const qr = generateQR(embarqueId, tarimaIndex)
  const snap = await getDoc(doc(DB, TARIMAS_COL, qr))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    ...data,
    fechaPedido: fromTimestamp(data.fechaPedido)!,
    caducidad: fromTimestamp(data.caducidad),
    createdAt: fromTimestamp(data.createdAt)!,
    scannedAt: fromTimestamp(data.scannedAt),
    lastKnownCaducidad: fromTimestamp(data.lastKnownCaducidad),
  } as Tarima
}

export async function getEmbarquesByPedido(
  pedidoId: string,
): Promise<Embarque[]> {
  const snap = await getDocs(
    query(
      collection(DB, EMBARQUES_COL),
      where("pedidoId", "==", pedidoId),
      orderBy("createdAt", "desc"),
    ),
  )
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      fechaPedido: fromTimestamp(data.fechaPedido)!,
      softReservedAt: fromTimestamp(data.softReservedAt),
      softReservationExpiresAt: fromTimestamp(data.softReservationExpiresAt),
      confirmedAt: fromTimestamp(data.confirmedAt),
      createdAt: fromTimestamp(data.createdAt)!,
      updatedAt: fromTimestamp(data.updatedAt)!,
    } as Embarque
  })
}
