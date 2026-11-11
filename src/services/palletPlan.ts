/**
 * palletPlan — shared pallet splitting rule.
 *
 * Two QR codes are printed per tarima, so the number of planned pallet records
 * must match the number of tarimas the operator expects. Creation and editing
 * must therefore derive the split with the SAME rule; otherwise editing a
 * reception silently collapses multi-tarima lines and desyncs the printed
 * labels from the stored plan.
 *
 * Rule (identical to the creation path):
 *   - when `cajasPorTarima` is known, the line is split into chunks of that
 *     size and the last chunk carries the remainder, so the per-line sum of
 *     quantities always equals the line quantity;
 *   - when it is unknown, the existing pallet count is preserved and the
 *     quantity is spread across it, so the plan never invents a packaging
 *     ratio the catalog does not state.
 *
 * The backend (`functions/receptions.py`) requires plannedPallets to be
 * non-empty, with sequential `palletNumber` starting at 1 and a `lineIndex`
 * pointing at the position of the matching entry in `lines`.
 *
 * Invalid quantities (negative, NaN, Infinity) are normalized to zero so the
 * plan never emits negative or non-finite pallet quantities.
 */

export interface PalletPlanLine {
  /** Position of this line inside the `lines` array sent to the backend. */
  lineIndex: number;
  productId: string;
  productName: string;
  /** Total quantity for the line; the sum of its pallets must equal this. */
  quantity: number;
  unit?: string;
  /** Boxes per pallet. When absent the rule falls back to `pallets`. */
  cajasPorTarima?: number;
  /** Pallet count to preserve when `cajasPorTarima` is unknown. */
  pallets?: number;
}

export interface PalletPlanEntry {
  palletNumber: number;
  lineIndex: number;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

/** Normalize a line quantity to a non-negative finite number. */
function normalizeQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

/** Number of pallets a line needs, given its boxes-per-pallet ratio. */
export function palletCountForLine(
  quantity: number,
  cajasPorTarima: number | undefined,
  fallbackPallets: number | undefined,
): number {
  const total = normalizeQuantity(quantity);
  if (cajasPorTarima && Number.isFinite(cajasPorTarima) && cajasPorTarima > 0) {
    return Math.max(1, Math.ceil(total / cajasPorTarima));
  }
  if (fallbackPallets && Number.isFinite(fallbackPallets) && fallbackPallets > 0) {
    return Math.floor(fallbackPallets);
  }
  return 1;
}

/** Spread `quantity` across `count` pallets, giving the remainder to the first ones. */
function spreadQuantity(quantity: number, count: number): number[] {
  const total = normalizeQuantity(quantity);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Build the planned pallet list for a set of reception lines.
 *
 * `palletNumber` is sequential across the whole plan (starting at 1) and
 * `lineIndex` points at the line the pallet belongs to.
 */
export function buildPalletPlan(lines: readonly PalletPlanLine[]): PalletPlanEntry[] {
  let palletNumber = 1;
  return lines.flatMap((line) => {
    const total = normalizeQuantity(line.quantity);
    const count = palletCountForLine(total, line.cajasPorTarima, line.pallets);
    const quantities =
      line.cajasPorTarima && Number.isFinite(line.cajasPorTarima) && line.cajasPorTarima > 0
        ? Array.from({ length: count }, (_, index) =>
            Math.min(
              line.cajasPorTarima as number,
              total - index * (line.cajasPorTarima as number),
            ),
          )
        : spreadQuantity(total, count);

    return quantities.map((quantity) => ({
      palletNumber: palletNumber++,
      lineIndex: line.lineIndex,
      productId: line.productId,
      productName: line.productName,
      quantity,
      unit: line.unit || "cajas",
    }));
  });
}

/**
 * Resolve `cajasPorTarima` for a product from the conversions catalog.
 *
 * The catalog is keyed by product name, so the lookup is a normalized name
 * comparison. Returns undefined when the product has no conversion entry: the
 * caller must then preserve the existing plan instead of assuming a ratio.
 */
export function findCajasPorTarima(
  productName: string,
  conversiones: readonly { producto: string; cajasPorTarima: number }[],
): number | undefined {
  const target = (productName || "").trim().toUpperCase();
  if (!target) return undefined;
  const match = conversiones.find(
    (conversion) => (conversion.producto || "").trim().toUpperCase() === target,
  );
  if (!match) return undefined;
  return Number.isFinite(match.cajasPorTarima) && match.cajasPorTarima > 0
    ? match.cajasPorTarima
    : undefined;
}
