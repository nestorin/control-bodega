export interface ExpiryAlertLot {
  productName: string;
  lot: string;
  monthKey?: string;
  expiryDate: Date | { toDate: () => Date };
  cajas: number;
}

function asDate(value: ExpiryAlertLot["expiryDate"]): Date {
  return value instanceof Date ? value : value.toDate();
}

/**
 * Builds an operator-facing warning from persisted expiry lots only.
 * The UI deliberately does not invent alerts when the catalog is unavailable.
 */
export function buildUpcomingExpiryAlert(
  lots: ExpiryAlertLot[],
  now = new Date(),
  horizonDays = 90,
): string | null {
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
  const upcoming = lots
    .map((lot) => ({ lot, date: asDate(lot.expiryDate) }))
    .filter(({ date }) => {
      const remaining = date.getTime() - now.getTime();
      return remaining >= 0 && remaining <= horizonMs;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (!upcoming.length) return null;

  const details = upcoming
    .slice(0, 3)
    .map(({ lot, date }) => {
      const expiry = date.toLocaleDateString("es-MX", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      const lotLabel = lot.lot && lot.lot !== "SIN_LOTE" ? ` lote ${lot.lot}` : "";
      return `${lot.productName}${lotLabel} (${expiry}, ${lot.cajas} cajas)`;
    })
    .join("; ");

  const suffix = upcoming.length > 3 ? `; y ${upcoming.length - 3} lote(s) más` : "";
  return `Aviso: hay caducidades próximas en el inventario: ${details}${suffix}.`;
}
