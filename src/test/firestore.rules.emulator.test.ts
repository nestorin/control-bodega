import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing"
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  Timestamp,
} from "firebase/firestore"
import { afterAll, afterEach, beforeAll, describe, it } from "vitest"

const orgId = "org_exepa_001"
const wh1 = "wh_tehuacan_1"
const wh2 = "wh_tehuacan_2"
const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8")

let testEnv: RulesTestEnvironment | undefined
const rulesEmulatorConfigured = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const rulesTest = it.skipIf(!rulesEmulatorConfigured)

const membership = (
  uid: string,
  role: string,
  warehouseId: string | null = wh1,
) => ({
  userId: uid,
  organizationId: orgId,
  role,
  status: "ACTIVE",
  warehouseId,
})

async function seedFixtures() {
  if (!testEnv) return
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
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
      setDoc(
        doc(db, `organizations/${orgId}/users/admin-1`),
        membership("admin-1", "ADMIN", null),
      ),
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
    ])
  })
}

beforeAll(async () => {
  if (!rulesEmulatorConfigured) {
    console.warn(
      'Firestore rules tests skipped: run `firebase emulators:exec --only firestore --project demo-exepa-rules "pnpm vitest run --config vitest.rules.config.ts"`.',
    )
    return
  }

  try {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-exepa-rules",
      firestore: { rules },
    })
    await seedFixtures()
  } catch (error) {
    testEnv = undefined
    console.warn(
      "Firestore rules emulator unavailable; rules tests skipped.",
      error,
    )
  }
})

afterAll(async () => {
  if (testEnv) await testEnv.cleanup()
})

afterEach(async () => {
  if (!testEnv) return
  await testEnv.clearFirestore()
  await seedFixtures()
})

describe("Firestore security rules (emulator)", () => {
  rulesTest("allows a member to read canonical warehouse data", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore()
    await assertSucceeds(
      getDoc(doc(db, `organizations/${orgId}/warehouses/${wh1}`)),
    )
  })

  rulesTest("denies reads for unauthenticated/non-members", async () => {
    const unauthenticatedDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      getDoc(
        doc(unauthenticatedDb, `organizations/${orgId}/warehouses/${wh1}`),
      ),
    )

    const nonMemberDb = testEnv.authenticatedContext("unknown-user").firestore()
    await assertFails(
      getDoc(doc(nonMemberDb, `organizations/${orgId}/warehouses/${wh1}`)),
    )
  })

  rulesTest(
    "allows supervisor/admin lock writes and denies operator writes",
    async () => {
      const supervisorDb = testEnv
        .authenticatedContext("supervisor-1")
        .firestore()
      await assertSucceeds(
        setDoc(
          doc(
            supervisorDb,
            `organizations/${orgId}/inventory_locks/supervisor-lock`,
          ),
          {
            warehouseId: wh1,
            productId: "CB0301",
          },
        ),
      )

      const operatorDb = testEnv.authenticatedContext("operator-1").firestore()
      await assertFails(
        setDoc(
          doc(
            operatorDb,
            `organizations/${orgId}/inventory_locks/operator-lock`,
          ),
          {
            warehouseId: wh1,
            productId: "CB0301",
          },
        ),
      )

      const adminDb = testEnv.authenticatedContext("admin-1").firestore()
      await assertSucceeds(
        setDoc(
          doc(adminDb, `organizations/${orgId}/inventory_locks/admin-lock`),
          {
            warehouseId: wh2,
            productId: "CB0401",
          },
        ),
      )
      await assertSucceeds(
        deleteDoc(
          doc(adminDb, `organizations/${orgId}/inventory_locks/seed-lock`),
        ),
      )
    },
  )

  rulesTest("scopes expiry-lot access to the member warehouse", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore()
    await assertSucceeds(
      getDoc(doc(db, `organizations/${orgId}/lotes_caducidades/lot-wh1`)),
    )
    await assertFails(
      getDoc(doc(db, `organizations/${orgId}/lotes_caducidades/lot-wh2`)),
    )
  })

  rulesTest("allows reception and line creation atomically", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore()
    const receptionId = "reception-atomic"
    const now = Timestamp.now()
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
        })
        tx.set(
          doc(
            db,
            `organizations/${orgId}/receptions/${receptionId}/lines/line-1`,
          ),
          {
            id: "line-1",
            organizationId: orgId,
            receptionId,
            productId: "CB0301",
            quantity: 1,
            unit: "cajas",
            palletsCreated: 0,
            createdAt: now,
            updatedAt: now,
          },
        )
      }),
    )
  })

  rulesTest(
    "denies a line write through a reception in another warehouse",
    async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await setDoc(
          doc(db, `organizations/${orgId}/receptions/reception-wh2`),
          {
            id: "reception-wh2",
            organizationId: orgId,
            warehouseId: wh2,
            status: "DRAFT",
            operationId: "op-wh2",
            actorUserId: "operator-1",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
        )
      })

      const db = testEnv.authenticatedContext("operator-1").firestore()
      await assertFails(
        setDoc(
          doc(
            db,
            `organizations/${orgId}/receptions/reception-wh2/lines/line-1`,
          ),
          {
            id: "line-1",
            organizationId: orgId,
            receptionId: "reception-wh2",
            productId: "CB0301",
            quantity: 1,
            unit: "cajas",
            palletsCreated: 0,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
        ),
      )
    },
  )

  rulesTest("denies client-created inventory movements", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore()
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
    )
  })

  rulesTest("denies client-created audit events", async () => {
    const db = testEnv.authenticatedContext("operator-1").firestore()
    await assertFails(
      setDoc(doc(db, `organizations/${orgId}/audit_events/forged-event`), {
        organizationId: orgId,
        actorUserId: "operator-1",
        action: "FORGED_ADMIN_ACTION",
        entityType: "shipment",
        entityId: "shipment-1",
        metadata: "untrusted",
      }),
    )
  })

  rulesTest(
    "denies shipment updates that smuggle fields with a valid transition",
    async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(
            context.firestore(),
            `organizations/${orgId}/shipments/shipment-1`,
          ),
          {
            organizationId: orgId,
            warehouseId: wh1,
            status: "PROGRAMMED",
            lines: [],
          },
        )
      })

      const db = testEnv.authenticatedContext("operator-1").firestore()
      await assertFails(
        updateDoc(doc(db, `organizations/${orgId}/shipments/shipment-1`), {
          status: "IN_PROGRESS",
          lines: [],
          forgedPrivilege: true,
        }),
      )
    },
  )

  rulesTest(
    "denies a tarima created against another warehouse's embarque",
    async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(
            context.firestore(),
            `organizations/${orgId}/embarques/embarque-wh2`,
          ),
          {
            organizationId: orgId,
            warehouseId: wh2,
            status: "planned",
            totalTarimas: 1,
            tarimasCompletadas: 0,
          },
        )
      })

      const db = testEnv.authenticatedContext("operator-1").firestore()
      await assertFails(
        setDoc(
          doc(
            db,
            `organizations/${orgId}/embarques/embarque-wh2/tarimas/tarima-1`,
          ),
          {
            id: "tarima-1",
            organizationId: orgId,
            warehouseId: wh2,
            embarqueId: "embarque-wh2",
            status: "pending",
          },
        ),
      )
    },
  )
})
