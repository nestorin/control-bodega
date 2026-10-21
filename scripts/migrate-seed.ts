#!/usr/bin/env node
/**
 * Firestore Migration Script - Seed from _INIT arrays
 * Run with: npx tsx scripts/migrate-seed.ts
 * Idempotent: uses merge: true to upsert by ID
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, WriteBatch } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIGURATION
// ============================================================

const ORG_ID = "org_exepa_001"; // Main organization ID
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "../serviceAccountKey.json");

// Check for service account
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("❌ serviceAccountKey.json not found at:", SERVICE_ACCOUNT_PATH);
  console.error("   Download from Firebase Console > Project Settings > Service Accounts");
  process.exit(1);
}

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
const app =
  getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

// ============================================================
// SEED DATA (extracted from _INIT arrays in source code)
// ============================================================

const seedData = {
  warehouses: [
    { id: "wh_tehuacan_1", code: "WH-TEHUACAN-1", name: "Tehuacan-1" },
    { id: "wh_tehuacan_2", code: "WH-TEHUACAN-2", name: "Tehuacan-2" },
  ],
  suppliers: [
    { id: "prov_norte", code: "PROV-001", name: "Distribuidora del Norte" },
    { id: "prov_sur", code: "PROV-002", name: "Logística Sur SA" },
  ],
  products: [
    {
      id: "prod_cocacola",
      sku: "COC-600ML",
      name: "Coca Cola 600ml",
      unit: "cajas",
      lotControlled: true,
      expiryControlled: true,
      conversionFactor: 24,
    },
    {
      id: "prod_sabritas",
      sku: "SAB-45G",
      name: "Sabritas 45g",
      unit: "cajas",
      lotControlled: true,
      expiryControlled: true,
      conversionFactor: 48,
    },
    {
      id: "prod_agua",
      sku: "AGUA-500ML",
      name: "Agua Natural 500ml",
      unit: "cajas",
      lotControlled: false,
      expiryControlled: true,
      conversionFactor: 20,
    },
    {
      id: "prod_galleta",
      sku: "GAL-100G",
      name: "Galletas 100g",
      unit: "cajas",
      lotControlled: true,
      expiryControlled: true,
      conversionFactor: 36,
    },
  ],
  purchaseOrders: [
    {
      id: "po_001",
      warehouseId: "wh_tehuacan_1",
      supplierId: "prov_norte",
      number: "OC-24891",
      status: "OPEN",
      lines: [
        { productId: "prod_cocacola", orderedQuantity: 100, unit: "cajas" },
        { productId: "prod_sabritas", orderedQuantity: 50, unit: "cajas" },
      ],
    },
    {
      id: "po_002",
      warehouseId: "wh_tehuacan_2",
      supplierId: "prov_sur",
      number: "OC-24892",
      status: "OPEN",
      lines: [
        { productId: "prod_agua", orderedQuantity: 200, unit: "cajas" },
        { productId: "prod_galleta", orderedQuantity: 75, unit: "cajas" },
      ],
    },
  ],
  receptions: [
    {
      id: "rec_001",
      warehouseId: "wh_tehuacan_1",
      purchaseOrderId: "po_001",
      status: "CONFIRMED",
      operationId: "REC-20260927-001",
      actorUserId: "system",
      receivedAt: Timestamp.now(),
      lines: [
        {
          productId: "prod_cocacola",
          quantity: 100,
          unit: "cajas",
          lot: "LOT-COC-202609",
          expiryDate: Timestamp.fromDate(new Date("2027-03-01")),
          boxesPerPallet: 25,
          palletCount: 4,
        },
        {
          productId: "prod_sabritas",
          quantity: 50,
          unit: "cajas",
          lot: "LOT-SAB-202609",
          expiryDate: Timestamp.fromDate(new Date("2027-02-15")),
          boxesPerPallet: 10,
          palletCount: 5,
        },
      ],
    },
    {
      id: "rec_002",
      warehouseId: "wh_tehuacan_2",
      purchaseOrderId: "po_002",
      status: "IN_PROGRESS",
      operationId: "REC-20260927-002",
      actorUserId: "system",
      lines: [
        {
          productId: "prod_agua",
          quantity: 200,
          unit: "cajas",
          lot: "LOT-AGU-202609",
          expiryDate: Timestamp.fromDate(new Date("2027-12-01")),
          boxesPerPallet: 40,
          palletCount: 5,
        },
        {
          productId: "prod_galleta",
          quantity: 75,
          unit: "cajas",
          lot: "LOT-GAL-202609",
          expiryDate: Timestamp.fromDate(new Date("2027-01-20")),
          boxesPerPallet: 15,
          palletCount: 5,
        },
      ],
    },
  ],
  shipments: [
    {
      id: "emb_001",
      warehouseId: "wh_tehuacan_1",
      clientName: "Cliente Mayorista ABC",
      status: "COMPLETED",
      lines: [
        {
          productId: "prod_cocacola",
          quantity: 20,
          unit: "cajas",
          palletsScanned: ["TQR-OC-001", "TQR-OC-002"],
        },
      ],
    },
  ],
};

// ============================================================
// MIGRATION FUNCTIONS
// ============================================================

function getOrgRef() {
  return db.collection("organizations").doc(ORG_ID);
}

function getCollectionRef(collectionName: string) {
  return getOrgRef().collection(collectionName);
}

async function migrateOrganization() {
  console.log("📦 Migrating organization...");
  const batch = db.batch();
  const ref = getOrgRef();
  batch.set(
    ref,
    {
      name: "EXEPA - Exportadora de Abarrotes del Pacífico",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
  await batch.commit();
  console.log("   ✅ Organization migrated");
}

async function migrateWarehouses() {
  console.log("🏭 Migrating warehouses...");
  const batch = db.batch();
  for (const w of seedData.warehouses) {
    const ref = getCollectionRef("warehouses").doc(w.id);
    batch.set(
      ref,
      {
        organizationId: ORG_ID,
        code: w.code,
        name: w.name,
        createdAt: Timestamp.now(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`   ✅ ${seedData.warehouses.length} warehouses migrated`);
}

async function migrateSuppliers() {
  console.log("🚚 Migrating suppliers...");
  const batch = db.batch();
  for (const s of seedData.suppliers) {
    const ref = getCollectionRef("suppliers").doc(s.id);
    batch.set(
      ref,
      {
        organizationId: ORG_ID,
        code: s.code,
        name: s.name,
        createdAt: Timestamp.now(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`   ✅ ${seedData.suppliers.length} suppliers migrated`);
}

async function migrateProducts() {
  console.log("📦 Migrating products...");
  const batch = db.batch();
  for (const p of seedData.products) {
    const ref = getCollectionRef("products").doc(p.id);
    batch.set(
      ref,
      {
        organizationId: ORG_ID,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        lotControlled: p.lotControlled,
        expiryControlled: p.expiryControlled,
        conversionFactor: p.conversionFactor,
        createdAt: Timestamp.now(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`   ✅ ${seedData.products.length} products migrated`);
}

async function migratePurchaseOrders() {
  console.log("📋 Migrating purchase orders...");
  const batch = db.batch();
  for (const po of seedData.purchaseOrders) {
    const ref = getCollectionRef("purchase_orders").doc(po.id);
    batch.set(
      ref,
      {
        organizationId: ORG_ID,
        warehouseId: po.warehouseId,
        supplierId: po.supplierId,
        number: po.number,
        status: po.status,
        lines: po.lines,
        createdAt: Timestamp.now(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`   ✅ ${seedData.purchaseOrders.length} purchase orders migrated`);
}

async function migrateReceptions() {
  console.log("📥 Migrating receptions...");
  const batch = db.batch();

  for (const rec of seedData.receptions) {
    const receptionRef = getCollectionRef("receptions").doc(rec.id);
    const { lines, ...receptionData } = rec;

    batch.set(
      receptionRef,
      {
        organizationId: ORG_ID,
        ...receptionData,
        receivedAt: rec.receivedAt || null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    // Migrate reception lines
    for (const [lineIndex, line] of lines.entries()) {
      const lineRef = receptionRef
        .collection("lines")
        .doc(`line_${rec.id}_${String(lineIndex + 1).padStart(3, "0")}`);
      batch.set(
        lineRef,
        {
          receptionId: rec.id,
          productId: line.productId,
          quantity: line.quantity,
          unit: line.unit,
          lot: line.lot,
          expiryDate: line.expiryDate,
          palletsCreated: line.palletCount,
          createdAt: Timestamp.now(),
        },
        { merge: true },
      );
    }
  }

  await batch.commit();
  console.log(`   ✅ ${seedData.receptions.length} receptions migrated with lines`);
}

async function migratePallets() {
  console.log("📦 Migrating pallets (generating unique QR codes)...");
  const batch = db.batch();
  let palletCounter = 1;

  for (const rec of seedData.receptions) {
    for (const line of rec.lines) {
      for (let i = 0; i < line.palletCount; i++) {
        const palletId = `pallet_${rec.id}_${palletCounter}`;
        const qrIdentifier = `TQR-${rec.operationId.split("-")[1]}-${String(palletCounter).padStart(3, "0")}`;

        const palletRef = getCollectionRef("receptions")
          .doc(rec.id)
          .collection("pallets")
          .doc(palletId);
        batch.set(
          palletRef,
          {
            id: palletId,
            organizationId: ORG_ID,
            warehouseId: rec.warehouseId,
            receptionId: rec.id,
            qrIdentifier, // UNIQUE per pallet - fixes the bug!
            status: rec.status === "CONFIRMED" ? "RECEIVED" : "CREATED",
            productId: line.productId,
            quantity: line.boxesPerPallet,
            unit: "cajas",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );

        // Inventory movement RECEIPT
        const movementRef = getCollectionRef("inventory_movements").doc(
          `movement_${rec.id}_${palletId}_receipt`,
        );
        batch.set(
          movementRef,
          {
            organizationId: ORG_ID,
            warehouseId: rec.warehouseId,
            palletId,
            productId: line.productId,
            movementType: "RECEIPT",
            quantity: line.boxesPerPallet,
            unit: "cajas",
            lot: line.lot,
            expiryDate: line.expiryDate,
            operationId: rec.operationId,
            actorUserId: "migration",
            occurredAt: Timestamp.now(),
          },
          { merge: true },
        );

        palletCounter++;
      }
    }
  }

  await batch.commit();
  console.log(`   ✅ ${palletCounter - 1} pallets migrated with unique QR codes`);
}

async function migrateShipments() {
  console.log("🚛 Migrating shipments...");
  const batch = db.batch();

  for (const ship of seedData.shipments) {
    const shipmentRef = getCollectionRef("shipments").doc(ship.id);
    batch.set(
      shipmentRef,
      {
        organizationId: ORG_ID,
        warehouseId: ship.warehouseId,
        clientName: ship.clientName,
        status: ship.status,
        lines: ship.lines,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    // Inventory movements for shipment
    for (const line of ship.lines) {
      for (const palletQR of line.palletsScanned) {
        // Find pallet by QR
        const palletSnap = await getCollectionRef("receptions")
          .doc("rec_001") // simplified - in reality would query by QR
          .collection("pallets")
          .where("qrIdentifier", "==", palletQR)
          .limit(1)
          .get();

        if (!palletSnap.empty) {
          const palletDoc = palletSnap.docs[0];
          const palletData = palletDoc.data();

          const movementRef = getCollectionRef("inventory_movements").doc(
            `movement_${ship.id}_${line.productId}_${palletQR}_shipment`,
          );
          batch.set(
            movementRef,
            {
              organizationId: ORG_ID,
              warehouseId: ship.warehouseId,
              palletId: palletDoc.id,
              productId: line.productId,
              movementType: "SHIPMENT",
              quantity: line.quantity / line.palletsScanned.length,
              unit: line.unit,
              operationId: `EMB-${ship.id}`,
              actorUserId: "migration",
              occurredAt: Timestamp.now(),
            },
            { merge: true },
          );
        }
      }
    }
  }

  await batch.commit();
  console.log(`   ✅ ${seedData.shipments.length} shipments migrated`);
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log("🚀 Starting Firestore migration (idempotent seed)...\n");

  try {
    await migrateOrganization();
    await migrateWarehouses();
    await migrateSuppliers();
    await migrateProducts();
    await migratePurchaseOrders();
    await migrateReceptions();
    await migratePallets();
    await migrateShipments();

    console.log("\n✅ Migration completed successfully!");
    console.log("   Run again anytime - it's idempotent (merge: true)");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
