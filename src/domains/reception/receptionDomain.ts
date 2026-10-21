/**
 * Reception Domain Service - Lógica pura de dominio
 *
 * NO depende de React, Firebase, ni UI.
 * Solo TypeScript puro - testeable unitariamente.
 *
 * USA TIPOS COMPARTIDOS de @/types/domain
 */

import type {
  ReceptionLineState,
  ReceptionConversion,
  ReceptionDraft,
  ValidationResult,
  ConversionProp,
  CATALOGO_CONVERSIONES_DEFAULT,
  OcrProduct,
  Producto,
} from "@/types/domain";

import { CATALOGO_CONVERSIONES_DEFAULT as CATALOGO } from "@/types/domain";

// Re-exportar tipos compartidos para compatibilidad
export type {
  ReceptionLineState,
  ReceptionConversion,
  ReceptionDraft,
  ValidationResult,
  ConversionProp,
  OcrProduct,
  Producto,
} from "@/types/domain";

export { CATALOGO_CONVERSIONES_DEFAULT } from "@/types/domain";

// ===== MAPPER OCR → ReceptionLineState =====

/**
 * Convierte productos OCR a líneas de recepción (con match contra catálogo)
 *
 * Esta es la función principal que usa el hook para procesar OCR.
 */
export function ocrProductsToMatchedProducts(
  ocrProducts: OcrProduct[],
  catalogProducts: Producto[],
): ReceptionLineState[] {
  return ocrProducts
    .filter((p) => p.cantidad > 0 && p.nombre.trim().length > 0)
    .map((ocrProduct) => {
      // Buscar coincidencia en catálogo (case-insensitive + código)
      const match = catalogProducts.find(
        (cat) =>
          cat.nombre.toUpperCase() === ocrProduct.nombre.toUpperCase() ||
          (ocrProduct.codigo &&
            (cat.codigosProveedor ?? []).some(
              (cp) => cp.toUpperCase() === ocrProduct.codigo!.toUpperCase(),
            )),
      );

      return {
        productId: match?.id ?? null,
        codigo: ocrProduct.codigo,
        nombre: ocrProduct.nombre,
        unidad: ocrProduct.unidad,
        cantidad: ocrProduct.cantidad,
        precio: ocrProduct.precio,
        importe: ocrProduct.importe,
        estadoMatch: match ? "confirmado" : "sugerido",
      };
    });
}

/**
 * Convierte productos OCR crudos (sin catálogo) a líneas de recepción
 * Usado cuando no hay catálogo disponible.
 */
export function ocrProductsToReceptionLines(ocrProducts: OcrProduct[]): ReceptionLineState[] {
  return ocrProducts
    .filter((p) => p.cantidad > 0 && p.nombre.trim().length > 0)
    .map((ocrProduct) => ({
      productId: null,
      codigo: ocrProduct.codigo,
      nombre: ocrProduct.nombre,
      unidad: ocrProduct.unidad,
      cantidad: ocrProduct.cantidad,
      precio: ocrProduct.precio,
      importe: ocrProduct.importe,
      estadoMatch: "sugerido",
    }));
}

// ===== CÁLCULOS DE CONVERSIÓN =====

/**
 * Calcula conversiones y stickers para productos confirmados
 */
export function calculateConversions(
  matchedProducts: ReceptionLineState[],
  conversionCatalog: ConversionProp[] = CATALOGO,
): ReceptionConversion[] {
  return matchedProducts
    .filter((p) => p.estadoMatch === "confirmado" && p.productId)
    .map((product) => {
      // Buscar conversión por nombre de producto (defensivo contra undefined)
      const conversion = conversionCatalog.find(
        (c) => c?.producto?.trim?.().toUpperCase() === product.nombre?.trim?.().toUpperCase(),
      );

      const cajasPorTarima = conversion?.cajasPorTarima ?? 10;
      const cajas = product.cantidad; // asumimos cantidad ya está en cajas
      const tarimas = Math.ceil(cajas / cajasPorTarima);
      const stickers = tarimas * 4; // 4 stickers por tarima

      return {
        producto: product.nombre,
        codigo: product.codigo,
        unidades: product.cantidad * (conversion?.piezasPorCaja ?? 1),
        cajas,
        cajasPorTarima,
        tarimas,
        stickers,
        conversionMatch: !!conversion,
      };
    });
}

/**
 * Calcula total de tarimas
 */
export function calculateTotalTarimas(conversions: ReceptionConversion[]): number {
  return conversions.reduce((sum, c) => sum + c.tarimas, 0);
}

// ===== CONSTRUCCIÓN DE DRAFT =====

/**
 * Construye el draft final para persistencia
 *
 * Recibe el estado del wizard y produce un ReceptionDraft validado.
 * Calcula conversiones a partir de las líneas confirmadas.
 */
export function buildReceptionDraft(
  state: {
    folio: string | null;
    fecha: string | null;
    proveedor: string | null;
    total: string | null;
    productos: OcrProduct[] | ReceptionLineState[];
    warehouseId: string | null;
    supplierId: string | null;
    tarimasTotal: number;
    conversiones: ReceptionConversion[];
  },
  catalogProductsOrConversions?: Producto[] | ConversionProp[],
  conversionCatalog?: ConversionProp[],
): ReceptionDraft {
  const catalog = conversionCatalog ?? CATALOGO;
  const products = state.productos;
  const catalogProducts =
    Array.isArray(catalogProductsOrConversions) &&
    catalogProductsOrConversions.length > 0 &&
    "nombre" in catalogProductsOrConversions[0]
      ? (catalogProductsOrConversions as Producto[])
      : [];
  const lines: ReceptionLineState[] =
    products.length > 0 && "linea" in products[0]
      ? ocrProductsToMatchedProducts(products as OcrProduct[], catalogProducts)
      : (products as ReceptionLineState[]);

  // Calcular conversiones a partir de líneas confirmadas
  const conversions = calculateConversions(lines, catalog);
  const tarimasTotal = calculateTotalTarimas(conversions);

  return {
    folio: state.folio,
    fecha: state.fecha,
    proveedor: state.proveedor,
    total: state.total,
    lineas: lines,
    warehouseId: state.warehouseId,
    supplierId: state.supplierId,
    tarimasTotal,
    conversiones: conversions,
  };
}

// ===== VALIDACIONES DE DOMINIO =====

export function validateReceptionDraft(draft: ReceptionDraft): ValidationResult {
  const errors: string[] = [];

  if (!draft.folio || draft.folio.trim() === "") {
    errors.push("Folio es requerido");
  }

  if (!draft.fecha || draft.fecha.trim() === "") {
    errors.push("Fecha es requerida");
  }

  if (!draft.proveedor || draft.proveedor.trim() === "") {
    errors.push("Proveedor es requerido");
  }

  if (!draft.warehouseId) {
    errors.push("Almacén es requerido");
  }

  if (!draft.supplierId) {
    errors.push("Proveedor logístico es requerido");
  }

  if (draft.lineas.length === 0) {
    errors.push("Debe haber al menos un producto");
  }

  const productosSinCantidad = draft.lineas.filter((l) => l.cantidad <= 0);
  if (productosSinCantidad.length > 0) {
    errors.push(`${productosSinCantidad.length} producto(s) sin cantidad`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
