import { describe, expect, it } from "vitest"
import { validateShipmentCompletion } from "./domainServices"
import type { ShipmentDoc } from "./types"

const shipment = (
  overrides: Partial<ShipmentDoc> = {},
): Pick<ShipmentDoc, "status" | "lines"> => ({
  status: "PROGRAMMED",
  lines: [
    {
      productId: "prod-1",
      quantity: 2,
      unit: "cajas",
      palletsScanned: ["pallet-1", "pallet-2"],
    },
  ],
  ...overrides,
})

describe("shipment completion stock guard", () => {
  it("allows a fully scanned shipment with sufficient stock", () => {
    expect(() =>
      validateShipmentCompletion(shipment(), new Map([["prod-1", 2]])),
    ).not.toThrow()
  })

  it("rejects insufficient stock before any completion write", () => {
    expect(() =>
      validateShipmentCompletion(shipment(), new Map([["prod-1", 1]])),
    ).toThrow(/Stock insuficiente/)
  })

  it("rejects duplicate confirmation", () => {
    expect(() =>
      validateShipmentCompletion(
        shipment({ status: "COMPLETED" }),
        new Map([["prod-1", 99]]),
      ),
    ).toThrow(/ya está completado/)
  })

  it("rejects a concurrent confirmation after the first transaction completes", () => {
    expect(() =>
      validateShipmentCompletion(
        shipment({ status: "COMPLETED" }),
        new Map([["prod-1", 0]]),
      ),
    ).toThrow(/ya está completado/)
  })
})
