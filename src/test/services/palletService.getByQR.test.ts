import { type RulesTestEnvironment, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { createFirestoreServices } from "../../services/firestore";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const orgId = "org_exepa_001";
const warehouseId = "wh_tehuacan_1";
const receptionId = "rec_test_001";
const productId = "prod_test_001";
const supplierId = "prov_test_001";
const projectId = "demo-exepa-rules";

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

    // Seed organization
    await setDoc(doc(db, `organizations/${orgId}`), {
      name: "EXEPA - Exportadora de Abarrotes del Pacífico",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
    });

    // Seed warehouse
    await setDoc(doc(db, `organizations/${orgId}/warehouses/${warehouseId}`), {
      id: warehouseId,
      organizationId: orgId,
      code: "WH-TEHUACAN-1",
      name: "Tehuacan-1",
      active: true,
      createdAt: Timestamp.now(),
    });

    // Seed supplier
    await setDoc(doc(db, `organizations/${orgId}/suppliers/${supplierId}`), {
      id: supplierId,
      organizationId: orgId,
      code: "PROV-001",
      name: "Distribuidora del Norte",
      tipo: "mercancia",
      createdAt: Timestamp.now(),
    });

    // Seed product
    await setDoc(doc(db, `organizations/${orgId}/products/${productId}`), {
      id: productId,
      organizationId: orgId,
      sku: "AGUA-500ML",
      name: "Agua Natural 500ml",
      unit: "cajas",
      lotControlled: false,
      expiryControlled: true,
      conversionFactor: 20,
      createdAt: Timestamp.now(),
    });

    // Seed reception
    await setDoc(doc(db, `organizations/${orgId}/receptions/${receptionId}`), {
      id: receptionId,
      organizationId: orgId,
      warehouseId,
      purchaseOrderId: "po_test_001",
      status: "CONFIRMED",
      operationId: "REC-20260927-001",
      actorUserId: "system",
      receivedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Seed test user with operator role and warehouse access
    await setDoc(doc(db, `organizations/${orgId}/users/test-user`), {
      userId: "test-user",
      organizationId: orgId,
      role: "OPERATOR",
      status: "ACTIVE",
      warehouseId: warehouseId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Seed pallets with QR identifiers
    const pallets = [
      {
        id: "pallet_001",
        qrIdentifier: "TQR-24891-001",
        quantity: 40,
        lot: "LOT-AGU-202609",
        expiryDate: Timestamp.fromDate(new Date("2027-12-01")),
      },
      {
        id: "pallet_002",
        qrIdentifier: "TQR-24891-002",
        quantity: 40,
        lot: "LOT-AGU-202609",
        expiryDate: Timestamp.fromDate(new Date("2027-12-01")),
      },
      {
        id: "pallet_003",
        qrIdentifier: "TQR-24891-003",
        quantity: 40,
        lot: "LOT-AGU-202609",
        expiryDate: Timestamp.fromDate(new Date("2027-12-01")),
      },
    ];

    for (const pallet of pallets) {
      await setDoc(
        doc(db, `organizations/${orgId}/receptions/${receptionId}/pallets/${pallet.id}`),
        {
          id: pallet.id,
          organizationId: orgId,
          warehouseId,
          receptionId,
          qrIdentifier: pallet.qrIdentifier,
          status: "RECEIVED",
          productId,
          quantity: pallet.quantity,
          unit: "cajas",
          lot: pallet.lot,
          expiryDate: pallet.expiryDate,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      );
    }
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

describe("PalletService.getByQR (integration)", () => {
  it("returns PalletDoc when QR exists", async () => {
    const { pallets } = createFirestoreServices(
      getTestEnv().authenticatedContext("test-user").firestore(),
      orgId,
    );

    const result = await pallets.getByQR("TQR-24891-003", [warehouseId]);
    expect(result).not.toBeNull();
    expect(result?.qrIdentifier).toBe("TQR-24891-003");
    expect(result?.productId).toBe(productId);
    expect(result?.quantity).toBe(40);
    expect(result?.lot).toBe("LOT-AGU-202609");
    expect(result?.expiryDate).toBeDefined();
  });

  it("returns null when QR not found", async () => {
    const { pallets } = createFirestoreServices(
      getTestEnv().authenticatedContext("test-user").firestore(),
      orgId,
    );

    const result = await pallets.getByQR("TQR-NOTEXIST-999", [warehouseId]);
    expect(result).toBeNull();
  });

  it("returns correct pallet for different QR codes", async () => {
    const { pallets } = createFirestoreServices(
      getTestEnv().authenticatedContext("test-user").firestore(),
      orgId,
    );

    const pallet1 = await pallets.getByQR("TQR-24891-001", [warehouseId]);
    const pallet2 = await pallets.getByQR("TQR-24891-002", [warehouseId]);

    expect(pallet1?.id).toBe("pallet_001");
    expect(pallet2?.id).toBe("pallet_002");
    expect(pallet1?.qrIdentifier).toBe("TQR-24891-001");
    expect(pallet2?.qrIdentifier).toBe("TQR-24891-002");
  });
});
