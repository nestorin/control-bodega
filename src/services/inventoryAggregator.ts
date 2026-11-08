/**
 * Inventory Aggregator Service — Monthly box/pallet aggregation
 * Updates inventoryMonthly collection on reception create/edit/delete
 */

import {
  getFirestore,
  writeBatch,
  doc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import type { InventoryMonthly } from "@/types/csvImport";

const ORG_ID = "org_exepa_001";

function getDb() {
  if (!app) throw new Error("Firebase not initialized");
  return getFirestore(app);
}

/**
 * Generate monthly document ID
 */
export function getMonthlyDocId(
  warehouseId: string,
  productId: string,
  year: number,
  month: number,
): string {
  return `${warehouseId}_${productId}_${year}_${month.toString().padStart(2, "0")}`;
}

/**
 * Increment monthly counters (reception created/edited)
 */
export async function incrementMonthly(
  warehouseId: string,
  productId: string,
  year: number,
  month: number,
  cajasDelta: number,
  tarimasDelta: number,
  userId: string,
): Promise<void> {
  if (cajasDelta === 0 && tarimasDelta === 0) return;

  const docId = getMonthlyDocId(warehouseId, productId, year, month);
  const db = getDb();
  const docRef = doc(db, `organizations/${ORG_ID}/inventoryMonthly`, docId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    if (snap.exists()) {
      const data = snap.data() as InventoryMonthly;
      transaction.update(docRef, {
        cajas: data.cajas + cajasDelta,
        tarimas: data.tarimas + tarimasDelta,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      });
    } else {
      transaction.set(docRef, {
        id: docId,
        warehouseId,
        productId,
        year,
        month,
        cajas: Math.max(0, cajasDelta),
        tarimas: Math.max(0, tarimasDelta),
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      });
    }
  });
}

/**
 * Decrement monthly counters (reception deleted)
 */
export async function decrementMonthly(
  warehouseId: string,
  productId: string,
  year: number,
  month: number,
  cajasDelta: number,
  tarimasDelta: number,
  userId: string,
): Promise<void> {
  await incrementMonthly(warehouseId, productId, year, month, -cajasDelta, -tarimasDelta, userId);
}

/**
 * Process reception lines for aggregation
 * Called after successful reception create/edit
 */
export interface ReceptionLineInput {
  productId: string;
  cajas: number;
  tarimas: number;
}

export async function processReceptionAggregation(
  warehouseId: string,
  lines: ReceptionLineInput[],
  scheduledDate: string, // YYYY-MM-DD
  userId: string,
  isEdit: boolean = false,
  oldLines: ReceptionLineInput[] = [], // for edit: subtract old, add new
): Promise<void> {
  const date = new Date(scheduledDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12

  // For edits, first decrement old lines
  if (isEdit && oldLines.length > 0) {
    for (const line of oldLines) {
      await decrementMonthly(
        warehouseId,
        line.productId,
        year,
        month,
        line.cajas,
        line.tarimas,
        userId,
      );
    }
  }

  // Increment new lines
  for (const line of lines) {
    await incrementMonthly(
      warehouseId,
      line.productId,
      year,
      month,
      line.cajas,
      line.tarimas,
      userId,
    );
  }
}

/**
 * Full recomputation for a warehouse/year
 * Useful for data repair or migration
 */
export async function recomputeMonthly(
  warehouseId: string,
  year: number,
  userId: string,
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  try {
    // Get all receptions for this warehouse/year
    const db = getDb();
    const receptionsRef = collection(db, `organizations/${ORG_ID}/receptions`);
    const q = query(
      receptionsRef,
      where("warehouseId", "==", warehouseId),
      where("scheduledDate", ">=", `${year}-01-01`),
      where("scheduledDate", "<=", `${year}-12-31`),
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db);

    // Aggregate in memory first
    const monthlyMap = new Map<string, { cajas: number; tarimas: number }>();

    for (const docSnap of snapshot.docs) {
      const reception = docSnap.data();
      const lines = reception.lines || [];
      const scheduledDate = reception.scheduledDate;

      if (!scheduledDate) continue;

      const date = new Date(scheduledDate);
      if (date.getFullYear() !== year) continue;
      const month = date.getMonth() + 1;

      for (const line of lines) {
        const key = `${warehouseId}_${line.productId}_${year}_${month.toString().padStart(2, "0")}`;
        const existing = monthlyMap.get(key) || { cajas: 0, tarimas: 0 };
        existing.cajas += line.cantidad || 0;
        existing.tarimas += line.tarimas || 0;
        monthlyMap.set(key, existing);
      }
    }

    // Write batch
    for (const [docId, totals] of monthlyMap.entries()) {
      const [wId, pId, yr, mn] = docId.split("_");
      const docRef = doc(db, `organizations/${ORG_ID}/inventoryMonthly`, docId);

      batch.set(docRef, {
        id: docId,
        warehouseId: wId,
        productId: pId,
        year: parseInt(yr),
        month: parseInt(mn),
        cajas: totals.cajas,
        tarimas: totals.tarimas,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      });

      processed++;

      // Commit every 500
      if (processed % 500 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();
  } catch (error) {
    errors.push(`Recompute failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  return { processed, errors };
}

/**
 * Get monthly data for grid view
 */
export interface GridQueryOptions {
  warehouseId: string;
  year: number;
  productIds?: string[]; // optional filter
}

export async function getMonthlyGridData(options: GridQueryOptions): Promise<InventoryMonthly[]> {
  const { warehouseId, year, productIds } = options;

  const db = getDb();
  const monthlyRef = collection(db, `organizations/${ORG_ID}/inventoryMonthly`);
  let q = query(monthlyRef, where("warehouseId", "==", warehouseId), where("year", "==", year));

  const snapshot = await getDocs(q);
  let data = snapshot.docs.map((d) => d.data() as InventoryMonthly);

  // Filter by productIds if provided
  if (productIds && productIds.length > 0) {
    const productSet = new Set(productIds);
    data = data.filter((d) => productSet.has(d.productId));
  }

  return data;
}

/**
 * Get reception breakdown for a cell drill-down
 */
export interface BreakdownOptions {
  warehouseId: string;
  productId: string;
  year: number;
  month: number;
}

export interface ReceptionBreakdownItem {
  id: string;
  folio: string;
  fecha: Date;
  proveedor: string;
  cajas: number;
  tarimas: number;
}

export async function getReceptionBreakdown(
  options: BreakdownOptions,
): Promise<ReceptionBreakdownItem[]> {
  const { warehouseId, productId, year, month } = options;

  const db = getDb();
  const receptionsRef = collection(db, `organizations/${ORG_ID}/receptions`);
  const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
  const endDate =
    month === 12 ? `${year + 1}-01-01` : `${year}-${(month + 1).toString().padStart(2, "0")}-01`;

  const q = query(
    receptionsRef,
    where("warehouseId", "==", warehouseId),
    where("scheduledDate", ">=", startDate),
    where("scheduledDate", "<", endDate),
  );

  const snapshot = await getDocs(q);
  const breakdown: ReceptionBreakdownItem[] = [];

  for (const docSnap of snapshot.docs) {
    const reception = docSnap.data();
    const lines = reception.lines || [];

    for (const line of lines) {
      if (line.productId === productId) {
        breakdown.push({
          id: docSnap.id,
          folio: reception.folio || docSnap.id,
          fecha: reception.scheduledDate ? new Date(reception.scheduledDate) : new Date(),
          proveedor: reception.supplierName || "—",
          cajas: line.cantidad || 0,
          tarimas: line.tarimas || 0,
        });
      }
    }
  }

  return breakdown;
}
