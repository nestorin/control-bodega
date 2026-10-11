import { describe, expect, it } from "vitest"
import { canCreateExtraPallet } from "./CapturaTarima"

describe("extra pallet authorization", () => {
  it.each(["ADMIN", "SUPERVISOR"])("allows active %s memberships", (role) => {
    expect(canCreateExtraPallet("ACTIVE", role)).toBe(true)
  })

  it.each([
    ["UNAUTHENTICATED", "ADMIN"],
    ["INACTIVE", "ADMIN"],
    ["ACTIVE", "OPERATOR"],
    ["ACTIVE", undefined],
  ])("denies %s/%s", (status, role) => {
    expect(canCreateExtraPallet(status, role)).toBe(false)
  })
})
