import { describe, expect, it } from "vitest";
import { resolveOfflineQueuePath } from "@/hooks/useFirestore";

describe("offline queue reception paths", () => {
  const collectionPath = "organizations/{orgId}/receptions";

  it.each(["create", "update", "delete"])(
    "resolves the organization path for %s operations",
    (type) => {
      const operation = { type, collectionPath };

      expect(resolveOfflineQueuePath(operation.collectionPath, "org-123")).toBe(
        "organizations/org-123/receptions",
      );
    },
  );

  it("replaces every organization token in a path", () => {
    expect(resolveOfflineQueuePath("organizations/{orgId}/receptions/{orgId}", "org-123")).toBe(
      "organizations/org-123/receptions/org-123",
    );
  });

  it("rejects unresolved path tokens", () => {
    expect(() =>
      resolveOfflineQueuePath("organizations/{orgId}/receptions/{receptionId}", "org-123"),
    ).toThrow("unresolved token");
  });
});
