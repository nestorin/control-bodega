import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  Timestamp,
  collectionGroup,
  query,
  where,
  limit,
  documentId,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

const orgId = "org_exepa_001";
const wh1 = "wh_tehuacan_1";
const wh2 = "wh_tehuacan_2";
const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

let testEnv: RulesTestEnvironment | undefined;
const rulesEmulatorConfigured = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesTest = it.skipIf(!rulesEmulatorConfigured);

const membership = (uid: string, role: string, warehouseId: string | null = wh1) => ({
  userId: uid,
  organizationId: orgId,
  role,
  status: "ACTIVE",
  warehouseId,
});

async function seedFixtures() {
  if (!testEnv) return;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `organizations/${orgId}/warehouses/${wh1}`), {
        id: wh1,
        organizationId: orgId,
        name: "Tehuacan-1",
      }),
      setDoc(doc(db, `organizations/${orgId}/warehouses/${wh2}`), {
        id: wh2,
        organizationId: orgId,
        name: "Tehuacan-2",
      }),
      setDoc(
        doc(db, `organizations/${orgId}/users/supervisor-1`),
        membership("supervisor-1", "SUPERVISOR"),
      ),
      setDoc(
        doc(db, `organizations/${orgId}/users/operator-1`),
        membership("operator-1", "OPERATOR"),
      ),
      setDoc(doc(db, `organizations/${orgId}/users/admin-1`), membership("admin-1", "ADMIN", null)),
      ...[
        "SUPER_ADMIN",
        "GERENTE_ALMACEN",
        "AUXILIAR_ALMACENISTA",
        "AUDITOR",
        "OPERATOR",
        "SUPERVISOR",
      ].map((role, i) =>
        setDoc(doc(db, `organizations/${orgId}/users/role-${i}`), membership(`role-${i}`, role)),
      ),
      ...[
        { id: "pallet-wh1", org: orgId, warehouse: wh1 },
        { id: "pallet-wh2", org: orgId, warehouse: wh2 },
        { id: "pallet-other-org", org: "other-org", warehouse: wh1 },
      ].map(({ id, org, warehouse }) =>
        setDoc(doc(db, `organizations/${org}/receptions/rec-${id}/pallets/${id}`), {
          id,
          organizationId: org,
          warehouseId: warehouse,
          receptionId: `rec-${id}`,
          qrIdentifier: id,
        }),
      ),
      setDoc(doc(db, `organizations/${orgId}/users/inactive-1`), {
        ...membership("inactive-1", "OPERATOR"),
        status: "INACTIVE",
      }),
      setDoc(doc(db, `organizations/${orgId}/inventory_locks/seed-lock`), {
        warehouseId: wh1,
        productId: "CB0301",
      }),
      setDoc(doc(db, `organizations/${orgId}/lotes_caducidades/lot-wh1`), {
        warehouseId: wh1,
        productId: "CB0302",
        cantidadCajas: 1,
      }),
      setDoc(doc(db, `organizations/${orgId}/lotes_caducidades/lot-wh2`), {
        warehouseId: wh2,
        productId: "CB0302",
        cantidadCajas: 1,
      }),
    ]);
  });
}

beforeAll(async () => {
  if (!rulesEmulatorConfigured) {
    console.warn(
      'Firestore rules tests skipped: run `firebase emulators:exec --only firestore --project demo-exepa-rules "pnpm vitest run --config vitest.rules.config.ts"`.',
    );
    return;
  }

  try {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-exepa-rules",
      firestore: { rules },
    });
    await seedFixtures();
  } catch (error) {
    testEnv = undefined;
    console.warn("Firestore rules emulator unavailable; rules tests skipped.", error);
  }
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

afterEach(async () => {
  if (!testEnv) return;
  await testEnv.clearFirestore();
  await seedFixtures();
});

