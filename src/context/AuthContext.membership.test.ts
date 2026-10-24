import { describe, expect, it } from "vitest";
import { canAccessWarehouseForProfile, isValidMembership, type UserProfile } from "./AuthContext";

const activeMember: UserProfile = {
  userId: "user-1",
  organizationId: "org_exepa_001",
  role: "OPERATOR",
  warehouseId: "wh_tehuacan_1",
  status: "ACTIVE",
};

describe("organization membership authorization", () => {
  it("accepts an active membership from the canonical organization path", () => {
    expect(isValidMembership(activeMember, "user-1")).toBe(true);
    expect(canAccessWarehouseForProfile("ACTIVE", activeMember, "wh_tehuacan_1")).toBe(true);
  });

  it("rejects a membership for another user or organization", () => {
    expect(isValidMembership({ ...activeMember, userId: "user-2" }, "user-1")).toBe(false);
    expect(isValidMembership({ ...activeMember, organizationId: "other-org" }, "user-1")).toBe(
      false,
    );
  });

  it("denies inactive or missing memberships", () => {
    expect(
      canAccessWarehouseForProfile(
        "INACTIVE",
        { ...activeMember, status: "INACTIVE" },
        "wh_tehuacan_1",
      ),
    ).toBe(false);
    expect(canAccessWarehouseForProfile("UNAUTHENTICATED", null, "wh_tehuacan_1")).toBe(false);
  });

  it("rejects pending memberships because sign-up provisions active access directly", () => {
    const pendingMember = {
      userId: "pending-user",
      organizationId: "org_exepa_001",
      role: "AUXILIAR_ALMACENISTA",
      warehouseId: null,
      warehouseIds: [],
      status: "PENDING",
    };

    expect(isValidMembership(pendingMember, "pending-user")).toBe(false);
  });

  it("accepts an active manager membership with both canonical warehouses", () => {
    const manager: UserProfile = {
      ...activeMember,
      role: "GERENTE_ALMACEN",
      warehouseId: null,
      warehouseIds: ["wh_tehuacan_1", "wh_tehuacan_2"],
    };

    expect(isValidMembership(manager, "user-1")).toBe(true);
    expect(canAccessWarehouseForProfile("ACTIVE", manager, "wh_tehuacan_1")).toBe(true);
    expect(canAccessWarehouseForProfile("ACTIVE", manager, "wh_tehuacan_2")).toBe(true);
    expect(canAccessWarehouseForProfile("ACTIVE", manager, "warehouse-1")).toBe(true);
  });

  it("keeps legacy role aliases compatible", () => {
    const legacy = { ...activeMember, role: "SUPERVISOR" as const };
    const canonical = { ...activeMember, role: "GERENTE_ALMACEN" as const };

    expect(isValidMembership(legacy, "user-1")).toBe(true);
    expect(canAccessWarehouseForProfile("ACTIVE", canonical, "wh_tehuacan_1")).toBe(true);
  });

  it("does not grant scoped members access to an unassigned warehouse", () => {
    const scoped: UserProfile = {
      ...activeMember,
      role: "AUXILIAR_ALMACENISTA",
      warehouseId: null,
      warehouseIds: ["wh_tehuacan_1"],
    };

    expect(canAccessWarehouseForProfile("ACTIVE", scoped, "wh_tehuacan_2")).toBe(false);
  });
});
