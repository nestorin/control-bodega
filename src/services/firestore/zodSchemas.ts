/**
 * Zod Schemas para validación temprana de datos de recepción
 *
 * Estos schemas garantizan que los datos que llegan al backend
 * cumplan con el contrato esperado antes de procesarlos.
 */

import { z } from "zod";

// ===== SCHEMA PARA DOCUMENTO DE RECEPCIÓN =====
export const ReceptionDocSchema = z.object({
  id: z.string(),
  folio: z.string().min(1, "Folio es requerido"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  proveedor: z.string().min(1, "Proveedor es requerido"),
  proveedorLogistico: z.string().optional(),
  warehouseId: z.string().min(1, "Almacén es requerido"),
  supplierId: z.string().min(1, "Proveedor logístico es requerido"),
  total: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ===== SCHEMA PARA LÍNEA DE RECEPCIÓN =====
export const ReceptionLineSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  codigo: z.string().nullable(),
  nombre: z.string().min(1, "Nombre del producto es requerido"),
  unidad: z.string().optional(),
  cantidad: z.number().min(1, "Cantidad debe ser mayor a 0"),
  precio: z.number().min(0, "Precio debe ser mayor o igual a 0"),
  importe: z.number().min(0, "Importe debe ser mayor o igual a 0"),
  estadoMatch: z.enum(["confirmado", "sugerido", "manual"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ===== SCHEMA PARA DATOS DE CONVERSIÓN =====
export const ConversionSchema = z.object({
  producto: z.string().min(1, "Producto es requerido"),
  codigo: z.string().nullable(),
  unidades: z.number().min(0, "Unidades debe ser mayor o igual a 0"),
  cajas: z.number().min(0, "Cajas debe ser mayor o igual a 0"),
  cajasPorTarima: z.number().min(1, "Cajas por tarima debe ser mayor a 0"),
  tarimas: z.number().min(0, "Tarimas debe ser mayor o igual a 0"),
  stickers: z.number().min(0, "Stickers debe ser mayor o igual a 0"),
  conversionMatch: z.boolean(),
});

// ===== SCHEMA PARA DATOS DE RECEPCIÓN COMPLETOS =====
export const ReceptionDataSchema = z.object({
  folio: z.string().min(1, "Folio es requerido"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  proveedor: z.string().min(1, "Proveedor es requerido"),
  proveedorLogistico: z.string().optional(),
  warehouseId: z.string().min(1, "Almacén es requerido"),
  supplierId: z.string().min(1, "Proveedor logístico es requerido"),
  total: z.string().optional(),
  lineas: z.array(ReceptionLineSchema).min(1, "Debe haber al menos una línea"),
  tarimasTotal: z.number().min(1, "Total de tarimas debe ser mayor a 0"),
  conversiones: z.array(ConversionSchema),
});

// ===== VALIDADORES DE TIPO =====
export type ReceptionDoc = z.infer<typeof ReceptionDocSchema>;
export type ReceptionLine = z.infer<typeof ReceptionLineSchema>;
export type Conversion = z.infer<typeof ConversionSchema>;
export type ReceptionData = z.infer<typeof ReceptionDataSchema>;

/**
 * Validación de datos de recepción
 *
 * @param data - Datos a validar
 * @returns Resultado de validación
 */
export function validateReceptionData(data: any): {
  valid: boolean;
  errors?: string[];
} {
  try {
    const parsed = ReceptionDataSchema.parse(data);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => `${err.path.join(".")}: ${err.message}`);
      return { valid: false, errors };
    }
    return { valid: false, errors: ["Error de validación desconocido"] };
  }
}

/**
 * Validación de documento de recepción
 *
 * @param data - Datos del documento
 * @returns Resultado de validación
 */
export function validateReceptionDoc(data: any): {
  valid: boolean;
  errors?: string[];
} {
  try {
    const parsed = ReceptionDocSchema.parse(data);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => `${err.path.join(".")}: ${err.message}`);
      return { valid: false, errors };
    }
    return { valid: false, errors: ["Error de validación desconocido"] };
  }
}

/**
 * Validación de línea de recepción
 *
 * @param data - Datos de la línea
 * @returns Resultado de validación
 */
export function validateReceptionLine(data: any): {
  valid: boolean;
  errors?: string[];
} {
  try {
    const parsed = ReceptionLineSchema.parse(data);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => `${err.path.join(".")}: ${err.message}`);
      return { valid: false, errors };
    }
    return { valid: false, errors: ["Error de validación desconocido"] };
  }
}
