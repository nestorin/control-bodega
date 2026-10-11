/**
 * Mapper ProgramacionRecepcion → AppReceptionState
 *
 * Convierte la salida del wizard de programación al modelo que consume App.tsx.
 * Esta es la frontera: Wizard (ProgramacionRecepcion) → App State.
 */

import type {
  ProgramacionRecepcionOutput,
  AppReceptionState,
  ReceptionLineState,
  ReceptionConversion,
} from "@/types/domain"

/**
 * Convierte salida del wizard a estado de App
 *
 * Mapea:
 * - Productos: agrega campos faltantes (precio=0, importe=0, estadoMatch="confirmado")
 * - Conversiones: pasan tal cual (ya son ReceptionConversion)
 * - Calcula tarimasTotal desde conversiones
 */
export function programacionToAppReception(
  prog: ProgramacionRecepcionOutput,
): AppReceptionState {
  // Convertir productos del wizard a ReceptionLineState
  const lineas: ReceptionLineState[] = prog.productos.map((p) => ({
    productId: p.productId,
    codigo: p.codigo,
    nombre: p.nombre,
    unidad: p.unidad,
    cantidad: p.cantidad,
    precio: 0, // Se calcula en conversión o se edita manual
    importe: 0, // Se calcula: cantidad * precio
    estadoMatch: "confirmado", // Wizard ya validó coincidencias
  }))

  // Conversiones ya vienen como ReceptionConversion
  const conversiones: ReceptionConversion[] = prog.conversionesTabla ?? []

  // Total de tarimas desde conversiones (fuente de verdad)
  const tarimasTotal = conversiones.reduce((sum, c) => sum + c.tarimas, 0)

  return {
    folio: prog.ocFolio || null,
    fecha: new Date().toISOString().split("T")[0], // Hoy por defecto
    proveedor: prog.proveedor || null,
    proveedorLogistico: prog.proveedorLogistico || null,
    total: null, // Se calcula al persistir
    lineas,
    warehouseId: null, // Se asigna en ReviewStep
    supplierId: null, // Se asigna en ReviewStep
    tarimasTotal,
    conversiones,
  }
}

/**
 * Convierte AppReceptionState a ProgramacionRecepcionOutput (para edición)
 * Útil si se necesita re-editar una recepción existente.
 */
export function appReceptionToProgramacion(
  app: AppReceptionState,
): ProgramacionRecepcionOutput {
  return {
    hasOC: !!app.folio,
    ocFolio: app.folio || "",
    tarimas: app.tarimasTotal.toString(),
    proveedor: app.proveedor || "",
    proveedorLogistico: app.proveedorLogistico || "",
    productos: app.lineas.map((l) => ({
      productId: l.productId,
      codigo: l.codigo,
      nombre: l.nombre,
      unidad: l.unidad,
      cantidad: l.cantidad,
      cajasPorTarima: 0, // Se recalcula en CalculateConversions
      tarimas: 0, // Se recalcula en CalculateConversions
    })),
    conversionesTabla: app.conversiones,
  }
}
