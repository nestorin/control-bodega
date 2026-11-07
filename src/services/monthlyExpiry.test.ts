import { describe, expect, it } from "vitest";
import type { LotCaducidadDoc } from "./firestore/types";
import { aggregateMonthlyExpiries, expiryYears, MONTH_LABELS_ES } from "./monthlyExpiry";

function lot(productId: string, productName: string, expiryDate: string, cajas: number) {
  return {
    productId,
    productName,
    expiryDate,
    monthKey: "",
    cajas,
  } as unknown as LotCaducidadDoc;
}

describe("monthly expiration aggregation", () => {
  it("uses Spanish January–December labels and separates years", () => {
    expect(MONTH_LABELS_ES).toEqual([
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
    ]);
    const lots = [
      lot("product-1", "Agua", "2027-01-15", 10),
      lot("product-1", "Agua", "2027-01-30", 5),
      lot("product-1", "Agua", "2027-12-01", 7),
      lot("product-1", "Agua", "2028-01-01", 20),
      lot("product-2", "Leche", "2027-02-01", 3),
    ];
    expect(expiryYears(lots)).toEqual([2027, 2028]);
    expect(aggregateMonthlyExpiries(lots, 2027)).toEqual([
      {
        productId: "product-1",
        productName: "Agua",
        months: [15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
        total: 22,
      },
      {
        productId: "product-2",
        productName: "Leche",
        months: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        total: 3,
      },
    ]);
  });

  it("ignores invalid quantities and dates and supports legacy month keys", () => {
    const lots = [
      lot("product-1", "Agua", "not-a-date", 100),
      lot("product-1", "Agua", "2027-03-01", -4),
      lot("product-1", "Agua", "2027-03-01", Number.NaN),
      { ...lot("product-1", "Agua", "", 2), monthKey: "mar-27" },
    ];
    expect(aggregateMonthlyExpiries(lots, 2027)[0]).toMatchObject({ total: 2 });
    expect(aggregateMonthlyExpiries(lots, 2027)[0].months[2]).toBe(2);
  });
});
