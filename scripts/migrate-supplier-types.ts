#!/usr/bin/env tsx
/**
 * Audits supplier documents with missing/invalid `tipo` and optionally repairs
 * only canonical logistics suppliers. Dry-run is the default; --apply requires
 * ALLOW_SUPPLIER_TYPE_MIGRATION=1. No document is deleted.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { CANONICAL_LOGISTICS_SUPPLIER_SEED, ORGANIZATION_ID } from "../src/config/supplierCatalog";

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.FIREBASE_ORG_ID ?? ORGANIZATION_ID;

function db() {
  const app = getApps()[0] ?? initializeApp();
  return getFirestore(app);
}

async function main() {
  if (APPLY && process.env.ALLOW_SUPPLIER_TYPE_MIGRATION !== "1") {
    throw new Error("Refusing --apply without ALLOW_SUPPLIER_TYPE_MIGRATION=1");
  }

  const canonical = new Map(
    CANONICAL_LOGISTICS_SUPPLIER_SEED.map(([id, code, name]) => [id, { code, name }]),
  );
  const snapshot = await db().collection(`organizations/${ORG_ID}/suppliers`).get();
  const candidates = snapshot.docs.flatMap((document) => {
    const expected = canonical.get(document.id);
    const data = document.data();
    if (!expected || data.tipo === "logistica") return [];
    const matchesIdentity = data.code === expected.code || data.name === expected.name;
    return matchesIdentity
      ? [{ path: document.ref.path, id: document.id, from: data.tipo ?? null }]
      : [];
  });

  if (APPLY) {
    const batch = db().batch();
    for (const candidate of candidates) {
      batch.update(db().doc(candidate.path), {
        tipo: "logistica",
        updatedAt: Timestamp.now(),
      });
    }
    if (candidates.length > 0) await batch.commit();
  }

  console.log(
    JSON.stringify(
      {
        organizationId: ORG_ID,
        mode: APPLY ? "apply" : "dry-run",
        scanned: snapshot.size,
        candidates,
        written: APPLY ? candidates.length : 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("Supplier type migration failed:", error);
  process.exitCode = 1;
});
