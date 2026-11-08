#!/usr/bin/env tsx
/**
 * Safely backfill missing expiry-lot projections from completed reception pallets.
 *
 * The script is intentionally additive: it never edits an existing expiry lot,
 * even when a legacy document uses a different id for the same lot identity.
 * Dry-run is the default. An apply additionally requires an explicit environment
 * guard so a copied command cannot mutate production by accident.
 *
 * Usage:
 *   pnpm backfill:expiry-lots
 *   FIREBASE_ORG_ID=org_exepa_001 pnpm backfill:expiry-lots -- --before 2026-10-24
 *   ALLOW_EXPIRY_LOT_BACKFILL=1 pnpm backfill:expiry-lots -- --apply --run-id expiry-backfill-2026-11-07
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initializeApp, getApps } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
} from "firebase-admin/firestore";

const DEFAULT_ORG_ID = "org_exepa_001";
const ACTIVE_PALLET_STATUSES = new Set(["RECEIVED", "ACTIVE"]);
const MAX_PALLETS_PER_PROJECTION = 498; // pallet markers + lot document + audit event <= 500 writes.
const MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

export type BackfillPallet = {
  path: string;
  id: string;
  data: Record<string, unknown>;
};

export type BackfillMovement = {
  id: string;
  data: Record<string, unknown>;
};

export type BackfillProjection = {
  id: string;
  identity: string;
  warehouseId: string;
  productId: string;
  productName: string;
  lot: string;
  expiryDate: string;
  monthKey: string;
  cajas: number;
  palletIds: string[];
  palletPaths: string[];
  movementIds: string[];
};

export type BackfillIssue = {
  palletPath?: string;
  projectionId?: string;
  reason: string;
};

export type BackfillPlan = {
  projections: BackfillProjection[];
  issues: BackfillIssue[];
  scannedPallets: number;
  scannedReceiptMovements: number;
};

type Candidate = Omit<BackfillProjection, "cajas" | "palletIds" | "palletPaths" | "movementIds"> & {
  palletId: string;
  palletPath: string;
  movementId: string;
  quantity: number;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function lotProjectionId(
  warehouseId: string,
  productId: string,
  lot: string,
  expiryDate: string,
): string {
  return `lot-${sha256([warehouseId, productId, lot, expiryDate].join("\0")).slice(0, 32)}`;
}

export function lotIdentity(
  warehouseId: string,
  productId: string,
  lot: string,
  expiryDate: string,
): string {
  return [warehouseId, productId, lot, expiryDate].join("\0");
}

export function expiryMonthKey(expiryDate: string): string {
  const [year, month] = expiryDate.split("-").map(Number);
  return `${MONTHS_ES[month - 1]}-${String(year).slice(-2)}`;
}

export function expiryIsoDate(value: unknown): string | null {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (!match) return null;
    const date = new Date(`${match[1]}T00:00:00.000Z`);
    return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== match[1]
      ? null
      : match[1];
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString().slice(0, 10);
  }
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return expiryIsoDate(toDate.call(value));
  }
  return null;
}

function timestampIsoDate(value: unknown): string | null {
  return expiryIsoDate(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function palletBelongsToOrganization(path: string, organizationId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 6 &&
    parts[0] === "organizations" &&
    parts[1] === organizationId &&
    parts[2] === "receptions" &&
    parts[4] === "pallets"
  );
}

function sameIfPresent(actual: unknown, expected: unknown): boolean {
  return actual == null || actual === expected;
}

/**
 * Builds only complete receipt-backed groups. A malformed or unmatched pallet
 * blocks its entire deterministic lot group, preventing a partial projection
 * that could not safely be corrected later without manual reconciliation.
 */
