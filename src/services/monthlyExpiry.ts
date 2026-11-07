import type { LotCaducidadDoc } from "./firestore/types";

export const MONTH_LABELS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

type ExpiryLot = Pick<
  LotCaducidadDoc,
  "productId" | "productName" | "expiryDate" | "monthKey" | "cajas"
>;

export interface MonthlyExpiryRow {
  productId: string;
  productName: string;
  months: number[];
  total: number;
}

export function expiryYearMonth(lot: ExpiryLot): { year: number; month: number } | null {
  const raw = lot.expiryDate as unknown;
  let date: Date | null = null;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      year >= 2000 &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return { year, month: month - 1 };
    }
  } else if (
    raw &&
    typeof raw === "object" &&
    "toDate" in raw &&
    typeof raw.toDate === "function"
  ) {
    date = raw.toDate();
  } else if (raw instanceof Date) {
    date = raw;
  }
  if (date && !Number.isNaN(date.getTime())) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  }
  const match = /^([a-záéíóú]{3})-(\d{2}|\d{4})$/i.exec(lot.monthKey || "");
  if (!match) return null;
  const month = MONTH_LABELS_ES.findIndex(
    (label) => label.toLowerCase() === match[1].toLowerCase(),
  );
  if (month < 0) return null;
  const year = Number(match[2]);
  return { year: year < 100 ? 2000 + year : year, month };
}

export function expiryYears(lots: ExpiryLot[]): number[] {
  return [
    ...new Set(
      lots
        .map(expiryYearMonth)
        .filter((value): value is { year: number; month: number } => value !== null)
        .map((value) => value.year),
    ),
  ].sort((a, b) => a - b);
}

export function aggregateMonthlyExpiries(lots: ExpiryLot[], year: number): MonthlyExpiryRow[] {
  const rows = new Map<string, MonthlyExpiryRow>();
  for (const lot of lots) {
    const expiry = expiryYearMonth(lot);
    if (!expiry || expiry.year !== year || !Number.isSafeInteger(lot.cajas) || lot.cajas < 0)
      continue;
    const productId = lot.productId.trim();
    const productName = lot.productName.trim();
    const key = productId || productName.toLocaleLowerCase("es-MX");
    if (!key) continue;
    const row = rows.get(key) ?? {
      productId,
      productName: productName || productId,
      months: Array(12).fill(0),
      total: 0,
    };
    const monthTotal = row.months[expiry.month] + lot.cajas;
    const total = row.total + lot.cajas;
    if (!Number.isSafeInteger(monthTotal) || !Number.isSafeInteger(total)) continue;
    row.months[expiry.month] = monthTotal;
    row.total = total;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.productName.localeCompare(b.productName, "es-MX"));
}
