/**
 * Conversion Calculator — God Component Refactor Phase 5
 *
 * Pure domain functions for conversions, stickers, and pallet distribution.
 * Zero React dependencies - pure TypeScript functions.
 * Uses types from @/types (MatchedProduct, ConversionProps, ConversionTableRow).
 */

import type {
  MatchedProduct,
  ConversionProps,
  ConversionTableRow,
} from '@/types';

// ============================================
// Pure Functions
// ============================================

/**
 * Calculates conversion table rows with sticker distribution for matched products.
 *
 * @param matchedProducts - Products that have been matched to catalog (confirmado/sugerido/manual)
 * @param conversionProps - Conversion properties per product (piezasPorCaja, cajasPorTarima)
 * @returns Array of ConversionTableRow with stickers distributed per unit
 */
export function calculateConversionesYStickers(
  matchedProducts: MatchedProduct[],
  conversionProps: ConversionProps
): ConversionTableRow[] {
  return matchedProducts
    .filter((p) => p.productId && p.originalQuantity > 0)
    .map((product) => {
      const { piezasPorCaja, cajasPorTarima } = conversionProps;

      // Original quantity is assumed to be in the original unit (cajas)
      const originalQuantity = product.originalQuantity;
      const originalUnit = product.originalUnit;

      // Calculate pallets needed
      const tarimas = Math.ceil(originalQuantity / cajasPorTarima);

      // Distribute boxes across pallets
      const boxesPerPallet = distributeCajasPerTarima(
        { quantity: originalQuantity },
        tarimas
      );

      // Create sticker entries for each pallet
      const stickers = boxesPerPallet.map((boxes, index) => ({
        qrPayload: `${product.productId}-${index + 1}`.padStart(10, '0'),
        quantity: boxes,
      }));

      return {
        productId: product.productId!,
        productName: product.productName,
        originalUnit,
        originalQuantity,
        conversions: [
          {
            unit: 'tarima',
            quantity: tarimas,
            stickers,
          },
        ],
      };
    });
}

/**
 * Calculates total pallets from conversion table.
 *
 * @param conversionesTabla - Array of conversion table rows
 * @returns Total number of pallets (0 for empty array)
 */
export function calculateTotalTarimas(conversionesTabla: ConversionTableRow[]): number {
  return conversionesTabla.reduce((sum, row) => {
    const tarimas = row.conversions[0]?.quantity ?? 0;
    return sum + tarimas;
  }, 0);
}

/**
 * Distributes boxes evenly across pallets.
 * Returns array where each element is the number of boxes for that pallet.
 * Difference between any two pallets is at most 1.
 *
 * @param conversion - Conversion data with quantity
 * @param tarimas - Number of pallets to distribute across
 * @returns Array of box counts per pallet
 */
export function distributeCajasPerTarima(
  conversion: { quantity: number },
  tarimas: number
): number[] {
  if (tarimas <= 0) return [];
  if (conversion.quantity <= 0) return Array(tarimas).fill(0);

  const totalBoxes = conversion.quantity;
  const baseBoxesPerPallet = Math.floor(totalBoxes / tarimas);
  const remainder = totalBoxes % tarimas;

  // Distribute remainder: first 'remainder' pallets get +1 box
  return Array.from({ length: tarimas }, (_, i) =>
    baseBoxesPerPallet + (i < remainder ? 1 : 0)
  );
}

/**
 * Calculates stickers needed for a given number of pallets.
 * Each pallet requires 4 stickers (2 Cara A + 2 Cara B).
 *
 * @param tarimas - Number of pallets
 * @returns Total stickers needed
 */
export function calculateStickers(tarimas: number): number {
  return tarimas * 4;
}

/**
 * Finds conversion properties for a product by name.
 *
 * @param productName - Name of the product
 * @param catalog - Array of conversion catalog entries
 * @returns ConversionProps or default if not found
 */
export function findConversionProps(
  productName: string,
  catalog: Array<{ producto: string; piezasPorCaja: number; cajasPorTarima: number }>
): ConversionProps {
  const match = catalog.find(
    (c) => c.producto.trim().toUpperCase() === productName.trim().toUpperCase()
  );

  return match
    ? { piezasPorCaja: match.piezasPorCaja, cajasPorTarima: match.cajasPorTarima }
    : { piezasPorCaja: 1, cajasPorTarima: 10 }; // Default: 10 boxes per pallet
}

/**
 * Builds conversion table from reception products and catalog.
 * Main entry point for NuevaRecepcionStep1 → CapturaTarima flow.
 *
 * @param productos - Reception products with match status (from UI state)
 * @param catalogoConversiones - Conversion catalog from Firestore
 * @returns ConversionTableRow[] for display and sticker generation
 */
export function buildConversionTable(
  productos: Array<{
    productId: string | null;
    codigo: string | null;
    nombre: string;
    unidad: string | null;
    cantidad: number;
    estadoMatch: 'confirmado' | 'sugerido' | 'manual';
  }>,
  catalogoConversiones: Array<{ producto: string; piezasPorCaja: number; cajasPorTarima: number }>
): Array<{
  producto: string;
  productId?: string | null;
  codigo: string;
  unidades: number;
  unidad: string;
  piezasPorCaja: number;
  cajasPorTarima: number;
  cajas: number;
  tarimas: number;
  stickers: number;
  conversionMatch: boolean;
}> {
  return productos
    .filter((p) => p.estadoMatch === 'confirmado' && p.productId)
    .map((product) => {
      const conversion = findConversionProps(product.nombre, catalogoConversiones);
      const cajas = product.cantidad; // Assuming quantity is in boxes
      const tarimas = Math.ceil(cajas / conversion.cajasPorTarima);
      const stickers = tarimas * 4;

      return {
        producto: product.nombre,
        productId: product.productId,
        codigo: product.codigo ?? '',
        unidades: cajas * conversion.piezasPorCaja,
        unidad: product.unidad ?? 'cajas',
        piezasPorCaja: conversion.piezasPorCaja,
        cajasPorTarima: conversion.cajasPorTarima,
        cajas,
        tarimas,
        stickers,
        conversionMatch: catalogoConversiones.some(
          (c) => c.producto.trim().toUpperCase() === product.nombre.trim().toUpperCase()
        ),
      };
    });
}