export function buildBackfillPlan(input: {
  organizationId: string;
  pallets: BackfillPallet[];
  receiptMovements: BackfillMovement[];
  productNames: Map<string, string>;
  existingLotIdentities: Set<string>;
  before?: string;
}): BackfillPlan {
  const issues: BackfillIssue[] = [];
  const candidates: Candidate[] = [];
  const blockedProjectionIds = new Set<string>();
  const movementsByPallet = new Map<string, BackfillMovement[]>();
  const palletIds = new Map<string, BackfillPallet[]>();

  for (const movement of input.receiptMovements) {
    const palletId = nonEmptyString(movement.data.palletId);
    if (!palletId) continue;
    const entries = movementsByPallet.get(palletId) ?? [];
    entries.push(movement);
    movementsByPallet.set(palletId, entries);
  }
  for (const pallet of input.pallets) {
    const entries = palletIds.get(pallet.id) ?? [];
    entries.push(pallet);
    palletIds.set(pallet.id, entries);
  }

  for (const pallet of input.pallets) {
    const data = pallet.data;
    if (!palletBelongsToOrganization(pallet.path, input.organizationId)) {
      issues.push({ palletPath: pallet.path, reason: "outside_organization_path" });
      continue;
    }
    if (!ACTIVE_PALLET_STATUSES.has(nonEmptyString(data.status) ?? "")) {
      continue;
    }

    const warehouseId = nonEmptyString(data.warehouseId);
    const productId = nonEmptyString(data.productId);
    const lot = nonEmptyString(data.lot);
    const expiryDate = expiryIsoDate(data.expiryDate);
    const quantity = positiveInteger(data.quantity);
    const productName =
      nonEmptyString(data.productName) ??
      (productId ? (input.productNames.get(productId) ?? null) : null);
    const projectionId =
      warehouseId && productId && lot && expiryDate
        ? lotProjectionId(warehouseId, productId, lot, expiryDate)
        : undefined;
    const block = (reason: string) => {
      if (projectionId) blockedProjectionIds.add(projectionId);
      issues.push({ palletPath: pallet.path, projectionId, reason });
    };

    if (!warehouseId || !productId || !lot || !expiryDate || !quantity || !productName) {
      block("pallet_missing_required_expiry_lot_fields");
      continue;
    }
    if (data.unit !== "cajas") {
      block("pallet_unit_is_not_cajas");
      continue;
    }
    if (input.before) {
      const createdAt = timestampIsoDate(data.createdAt);
      if (!createdAt) {
        block("pallet_missing_created_at_for_before_filter");
        continue;
      }
      if (createdAt >= input.before) continue;
    }
    if ((palletIds.get(pallet.id) ?? []).length !== 1) {
      block("pallet_id_is_not_unique");
      continue;
    }

    const matchingMovements = movementsByPallet.get(pallet.id) ?? [];
    if (matchingMovements.length !== 1) {
      block(
        matchingMovements.length
          ? "multiple_receipt_movements_for_pallet"
          : "missing_receipt_movement",
      );
      continue;
    }
    const movement = matchingMovements[0].data;
    if (
      !sameIfPresent(movement.warehouseId, warehouseId) ||
      !sameIfPresent(movement.productId, productId) ||
      !sameIfPresent(movement.quantity, quantity) ||
      !sameIfPresent(movement.unit, "cajas") ||
      !sameIfPresent(movement.lot, lot) ||
      !sameIfPresent(expiryIsoDate(movement.expiryDate), expiryDate)
    ) {
      block("receipt_movement_does_not_reconcile_to_pallet");
      continue;
    }

    const identity = lotIdentity(warehouseId, productId, lot, expiryDate);
    if (input.existingLotIdentities.has(identity)) {
      issues.push({
        palletPath: pallet.path,
        projectionId,
        reason: "semantic_expiry_lot_already_exists",
      });
      continue;
    }
    candidates.push({
      id: projectionId!,
      identity,
      warehouseId,
      productId,
      productName,
      lot,
      expiryDate,
      monthKey: expiryMonthKey(expiryDate),
      palletId: pallet.id,
      palletPath: pallet.path,
      movementId: matchingMovements[0].id,
      quantity,
    });
  }

  const grouped = new Map<string, BackfillProjection>();
  for (const candidate of candidates) {
    const current = grouped.get(candidate.id) ?? {
      id: candidate.id,
      identity: candidate.identity,
      warehouseId: candidate.warehouseId,
      productId: candidate.productId,
      productName: candidate.productName,
      lot: candidate.lot,
      expiryDate: candidate.expiryDate,
      monthKey: candidate.monthKey,
      cajas: 0,
      palletIds: [],
      palletPaths: [],
      movementIds: [],
    };
    current.cajas += candidate.quantity;
    current.palletIds.push(candidate.palletId);
    current.palletPaths.push(candidate.palletPath);
    current.movementIds.push(candidate.movementId);
    grouped.set(candidate.id, current);
  }

  const projections = [...grouped.values()].flatMap((projection) => {
    if (blockedProjectionIds.has(projection.id)) {
      issues.push({
        projectionId: projection.id,
        reason: "projection_blocked_by_incomplete_source_group",
      });
      return [];
    }
    if (projection.palletIds.length > MAX_PALLETS_PER_PROJECTION) {
      issues.push({ projectionId: projection.id, reason: "projection_exceeds_atomic_write_limit" });
      return [];
    }
    return [projection];
  });

  return {
    projections: projections.sort((left, right) => left.id.localeCompare(right.id)),
    issues,
    scannedPallets: input.pallets.length,
    scannedReceiptMovements: input.receiptMovements.length,
  };
}

