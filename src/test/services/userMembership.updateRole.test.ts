import { type RulesTestEnvironment, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { createFirestoreServices } from "../../services/firestore";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const orgId = "org_exepa_001";
const adminUid = "admin_user_001";
const targetUid = "member_user_001";
const projectId = "demo-exepa-membership-role";

const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

let testEnv: RulesTestEnvironment | null = null;

function getTestEnv(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error("Firestore test environment was not initialized.");
  }
  return testEnv;
}

async function seedTestData(environment: RulesTestEnvironment) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, `organizations/${orgId}`), {
      name: "EXEPA - Exportadora de Abarrotes del Pacífico",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, `organizations/${orgId}/users/${adminUid}`), {
      userId: adminUid,
      organizationId: orgId,
      role: "ADMIN",
      status: "ACTIVE",
      warehouseId: null,
      displayName: "Admin",
      email: "admin@exepa.mx",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await setDoc(doc(db, `organizations/${orgId}/users/${targetUid}`), {
      userId: targetUid,
      organizationId: orgId,
      role: "ALMACENISTA",
      status: "ACTIVE",
      warehouseId: "wh_tehuacan_1",
      displayName: "Almacenista",
      email: "almacenista@exepa.mx",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
  await seedTestData(testEnv);
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("UserMembershipService.updateRole (integration)", () => {
  it("lets an admin change another member's role and reports success", async () => {
    const { userMemberships } = createFirestoreServices(
      getTestEnv().authenticatedContext(adminUid).firestore(),
      orgId,
    );

    // Regression: the write commits, but the service used to read the document
    // back with the admin's credentials. Firestore rules only allow a member to
    // `get` their OWN membership, so the read was denied AFTER the write had
    // already succeeded and the UI reported a failure for a change that persisted.
    await expect(
      userMemberships.updateRole(targetUid, "SUPERVISOR", adminUid, "op-role-change-1"),
    ).resolves.toBeTruthy();

    await getTestEnv().withSecurityRulesDisabled(async (context) => {
      const snap = await context.firestore().doc(`organizations/${orgId}/users/${targetUid}`).get();
      expect(snap.get("role")).toBe("SUPERVISOR");
    });
  });

  it("rejects a role change from a non-admin member", async () => {
    const { userMemberships } = createFirestoreServices(
      getTestEnv().authenticatedContext(targetUid).firestore(),
      orgId,
    );

    await expect(
      userMemberships.updateRole(adminUid, "AUDITOR", targetUid, "op-role-change-2"),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
