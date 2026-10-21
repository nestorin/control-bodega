import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { updateMembership } from "./membership";

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

describe("membership backend boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls update_membership without a direct Firestore write", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { idempotent: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);

    await updateMembership({
      targetUid: "user-2",
      role: "GERENTE_ALMACEN",
      status: "ACTIVE",
      warehouseId: "wh_tehuacan_1",
      operationId: "op-membership-1",
    });

    expect(httpsCallable).toHaveBeenCalledWith(undefined, "update_membership");
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUid: "user-2",
        role: "GERENTE_ALMACEN",
        status: "ACTIVE",
        operationId: "op-membership-1",
      }),
    );
  });
});
