#!/usr/bin/env tsx
/**
 * Restore the createdAt/updatedAt timestamp contract on legacy inventory-movement documents.
 *
 * Dry-run is the default. Only documents missing createdAt are eligible, and
 * existing createdAt/updatedAt values are never overwritten.
 *
 * The timestamp is taken from the document's own `occurredAt` (the event time)
 * when present, so the backfill is deterministic and meaningful; otherwise the
 * current time is used.
 *
 * Usage:
 *   npx tsx scripts/backfill-movement-timestamps.ts --dry-run
 *   FIREBASE_PROJECT_ID=exepa-almacen-safe npx tsx scripts/backfill-movement-timestamps.ts --dry-run
 *   FIREBASE_PROJECT_ID=exepa-almacen-safe FIREBASE_ORG_ID=org_exepa_001 \
 *     ALLOW_MOVEMENT_TIMESTAMP_BACKFILL=1 npx tsx scripts/backfill-movement-timestamps.ts --apply
 */
import { pathToFileURL } from "node:url";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ORGANIZATION_ID } from "../src/config/constants";

const DEFAULT_PROJECT_ID = "exepa-almacen-safe";

type TimestampPlan = {
  documentId: string;
  sourceDate: string | null;
  timestamp: Timestamp;
  timestampSource: "occurredAt" | "now";
  fields: Array<"createdAt" | "updatedAt">;
};

function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? DEFAULT_PROJECT_ID;
  const app = getApps()[0] ?? initializeApp({ projectId });
  return getFirestore(app);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value?.startsWith("--")) return undefined;
  return value;
}

function timestampFromOccurredAt(occurredAt: unknown): {
  timestamp: Timestamp;
  sourceDate: string | null;
  timestampSource: "occurredAt" | "now";
} {
  if (occurredAt instanceof Timestamp) {
    return {
      timestamp: occurredAt,
      sourceDate: occurredAt.toDate().toISOString(),
      timestampSource: "occurredAt",
    };
  }

  // Defensive fallback for timestamps deserialized from another SDK copy.
  if (
    typeof occurredAt === "object" &&
    occurredAt !== null &&
    typeof (occurredAt as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (occurredAt as { toDate: () => Date }).toDate();
    return {
      timestamp: Timestamp.fromDate(date),
      sourceDate: date.toISOString(),
      timestampSource: "occurredAt",
    };
  }

  return {
    timestamp: Timestamp.now(),
    sourceDate: null,
    timestampSource: "now",
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun && apply) {
    throw new Error("Use either --dry-run or --apply, not both");
  }
  if (apply && process.env.ALLOW_MOVEMENT_TIMESTAMP_BACKFILL !== "1") {
    throw new Error("Refusing --apply without ALLOW_MOVEMENT_TIMESTAMP_BACKFILL=1");
  }

  const organizationId =
    process.env.FIREBASE_ORG_ID ??
    argValue("--organization-id") ??
    argValue("--org-id") ??
    ORGANIZATION_ID;
  if (!organizationId.trim()) {
    throw new Error("Organization id must not be empty");
  }

  const db = getDb();
  const collectionRef = db.collection(`organizations/${organizationId}/inventory_movements`);
  const snapshot = await collectionRef.get();
  const plans: TimestampPlan[] = [];
  const skippedExistingTimestampIds: string[] = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    if (data.createdAt != null) {
      skippedExistingTimestampIds.push(document.id);
      continue;
    }

    const derived = timestampFromOccurredAt(data.occurredAt);
    plans.push({
      documentId: document.id,
      sourceDate: derived.sourceDate,
      timestamp: derived.timestamp,
      timestampSource: derived.timestampSource,
      fields: data.updatedAt == null ? ["createdAt", "updatedAt"] : ["createdAt"],
    });
  }

  const patchedDocumentIds: string[] = [];
  if (apply) {
    for (const plan of plans) {
      const documentRef = collectionRef.doc(plan.documentId);
      const result = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(documentRef);
        if (!current.exists || current.data().createdAt != null) return "skipped";

        const patch: Record<string, Timestamp> = { createdAt: plan.timestamp };
        if (current.data().updatedAt == null) {
          patch.updatedAt = plan.timestamp;
        }
        transaction.update(documentRef, patch);
        return "patched";
      });

      if (result === "patched") {
        patchedDocumentIds.push(plan.documentId);
      } else {
        skippedExistingTimestampIds.push(plan.documentId);
      }
    }
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    organizationId,
    database: "(default)",
    documentsScanned: snapshot.docs.length,
    documentsToPatch: plans.map((plan) => ({
      id: plan.documentId,
      fields: plan.fields,
      sourceDate: plan.sourceDate,
      timestamp: plan.timestamp.toDate().toISOString(),
      timestampSource: plan.timestampSource,
    })),
    patchedDocumentIds,
    skippedExistingTimestampCount: skippedExistingTimestampIds.length,
    skippedExistingTimestampIds,
    writesPerformed: patchedDocumentIds.length,
    nothingWritten: !apply,
  };

  console.log(JSON.stringify(report, null, 2));
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(
      "Movement timestamp backfill failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