describe("Firestore security rules (emulator)", () => {
  rulesTest("denies client creation of membership records", async () => {
    const db = testEnv!.authenticatedContext("pending-user").firestore();
    const membershipRef = doc(db, `organizations/${orgId}/users/pending-user`);

    await assertFails(
      setDoc(membershipRef, {
        userId: "pending-user",
        organizationId: orgId,
        role: "AUXILIAR_ALMACENISTA",
        status: "PENDING",
        warehouseId: null,
        warehouseIds: [],
        createdAt: serverTimestamp(),
      }),
    );
  });

  rulesTest("denies same-user attempts to self-grant membership access or add fields", async () => {
    const exactPendingMembership = (uid: string) => ({
      userId: uid,
      organizationId: orgId,
      role: "AUXILIAR_ALMACENISTA",
      status: "PENDING",
      warehouseId: null,
      warehouseIds: [],
      createdAt: serverTimestamp(),
    });
    const attempts: Array<{ uid: string; override: Record<string, unknown> }> = [
      { uid: "self-active", override: { status: "ACTIVE" } },
      { uid: "self-admin", override: { role: "ADMIN" } },
      { uid: "self-warehouse", override: { warehouseId: wh1, warehouseIds: [wh1] } },
      { uid: "self-extra-field", override: { untrusted: true } },
    ];

    for (const { uid, override } of attempts) {
      const db = testEnv!.authenticatedContext(uid).firestore();
      await assertFails(
        setDoc(doc(db, `organizations/${orgId}/users/${uid}`), {
          ...exactPendingMembership(uid),
          ...override,
        }),
      );
    }
  });

  rulesTest("retains revoked memberships by denying deletion even to admins", async () => {
    const adminDb = testEnv!.authenticatedContext("admin-1").firestore();
    await assertFails(deleteDoc(doc(adminDb, `organizations/${orgId}/users/operator-1`)));
    await assertFails(deleteDoc(doc(adminDb, `organizations/${orgId}/users/admin-1`)));
  });

  rulesTest(
    "requires authenticated active organization and authorized warehouse plus a bounded query",
    async () => {
      const path = collectionGroup(
        testEnv!.authenticatedContext("operator-1").firestore(),
        "pallets",
      );
      const scoped = query(
        path,
        where("organizationId", "==", orgId),
        where("warehouseId", "==", wh1),
        limit(43),
      );
      await assertSucceeds(getDocs(scoped));
      await assertSucceeds(
        getDoc(
          doc(
            testEnv!.authenticatedContext("operator-1").firestore(),
            `organizations/${orgId}/receptions/rec-pallet-wh1/pallets/pallet-wh1`,
          ),
        ),
      );
      await assertFails(
        getDocs(
          query(
            path,
            where("organizationId", "==", orgId),
            where("warehouseId", "==", wh2),
            limit(43),
          ),
        ),
      );
      await assertFails(getDocs(query(path, where("organizationId", "==", orgId), limit(43))));
      await assertFails(
        getDocs(
          query(
            path,
            where("organizationId", "==", "other-org"),
            where("warehouseId", "==", wh1),
            limit(43),
          ),
        ),
      );
      await assertFails(
        getDocs(query(path, where("organizationId", "==", orgId), where("warehouseId", "==", wh1))),
      );
      await assertFails(
        getDocs(
          query(
            path,
            where("organizationId", "==", orgId),
            where("warehouseId", "==", wh1),
            limit(44),
          ),
        ),
      );
      await assertFails(
        getDocs(
          query(
            collectionGroup(testEnv!.unauthenticatedContext().firestore(), "pallets"),
            where("organizationId", "==", orgId),
            where("warehouseId", "==", wh1),
            limit(43),
          ),
        ),
      );
      const inactive = testEnv!.authenticatedContext("inactive-1").firestore();
      await assertFails(
        getDocs(
          query(
            collectionGroup(inactive, "pallets"),
            where("organizationId", "==", orgId),
            where("warehouseId", "==", wh1),
            limit(43),
          ),
        ),
      );
      await assertFails(
        getDoc(
          doc(
            testEnv!.unauthenticatedContext().firestore(),
            `organizations/${orgId}/receptions/rec-pallet-wh1/pallets/pallet-wh1`,
          ),
        ),
      );
      await assertFails(
        getDoc(
          doc(
            testEnv!.authenticatedContext("operator-1").firestore(),
            `organizations/${orgId}/receptions/rec-pallet-wh2/pallets/pallet-wh2`,
          ),
        ),
      );
      for (let i = 0; i < 6; i++) {
        const db = testEnv!.authenticatedContext(`role-${i}`).firestore();
        await assertSucceeds(
          getDocs(
            query(
              collectionGroup(db, "pallets"),
              where("organizationId", "==", orgId),
              where("warehouseId", "==", wh1),
              limit(43),
            ),
          ),
        );
      }
      const adminDb = testEnv!.authenticatedContext("admin-1").firestore();
      await assertSucceeds(
        getDocs(
          query(
            collectionGroup(adminDb, "pallets"),
            where("organizationId", "==", orgId),
            where("warehouseId", "==", wh2),
            limit(43),
          ),
        ),
      );
    },
  );

  rulesTest("allows a member to read canonical warehouse data", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertSucceeds(getDoc(doc(db, `organizations/${orgId}/warehouses/${wh1}`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `organizations/${orgId}/warehouses`),
          where(documentId(), "in", [wh1, wh2]),
        ),
      ),
    );
  });

  rulesTest("denies reads for unauthenticated/non-members", async () => {
    const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthenticatedDb, `organizations/${orgId}/warehouses/${wh1}`)));
    await assertFails(
      getDocs(
        query(
          collection(unauthenticatedDb, `organizations/${orgId}/warehouses`),
          where(documentId(), "in", [wh1, wh2]),
        ),
      ),
    );

    const nonMemberDb = testEnv.authenticatedContext("unknown-user").firestore();
    await assertFails(getDoc(doc(nonMemberDb, `organizations/${orgId}/warehouses/${wh1}`)));
    await assertFails(
      getDocs(
        query(
          collection(nonMemberDb, `organizations/${orgId}/warehouses`),
          where(documentId(), "in", [wh1, wh2]),
        ),
      ),
    );
  });

  rulesTest("allows supervisor/admin lock writes and denies operator writes", async () => {
    const supervisorDb = testEnv.authenticatedContext("supervisor-1").firestore();
    await assertSucceeds(
      setDoc(doc(supervisorDb, `organizations/${orgId}/inventory_locks/supervisor-lock`), {
        warehouseId: wh1,
        productId: "CB0301",
      }),
    );

    const operatorDb = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      setDoc(doc(operatorDb, `organizations/${orgId}/inventory_locks/operator-lock`), {
        warehouseId: wh1,
        productId: "CB0301",
      }),
    );

    const adminDb = testEnv.authenticatedContext("admin-1").firestore();
    await assertSucceeds(
      setDoc(doc(adminDb, `organizations/${orgId}/inventory_locks/admin-lock`), {
        warehouseId: wh2,
        productId: "CB0401",
      }),
    );
    await assertSucceeds(
      deleteDoc(doc(adminDb, `organizations/${orgId}/inventory_locks/seed-lock`)),
    );
  });

  rulesTest("scopes expiry-lot access to the member warehouse", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertSucceeds(getDoc(doc(db, `organizations/${orgId}/lotes_caducidades/lot-wh1`)));
    await assertFails(getDoc(doc(db, `organizations/${orgId}/lotes_caducidades/lot-wh2`)));
  });

  rulesTest("allows reception and line creation atomically", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore();
    const receptionId = "reception-atomic";
    const now = Timestamp.now();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        tx.set(doc(db, `organizations/${orgId}/receptions/${receptionId}`), {
          id: receptionId,
          organizationId: orgId,
          warehouseId: wh1,
          status: "DRAFT",
          operationId: "op-atomic",
          actorUserId: "operator-1",
          createdAt: now,
          updatedAt: now,
        });
        tx.set(doc(db, `organizations/${orgId}/receptions/${receptionId}/lines/line-1`), {
          id: "line-1",
          organizationId: orgId,
          receptionId,
          productId: "CB0301",
          quantity: 1,
          unit: "cajas",
          palletsCreated: 0,
          createdAt: now,
          updatedAt: now,
        });
      }),
    );
  });

  rulesTest("denies reception creation without createdAt", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      setDoc(doc(db, `organizations/${orgId}/receptions/reception-no-created-at`), {
        id: "reception-no-created-at",
        organizationId: orgId,
        warehouseId: wh1,
        status: "DRAFT",
        operationId: "op-no-created-at",
        actorUserId: "operator-1",
        updatedAt: Timestamp.now(),
      }),
    );
  });

  rulesTest("denies a line write through a reception in another warehouse", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `organizations/${orgId}/receptions/reception-wh2`), {
        id: "reception-wh2",
        organizationId: orgId,
        warehouseId: wh2,
        status: "DRAFT",
        operationId: "op-wh2",
        actorUserId: "operator-1",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      setDoc(doc(db, `organizations/${orgId}/receptions/reception-wh2/lines/line-1`), {
        id: "line-1",
        organizationId: orgId,
        receptionId: "reception-wh2",
        productId: "CB0301",
        quantity: 1,
        unit: "cajas",
        palletsCreated: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  rulesTest("denies client-created inventory movements", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      setDoc(doc(db, `organizations/${orgId}/inventory_movements/forged-in`), {
        organizationId: orgId,
        warehouseId: wh1,
        productId: "CB0301",
        movementType: "RECEIPT",
        direction: "IN",
        quantity: 999999,
        actorUserId: "operator-1",
      }),
    );
  });

  rulesTest("denies client-created audit events", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      setDoc(doc(db, `organizations/${orgId}/audit_events/forged-event`), {
        organizationId: orgId,
        actorUserId: "operator-1",
        action: "FORGED_ADMIN_ACTION",
        entityType: "shipment",
        entityId: "shipment-1",
        metadata: "untrusted",
      }),
    );
  });

  rulesTest("denies shipment updates that smuggle fields with a valid transition", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `organizations/${orgId}/shipments/shipment-1`), {
        organizationId: orgId,
        warehouseId: wh1,
        status: "PROGRAMMED",
        lines: [],
      });
    });

    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      updateDoc(doc(db, `organizations/${orgId}/shipments/shipment-1`), {
        status: "IN_PROGRESS",
        lines: [],
        forgedPrivilege: true,
      }),
    );
  });

  rulesTest("denies a tarima created against another warehouse's embarque", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `organizations/${orgId}/embarques/embarque-wh2`), {
        organizationId: orgId,
        warehouseId: wh2,
        status: "planned",
        totalTarimas: 1,
        tarimasCompletadas: 0,
      });
    });

    const db = testEnv.authenticatedContext("operator-1").firestore();
    await assertFails(
      setDoc(doc(db, `organizations/${orgId}/embarques/embarque-wh2/tarimas/tarima-1`), {
        id: "tarima-1",
        organizationId: orgId,
        warehouseId: wh2,
        embarqueId: "embarque-wh2",
        status: "pending",
      }),
    );
  });

  describe("open sign-up self-provisioning", () => {
    const userPath = (uid: string) => `organizations/${orgId}/users/${uid}`;
    const provisionedProfile = (uid: string, overrides: Record<string, unknown> = {}) => ({
      userId: uid,
      organizationId: orgId,
      role: "GERENTE_ALMACEN",
      status: "ACTIVE",
      warehouseIds: [wh1, wh2],
      displayName: "Nuevo Usuario",
      email: "nuevo@example.com",
      ...overrides,
    });

    rulesTest("lets a brand-new user provision an immediately usable profile", async () => {
      const db = testEnv!.authenticatedContext("new-user-1").firestore();
      await assertSucceeds(
        setDoc(doc(db, userPath("new-user-1")), provisionedProfile("new-user-1")),
      );
    });

    rulesTest("denies self-provisioning when unauthenticated", async () => {
      const db = testEnv!.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(db, userPath("anon-1")), provisionedProfile("anon-1")));
    });

    rulesTest("denies self-provisioning for another uid", async () => {
      const db = testEnv!.authenticatedContext("attacker-1").firestore();
      await assertFails(setDoc(doc(db, userPath("victim-1")), provisionedProfile("victim-1")));
    });

    rulesTest("denies a pending status because there is no approval queue", async () => {
      const db = testEnv!.authenticatedContext("new-user-2").firestore();
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-2")),
          provisionedProfile("new-user-2", { status: "PENDING" }),
        ),
      );
    });

    rulesTest("denies self-elevation to admin or super admin", async () => {
      const db = testEnv!.authenticatedContext("new-user-3").firestore();
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-3")),
          provisionedProfile("new-user-3", { role: "ADMIN" }),
        ),
      );
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-4")),
          provisionedProfile("new-user-4", { role: "SUPER_ADMIN" }),
        ),
      );
    });

    rulesTest("denies narrowing or widening the warehouse scope", async () => {
      const db = testEnv!.authenticatedContext("new-user-5").firestore();
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-5")),
          provisionedProfile("new-user-5", { warehouseIds: [wh1] }),
        ),
      );
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-6")),
          provisionedProfile("new-user-6", { warehouseIds: [wh1, wh2, "wh_other"] }),
        ),
      );
    });

    rulesTest("denies unknown fields and a non-null legacy warehouseId", async () => {
      const db = testEnv!.authenticatedContext("new-user-7").firestore();
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-7")),
          provisionedProfile("new-user-7", { isAdmin: true }),
        ),
      );
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-8")),
          provisionedProfile("new-user-8", { warehouseId: wh1 }),
        ),
      );
    });

    rulesTest("denies overlong display fields", async () => {
      const db = testEnv!.authenticatedContext("new-user-9").firestore();
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-9")),
          provisionedProfile("new-user-9", { displayName: "x".repeat(121) }),
        ),
      );
      await assertFails(
        setDoc(
          doc(db, userPath("new-user-10")),
          provisionedProfile("new-user-10", { email: `${"x".repeat(250)}@a.io` }),
        ),
      );
    });

    rulesTest("lets the owner reconcile display fields but not role or scope", async () => {
      const db = testEnv!.authenticatedContext("operator-1").firestore();
      await assertSucceeds(
        updateDoc(doc(db, userPath("operator-1")), {
          displayName: "Operador Uno",
          email: "op1@example.com",
        }),
      );
      await assertFails(updateDoc(doc(db, userPath("operator-1")), { role: "ADMIN" }));
      await assertFails(updateDoc(doc(db, userPath("operator-1")), { status: "INACTIVE" }));
      await assertFails(updateDoc(doc(db, userPath("operator-1")), { warehouseIds: [wh1, wh2] }));
    });

    rulesTest("lets an admin drive the membership lifecycle", async () => {
      const db = testEnv!.authenticatedContext("admin-1").firestore();
      await assertSucceeds(updateDoc(doc(db, userPath("operator-1")), { role: "SUPERVISOR" }));
    });

    rulesTest("denies a non-admin editing another member's lifecycle", async () => {
      const db = testEnv!.authenticatedContext("operator-1").firestore();
      await assertFails(updateDoc(doc(db, userPath("supervisor-1")), { role: "ADMIN" }));
      await assertFails(updateDoc(doc(db, userPath("supervisor-1")), { status: "INACTIVE" }));
      await assertFails(deleteDoc(doc(db, userPath("supervisor-1"))));
    });
  });
});
