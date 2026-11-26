import { describe, it, expect, vi, beforeEach } from "vitest";

// The Firestore SDK is mocked at module level: this suite exercises the
// client-side service behaviour, not the security rules (those are covered by
// the emulator suite). `setDoc` is asserted directly; no read-back is expected
// because an admin cannot `get` another member's document.
const mocks = vi.hoisted(() => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: mocks.doc,
    setDoc: mocks.setDoc,
  };
});

import { UserMembershipService } from "../../services/firestore/domainServices";

const orgId = "org_exepa_001";
const targetUid = "member_user_001";

function buildService(): UserMembershipService {
  return new UserMembershipService({} as any, orgId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.doc.mockReturnValue({ path: ["organizations", orgId, "users", targetUid] });
});

describe("UserMembershipService.createMembership", () => {
  it("writes the membership document directly without read-back", async () => {
    await buildService().createMembership({
      userId: targetUid,
      role: "ALMACENISTA",
      status: "ACTIVE",
      warehouseId: null,
      warehouseIds: ["wh_tehuacan_1", "piloto-1"],
      displayName: "Ana Operadora",
      email: "ana@example.com",
      actorUserId: "admin_uid",
      operationId: "op-create-1",
    });

    // doc(db, "organizations", orgId, "users", userId)
    expect(mocks.doc).toHaveBeenCalledWith(
      expect.anything(),
      "organizations",
      orgId,
      "users",
      targetUid,
    );
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    const [, data] = mocks.setDoc.mock.calls[0];
    expect(data).toMatchObject({
      userId: targetUid,
      organizationId: orgId,
      role: "ALMACENISTA",
      status: "ACTIVE",
      warehouseId: null,
      warehouseIds: ["wh_tehuacan_1", "piloto-1"],
      displayName: "Ana Operadora",
      email: "ana@example.com",
    });
  });
});
