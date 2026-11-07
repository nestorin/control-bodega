import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

const orgId = "org_exepa_001";
const warehouseId = "wh_tehuacan_1";
const receptionId = "storage-reception";
const evidencePath = `organizations/${orgId}/warehouses/${warehouseId}/receptions/${receptionId}/evidence/trailer.jpg`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-exepa-rules",
    firestore: { rules: readFileSync(resolve("firestore.rules"), "utf8") },
    storage: { rules: readFileSync(resolve("storage.rules"), "utf8") },
  });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `organizations/${orgId}/receptions/${receptionId}`), {
      organizationId: orgId,
      warehouseId,
      actorUserId: "claim-admin",
    });
    await setDoc(doc(db, `organizations/${orgId}/users/warehouse-user`), {
      userId: "warehouse-user",
      organizationId: orgId,
      status: "ACTIVE",
      role: "ALMACENISTA",
      warehouseId,
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("Storage security rules (emulator)", () => {
  it("accepts the backend SUPER_ADMIN claim without a membership only within the reception scope", async () => {
    const storage = testEnv.authenticatedContext("claim-admin", { superAdmin: true }).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, evidencePath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    await assertFails(
      uploadBytes(
        ref(storage, evidencePath.replace(warehouseId, "wh_tehuacan_2")),
        new Uint8Array([1]),
        { contentType: "image/jpeg" },
      ),
    );
    await assertFails(
      uploadBytes(ref(storage, evidencePath.replace(orgId, "other-org")), new Uint8Array([1]), {
        contentType: "image/jpeg",
      }),
    );
  });

  it("keeps the legacy preview path bound to the reception actor", async () => {
    const ownerStorage = testEnv
      .authenticatedContext("claim-admin", { superAdmin: true })
      .storage();
    const otherStorage = testEnv
      .authenticatedContext("other-admin", { superAdmin: true })
      .storage();
    const path = `receptions/${receptionId}/invoice-preview.jpg`;

    await assertSucceeds(
      uploadBytes(ref(ownerStorage, path), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    await assertFails(
      uploadBytes(ref(otherStorage, path), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
  });

  it("does not let an unclaimed non-member upload evidence", async () => {
    const storage = testEnv.authenticatedContext("no-member").storage();
    await assertFails(
      uploadBytes(ref(storage, evidencePath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
  });

  it("keeps ALMACENISTA upload permission without evidence deletion", async () => {
    const storage = testEnv.authenticatedContext("warehouse-user").storage();
    await assertSucceeds(
      uploadBytes(ref(storage, evidencePath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    await assertFails(deleteObject(ref(storage, evidencePath)));
  });
});
