import { describe, expect, it } from "vitest"
import {
  canTransitionReception,
  transitionReception,
  type ReceptionSession,
} from "@/domains/reception/useReceptionSession"

const session: ReceptionSession = {
  phase: "PROGRAMMING",
  data: {
    receptionId: "rec-1",
    folio: "REC-1",
    warehouseId: "wh_tehuacan_1",
    provider: "p",
    logisticsProvider: "l",
    productIds: ["prod-1"],
    totalPallets: 1,
  },
}

describe("ReceptionSession state machine", () => {
  it("allows the agreed happy path and blocks jumps", () => {
    expect(canTransitionReception("PROGRAMMING", "REVIEW")).toBe(true)
    expect(canTransitionReception("EVIDENCE", "PALLETS")).toBe(true)
    expect(canTransitionReception("PROGRAMMING", "PALLETS")).toBe(false)
    expect(
      transitionReception({ ...session, phase: "EVIDENCE" }, "PALLETS").phase,
    ).toBe("PALLETS")
    expect(canTransitionReception("PALLETS", "CONFIRMED")).toBe(true)
    expect(canTransitionReception("CONFIRMED", "COMPLETED")).toBe(true)
    expect(canTransitionReception("COMPLETED", "EVIDENCE")).toBe(false)
  })

  it("rejects a transition without a stable session", () => {
    expect(() =>
      transitionReception({ phase: "PROGRAMMING", data: null }, "REVIEW"),
    ).toThrow("Invalid reception transition")
  })
})
