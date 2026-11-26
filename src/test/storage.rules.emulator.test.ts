import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

const orgId = "org_exepa_001";
const warehouseId = "wh_tehuacan_1";
const receptionId = "storage-reception";
const shipmentId = "storage-shipment";
const evidencePath = `organizations/${orgId}/warehouses/${warehouseId}/receptions/${receptionId}/evidence/trailer.jpg`;
const shipmentEvidencePath = `organizations/${orgId}/warehouses/${warehouseId}/shipments/${shipmentId}/evidence/invoice.jpg`;
const legacyPreviewPath = `receptions/${receptionId}/invoice-preview.jpeg`;

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
    await setDoc(doc(db, `organizations/${orgId}/users/other-warehouse-user`), {
      userId: "other-warehouse-user",
      organizationId: orgId,
      status: "ACTIVE",
      role: "ALMACENISTA",
      warehouseId: "wh_tehuacan_2",
    });
    await setDoc(doc(db, `organizations/${orgId}/users/admin-user`), {
      userId: "admin-user",
      organizationId: orgId,
      status: "ACTIVE",
      role: "ADMIN",
    });
    await setDoc(doc(db, `organizations/${orgId}/shipments/${shipmentId}`), {
      organizationId: orgId,
      warehouseId,
      status: "IN_PROGRESS",
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

  it("allows a scoped PDF document but not PDFs in photo slots", async () => {
    const storage = testEnv.authenticatedContext("warehouse-user").storage();
    const documentPath = evidencePath.replace("trailer.jpg", "documentation.pdf");
    await assertSucceeds(
      uploadBytes(ref(storage, documentPath), new Uint8Array([1]), {
        contentType: "application/pdf",
      }),
    );
    await assertFails(
      uploadBytes(
        ref(storage, evidencePath.replace("trailer.jpg", "trailer.pdf")),
        new Uint8Array([1]),
        {
          contentType: "application/pdf",
        },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, documentPath.replace(warehouseId, "wh_tehuacan_2")),
        new Uint8Array([1]),
        {
          contentType: "application/pdf",
        },
      ),
    );
  });

  it("allows scoped shipment images and rejects wrong warehouses and file names", async () => {
    const storage = testEnv.authenticatedContext("warehouse-user").storage();
    const shipmentPath = `organizations/${orgId}/warehouses/${warehouseId}/shipments/${shipmentId}/evidence/invoice.jpg`;
    await assertSucceeds(
      uploadBytes(ref(storage, shipmentPath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    await assertFails(
      uploadBytes(
        ref(storage, shipmentPath.replace(warehouseId, "wh_tehuacan_2")),
        new Uint8Array([1]),
        { contentType: "image/jpeg" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, shipmentPath.replace("invoice.jpg", "arbitrary.jpg")),
        new Uint8Array([1]),
        { contentType: "image/jpeg" },
      ),
    );
  });

  it("denies anonymous reads of reception and shipment evidence", async () => {
    const uploader = testEnv.authenticatedContext("warehouse-user").storage();
    await assertSucceeds(
      uploadBytes(ref(uploader, evidencePath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    await assertSucceeds(
      uploadBytes(ref(uploader, shipmentEvidencePath), new Uint8Array([1]), {
        contentType: "image/jpeg",
      }),
    );
    const anonymous = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anonymous, evidencePath)));
    await assertFails(getBytes(ref(anonymous, shipmentEvidencePath)));
  });

  it("lets a warehouse member read evidence but denies a member of another warehouse", async () => {
    const uploader = testEnv.authenticatedContext("warehouse-user").storage();
    await assertSucceeds(
      uploadBytes(ref(uploader, evidencePath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    const member = testEnv.authenticatedContext("warehouse-user").storage();
    await assertSucceeds(getBytes(ref(member, evidencePath)));
    const otherMember = testEnv.authenticatedContext("other-warehouse-user").storage();
    await assertFails(getBytes(ref(otherMember, evidencePath)));
  });

  it("denies deletion to roles outside the admin list", async () => {
    const storage = testEnv.authenticatedContext("warehouse-user").storage();
    await assertSucceeds(
      uploadBytes(ref(storage, evidencePath), new Uint8Array([1]), { contentType: "image/jpeg" }),
    );
    await assertFails(deleteObject(ref(storage, evidencePath)));
    await assertSucceeds(
      uploadBytes(ref(storage, shipmentEvidencePath), new Uint8Array([1]), {
        contentType: "image/jpeg",
      }),
    );
    await assertFails(deleteObject(ref(storage, shipmentEvidencePath)));
  });

  it("accepts legacy .jpeg previews from the actor and blocks non-actor deletes", async () => {
    const actorStorage = testEnv
      .authenticatedContext("claim-admin", { superAdmin: true })
      .storage();
    const adminStorage = testEnv.authenticatedContext("admin-user").storage();

    await assertSucceeds(
      uploadBytes(ref(actorStorage, legacyPreviewPath), new Uint8Array([1]), {
        contentType: "image/jpeg",
      }),
    );
    await assertFails(deleteObject(ref(adminStorage, legacyPreviewPath)));
  });
});
