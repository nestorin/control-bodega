#!/usr/bin/env tsx
/**
 * Audit and optionally copy legacy root documents into the organization scope.
 *
 * Safe default: audit only. Use --apply together with
 * ALLOW_LEGACY_MIGRATION=1 to write non-destructive merge copies. This script
 * never deletes or mutates the legacy source documents.
 *
 * Examples:
 *   pnpm tsx scripts/audit-legacy-firestore.ts
 *   ALLOW_LEGACY_MIGRATION=1 pnpm tsx scripts/audit-legacy-firestore.ts --apply
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";

const ORG_ID = process.env.FIREBASE_ORG_ID ?? "org_exepa_001";
const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const APPLY_GUARD = process.env.ALLOW_LEGACY_MIGRATION === "1";

const LEGACY_COLLECTIONS = [
  "users",
  "warehouses",
  "suppliers",
  "products",
  "conversions",
  "purchase_orders",
  "receptions",
  "shipments",
  "inventory",
  "inventory_movements",
  "lotes_caducidades",
] as const;

type AuditRecord = {
  sourcePath: string;
  targetPath: string;
  status: "already_scoped" | "eligible" | "skipped";
  reason?: string;
};

function getDb() {
  const app = getApps()[0] ?? initializeApp();
  return getFirestore(app);
}

function targetData(data: DocumentData, sourcePath: string) {
  return {
    ...data,
    organizationId: ORG_ID,
    _legacyAudit: {
      sourcePath,
      auditedAt: Timestamp.now(),
      migratedBy: "audit-legacy-firestore",
    },
  };
}

async function main() {
  if (APPLY && !APPLY_GUARD) {
    throw new Error("Refusing --apply without ALLOW_LEGACY_MIGRATION=1");
  }

  const db = getDb();
  const records: AuditRecord[] = [];
  const writes: Array<{ path: string; data: DocumentData }> = [];

  console.log(`${DRY_RUN ? "DRY-RUN" : "APPLY"}: auditing legacy root collections for ${ORG_ID}`);

  for (const collectionName of LEGACY_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    for (const document of snapshot.docs) {
      const sourcePath = document.ref.path;
      const targetPath = `organizations/${ORG_ID}/${collectionName}/${document.id}`;
      const data = document.data();

      if (data.organizationId === ORG_ID) {
        records.push({ sourcePath, targetPath, status: "already_scoped" });
        continue;
      }

      // Do not guess an organization for documents explicitly scoped elsewhere.
      if (typeof data.organizationId === "string" && data.organizationId.length > 0) {
        records.push({
          sourcePath,
          targetPath,
          status: "skipped",
          reason: `already belongs to ${data.organizationId}`,
        });
        continue;
      }

      records.push({ sourcePath, targetPath, status: "eligible" });
      writes.push({ path: targetPath, data: targetData(data, sourcePath) });
    }
  }

  if (APPLY) {
    for (let index = 0; index < writes.length; index += 400) {
      const batch = db.batch();
      for (const write of writes.slice(index, index + 400)) {
        batch.set(db.doc(write.path), write.data, { merge: true });
      }
      await batch.commit();
    }
  }

  console.log(
    JSON.stringify(
      {
        organizationId: ORG_ID,
        mode: DRY_RUN ? "dry-run" : "apply",
        scanned: records.length,
        eligible: writes.length,
        written: APPLY ? writes.length : 0,
        records,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("Legacy audit failed:", error);
  process.exitCode = 1;
});
