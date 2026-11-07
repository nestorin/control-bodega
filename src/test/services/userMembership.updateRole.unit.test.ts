import { describe, it, expect, vi, beforeEach } from "vitest";

// The Firestore SDK is mocked at module level: this suite exercises the
// client-side service behaviour, not the security rules (those are covered by
// src/test/services/userMembership.updateRole.test.ts against the emulator).
const mocks = vi.hoisted(() => ({
  txUpdate: vi.fn(),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    doc: vi.fn((ref: unknown, id: string) => ({ id, ref })),
    serverTimestamp: vi.fn(() => "server-timestamp"),
    getDoc: mocks.getDoc,
    runTransaction: mocks.runTransaction,
  };
});

import { UserMembershipService } from "../../services/firestore/domainServices";

const orgId = "org_exepa_001";
const targetUid = "member_user_001";

function permissionDenied(): Error {
  const error = new Error("Missing or insufficient permissions.");
  (error as Error & { code: string }).code = "permission-denied";
  return error;
}

function buildService(): UserMembershipService {
  return new UserMembershipService({} as any, orgId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runTransaction.mockImplementation(
    async (_db: unknown, fn: (tx: unknown) => Promise<void>) =>
      fn({ update: mocks.txUpdate, get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
  );
  mocks.getDoc.mockRejectedValue(permissionDenied());
});

describe("UserMembershipService.updateRole", () => {
  it("resolves even when the updated membership cannot be read back", async () => {
    // Rules allow an admin to UPDATE another member's membership but only let
    // a member GET their own document. The write commits first, so a denied
    // read-back must not be reported to the caller as a failed role change.
    const result = await buildService().updateRole(targetUid, "SUPERVISOR", "admin_uid", "op-1");

    expect(result).toMatchObject({ id: targetUid, role: "SUPERVISOR" });
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejected write instead of masking it", async () => {
    mocks.runTransaction.mockRejectedValue(permissionDenied());

    await expect(
      buildService().updateRole(targetUid, "SUPERVISOR", "admin_uid", "op-2"),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("reports a status change as successful with the same read-back rules", async () => {
    const result = await buildService().updateStatus(targetUid, "INACTIVE", "admin_uid", "op-3");

    expect(result).toMatchObject({ id: targetUid, status: "INACTIVE" });
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
  });
});