function getDb() {
  const app = getApps()[0] ?? initializeApp();
  return getFirestore(app);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value?.startsWith("--")) return undefined;
  return value;
}

function requiredRunId(value: string | undefined): string {
  const generated = `expiry-lot-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runId = value ?? generated;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(runId)) {
    throw new Error("--run-id must contain only letters, digits, underscores, or hyphens");
  }
  return runId;
}

function requiredBefore(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || expiryIsoDate(value) !== value) {
    throw new Error("--before must use YYYY-MM-DD");
  }
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function existingLotIdentities(
  db: ReturnType<typeof getDb>,
  organizationId: string,
): Promise<Set<string>> {
  const snapshot = await db.collection(`organizations/${organizationId}/lotes_caducidades`).get();
  const identities = new Set<string>();
  for (const document of snapshot.docs) {
    const data = document.data();
    const warehouseId = nonEmptyString(data.warehouseId);
    const productId = nonEmptyString(data.productId);
    const lot = nonEmptyString(data.lot);
    const expiryDate = expiryIsoDate(data.expiryDate);
    if (warehouseId && productId && lot && expiryDate) {
      identities.add(lotIdentity(warehouseId, productId, lot, expiryDate));
    }
  }
  return identities;
}

async function writeProjection(input: {
  db: ReturnType<typeof getDb>;
  organizationId: string;
  projection: BackfillProjection;
  runId: string;
}): Promise<"created" | "already_exists"> {
  const { db, organizationId, projection, runId } = input;
  const root = db.doc(`organizations/${organizationId}`);
  const lotRef = root.collection("lotes_caducidades").doc(projection.id);
  const sourceRefs = projection.palletPaths.map((palletPath) =>
    root.collection("expiry_lot_backfill_sources").doc(`source-${sha256(palletPath).slice(0, 40)}`),
  );

  return db.runTransaction(async (transaction) => {
    const existingLot = await transaction.get(lotRef);
    if (existingLot.exists) return "already_exists";

    const now = Timestamp.now();
    transaction.create(lotRef, {
      id: projection.id,
      organizationId,
      warehouseId: projection.warehouseId,
      productId: projection.productId,
      productName: projection.productName,
      lot: projection.lot,
      expiryDate: Timestamp.fromDate(new Date(`${projection.expiryDate}T00:00:00.000Z`)),
      monthKey: projection.monthKey,
      cajas: projection.cajas,
      createdAt: now,
      updatedAt: now,
      backfill: {
        version: 1,
        runId,
        source: "receipt_pallets_with_reconciled_receipt_movements",
        sourcePalletCount: projection.palletIds.length,
        sourceMovementCount: projection.movementIds.length,
        appliedAt: now,
      },
    });
    for (const [index, sourceRef] of sourceRefs.entries()) {
      transaction.create(sourceRef, {
        organizationId,
        runId,
        lotProjectionId: projection.id,
        palletId: projection.palletIds[index],
        palletPath: projection.palletPaths[index],
        movementId: projection.movementIds[index],
        createdAt: now,
      });
    }
    transaction.create(root.collection("audit_events").doc(), {
      organizationId,
      warehouseId: projection.warehouseId,
      entityType: "lot_caducidad",
      entityId: projection.id,
      action: "BACKFILL_EXPIRY_LOT_PROJECTION",
      actorUserId: "migration:backfill-expiry-lots",
      operationId: runId,
      metadata: JSON.stringify({
        sourcePalletCount: projection.palletIds.length,
        sourceMovementCount: projection.movementIds.length,
        source: "receipt_pallets_with_reconciled_receipt_movements",
      }),
      occurredAt: now,
      schemaVersion: 1,
    });
    return "created";
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const organizationId = process.env.FIREBASE_ORG_ID ?? DEFAULT_ORG_ID;
  const before = requiredBefore(argValue("--before"));
  const runId = requiredRunId(argValue("--run-id"));
  if (apply && process.env.ALLOW_EXPIRY_LOT_BACKFILL !== "1") {
    throw new Error("Refusing --apply without ALLOW_EXPIRY_LOT_BACKFILL=1");
  }

  const db = getDb();
  const root = db.doc(`organizations/${organizationId}`);
  const [palletSnapshot, movementSnapshot, productSnapshot, existingIdentities] = await Promise.all(
    [
      db.collectionGroup("pallets").where("organizationId", "==", organizationId).get(),
      root.collection("inventory_movements").where("organizationId", "==", organizationId).get(),
      root.collection("products").get(),
      existingLotIdentities(db, organizationId),
    ],
  );
  const productNames = new Map(
    productSnapshot.docs.flatMap((document) => {
      const name = nonEmptyString(document.data().name);
      return name ? [[document.id, name] as const] : [];
    }),
  );
  const receiptMovements = movementSnapshot.docs
    .filter((document) => document.data().movementType === "RECEIPT")
    .map((document) => ({ id: document.id, data: document.data() }));
  const plan = buildBackfillPlan({
    organizationId,
    pallets: palletSnapshot.docs.map((document) => ({
      path: document.ref.path,
      id: document.id,
      data: document.data(),
    })),
    receiptMovements,
    productNames,
    existingLotIdentities: existingIdentities,
    before,
  });

  const report: Record<string, unknown> = {
    organizationId,
    database: "(default)",
    mode: apply ? "apply" : "dry-run",
    runId,
    before: before ?? null,
    scannedPallets: plan.scannedPallets,
    scannedReceiptMovements: plan.scannedReceiptMovements,
    proposedProjections: plan.projections.map((projection) => ({
      id: projection.id,
      warehouseId: projection.warehouseId,
      productId: projection.productId,
      lot: projection.lot,
      expiryDate: projection.expiryDate,
      cajas: projection.cajas,
      sourcePalletCount: projection.palletIds.length,
    })),
    skipped: plan.issues,
    created: [],
    alreadyExistsDuringApply: [],
  };

  if (apply) {
    const created: string[] = [];
    const alreadyExistsDuringApply: string[] = [];
    for (const projections of chunk(plan.projections, 25)) {
      for (const projection of projections) {
        const result = await writeProjection({ db, organizationId, projection, runId });
        if (result === "created") created.push(projection.id);
        else alreadyExistsDuringApply.push(projection.id);
      }
    }
    await root
      .collection("expiry_lot_backfill_runs")
      .doc(runId)
      .set(
        {
          organizationId,
          runId,
          mode: "apply",
          before: before ?? null,
          scannedPallets: plan.scannedPallets,
          scannedReceiptMovements: plan.scannedReceiptMovements,
          proposedProjectionCount: plan.projections.length,
          createdProjectionIds: created,
          alreadyExistsDuringApply,
          skippedCount: plan.issues.length,
          completedAt: FieldValue.serverTimestamp(),
          scriptVersion: 1,
        },
        { merge: false },
      );
    report.created = created;
    report.alreadyExistsDuringApply = alreadyExistsDuringApply;
  }

  console.log(JSON.stringify(report, null, 2));
}

const isDirectExecution =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error("Expiry lot backfill failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
