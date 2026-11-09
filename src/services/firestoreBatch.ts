/**
 * Firestore Batch Service — Batched writes with retry logic
 * Handles large bulk operations by chunking at 500 operations
 */

import {
  getFirestore,
  writeBatch,
  doc,
  collection,
  WriteBatch,
  Firestore,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

const ORG_ID = "org_exepa_001";

function getDb(): Firestore {
  if (!app) throw new Error("Firebase not initialized");
  return getFirestore(app);
}

export { getDb };

export interface BatchWrite<T> {
  type: "set" | "update" | "delete";
  collectionPath: string; // e.g., 'products', 'suppliers'
  docId?: string; // for update/delete
  data?: T; // for set/update
}

export interface BatchResult {
  success: boolean;
  committed: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
}

/**
 * Commit batched writes with automatic chunking at 500 ops
 * Retries with exponential backoff on transient failures
 */
export async function commitBatch<T>(
  writes: BatchWrite<T>[],
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    onProgress?: (committed: number, total: number) => void;
  } = {},
): Promise<BatchResult> {
  const { maxRetries = 3, baseDelayMs = 1000, onProgress } = options;
  const db = getDb();

  const CHUNK_SIZE = 500;
  let totalCommitted = 0;
  let totalFailed = 0;
  const errors: BatchResult["errors"] = [];

  // Process in chunks
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    let chunkCommitted = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const batch = writeBatch(db);

      try {
        for (const write of chunk) {
          const ref = doc(db, `organizations/${ORG_ID}/${write.collectionPath}`, write.docId || "");

          switch (write.type) {
            case "set":
              batch.set(ref, write.data as Record<string, any>);
              break;
            case "update":
              batch.update(ref, write.data as Record<string, any>);
              break;
            case "delete":
              batch.delete(ref);
              break;
          }
        }

        await batch.commit();
        chunkCommitted = chunk.length;
        break; // Success, exit retry loop
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isTransient = isTransientError(error);

        if (isLastAttempt || !isTransient) {
          // Record failures for this chunk
          chunk.forEach((_, idx) => {
            errors.push({
              index: i + idx,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          });
          totalFailed += chunk.length;
          break;
        }

        // Exponential backoff
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    totalCommitted += chunkCommitted;
    onProgress?.(totalCommitted, writes.length);
  }

  return {
    success: totalFailed === 0,
    committed: totalCommitted,
    failed: totalFailed,
    errors,
  };
}

/**
 * Check if error is transient (retryable)
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const transientCodes = [
    "unavailable",
    "deadline-exceeded",
    "resource-exhausted",
    "internal",
    "aborted",
  ];

  const message = error.message.toLowerCase();
  return transientCodes.some((code) => message.includes(code));
}

/**
 * Convenience: Create batch writes for products import
 */
export function createProductBatchWrites(
  products: Array<{ sku: string; data: any }>,
): BatchWrite<any>[] {
  return products.map(({ sku, data }) => ({
    type: "set" as const,
    collectionPath: "products",
    docId: sku,
    data: {
      ...data,
      createdAt: new Date().toISOString(),
    },
  }));
}

/**
 * Convenience: Create batch writes for suppliers import
 */
export function createSupplierBatchWrites(
  suppliers: Array<{ id: string; data: any }>,
): BatchWrite<any>[] {
  return suppliers.map(({ id, data }) => ({
    type: "set" as const,
    collectionPath: "suppliers",
    docId: id,
    data: {
      ...data,
      createdAt: new Date().toISOString(),
    },
  }));
}

/**
 * Convenience: Create batch writes for conversions import
 */
export function createConversionBatchWrites(
  conversions: Array<{ id: string; data: any }>,
): BatchWrite<any>[] {
  return conversions.map(({ id, data }) => ({
    type: "set" as const,
    collectionPath: "conversions",
    docId: id,
    data: {
      ...data,
      createdAt: new Date().toISOString(),
    },
  }));
}

/**
 * Convenience: Create batch writes for warehouses import
 */
export function createWarehouseBatchWrites(
  warehouses: Array<{ id: string; data: any }>,
): BatchWrite<any>[] {
  return warehouses.map(({ id, data }) => ({
    type: "set" as const,
    collectionPath: "warehouses",
    docId: id,
    data: {
      ...data,
      createdAt: new Date().toISOString(),
    },
  }));
}
