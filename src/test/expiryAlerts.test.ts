import { describe, expect, it } from "vitest"
import { buildUpcomingExpiryAlert } from "@/services/expiryAlerts"

describe("buildUpcomingExpiryAlert", () => {
  const now = new Date("2026-10-04T00:00:00Z")

  it("uses persisted lots and orders the nearest expiry first", () => {
    const alert = buildUpcomingExpiryAlert(
      [
        {
          productName: "Leche",
          lot: "SIN_LOTE",
          expiryDate: new Date("2026-12-01T00:00:00Z"),
          cajas: 12,
        },
        {
          productName: "Coca Cola",
          lot: "L-2",
          expiryDate: new Date("2026-11-01T00:00:00Z"),
          cajas: 3,
        },
      ],
      now,
    )

    expect(alert).toContain("Coca Cola lote L-2")
    expect(alert).toContain("Leche")
    expect(alert?.indexOf("Coca Cola")).toBeLessThan(
      alert?.indexOf("Leche") ?? 0,
    )
  })

  it("does not create alerts for expired or distant lots", () => {
    expect(
      buildUpcomingExpiryAlert(
        [
          {
            productName: "Producto vencido",
            lot: "L-1",
            expiryDate: new Date("2026-09-01T00:00:00Z"),
            cajas: 1,
          },
          {
            productName: "Producto lejano",
            lot: "L-2",
            expiryDate: new Date("2027-02-01T00:00:00Z"),
            cajas: 1,
          },
        ],
        now,
      ),
    ).toBeNull()
  })

  it("supports Firestore Timestamp-like values", () => {
    const alert = buildUpcomingExpiryAlert(
      [
        {
          productName: "Producto",
          lot: "L-1",
          expiryDate: { toDate: () => new Date("2026-12-01T00:00:00Z") },
          cajas: 4,
        },
      ],
      now,
    )
    expect(alert).toContain("Producto")
  })
})
