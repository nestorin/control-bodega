/**
 * Labeling Types Barrel — All shared types for the Labeling Module
 *
 * Single source of truth for types used across contexts, hooks, services, and screens.
 */

// ============================================
// Tracking Key
// ============================================

/** Product control flags from ProductDoc */
export interface ProductControlFlags {
  lotControlled: boolean;
  expiryControlled: boolean;
}

/** Normalized tracking key components */
export interface TrackingKeyComponents {
  productId: string;
  lotKey: string;
  expiryKey: string;
}

/** Normalized tracking key: productId|lotKey|expiryKey (separator '|' is immutable) */
export type TrackingKey = string;

/** Tracking key with original snapshot values for audit */
export interface TrackingKeyWithSnapshot extends TrackingKeyComponents {
  lotSnapshot: string;
  expirySnapshot: Timestamp | string | null;
}

/** Timestamp type for cross-platform compatibility */
export type Timestamp =
  | {
      toDate: () => Date;
    }
  | Date
  | string
  | null
  | undefined;

// ============================================
// Batch & Lifecycle
// ============================================

/** Labeling batch status */
export type BatchStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "reconciling"
  | "closed_reconciled"
  | "closed_with_discrepancy"
  | "cancelled"
  | "cancelled_with_reversal";

/** Valid state transitions */
export const VALID_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  draft: ["planned", "cancelled"],
  planned: ["in_progress", "cancelled"],
  in_progress: ["reconciling", "cancelled_with_reversal"],
  reconciling: ["closed_reconciled", "closed_with_discrepancy"],
  closed_reconciled: [],
  closed_with_discrepancy: [],
  cancelled: [],
  cancelled_with_reversal: [],
};

/** Batch header */
export interface LabelingBatch {
  batchId: string; // UUID
  warehouseId: string; // canonical
  labelingCompanyId: string; // business identifier (not auth)
  labelingCompanyName: string; // display
  receiverName: string; // person receiving at labeling
  deliveredByName: string; // person delivering from warehouse
  status: BatchStatus;
  estimatedTotals: { boxes: number; pallets: number };
  actualTotals: {
    assigned: number;
    returned: number;
    loss: number;
    pending: number;
    output: number;
  };
  openedAt: Timestamp | null; // server time on 'planned'
  closedAt: Timestamp | null; // server time on close
  version: number; // optimistic locking
  evidenceRefs: EvidenceRef[];
}

/** Batch line — one per unique trackingKey within the batch */
export interface LabelingLine {
  lineId: string; // UUID
  trackingKey: string; // partition key
  productId: string; // for lookups
  productSnapshot: ProductSnapshot; // id, sku, name at time of creation
  lotKey: string; // normalized
  lotSnapshot: string; // original lot string
  expiryKey: string; // normalized
  expiryDate: Timestamp; // original
  estimatedBoxes: number;
  estimatedPallets: number;
  assignedBoxes: number; // sum of confirmedBoxes from assignments
  returnedBoxes: number; // sum of receivedBoxes from returns
  approvedLossBoxes: number; // sum of approved discrepancies
  outputBoxes: number; // sum of output pallets
  pendingBoxes: number; // assigned - returned - approvedLoss (derived, >=0)
}

/** Snapshot of product at time of batch creation */
export interface ProductSnapshot {
  id: string;
  sku: string;
  name: string;
}

/** Handoff intention for QR scan */
export type HandoffIntention = "handoff" | "return";

// ============================================
// Assignments (Entrega a Etiquetado)
// ============================================

/** Delivery of a source pallet to the labeling company */
export interface LabelingAssignment {
  assignmentId: string; // UUID
  batchId: string;
  sourcePalletId: string;
  sourceQr: string; // TQR-... format
  trackingKey: string;
  sourceBoxes: number; // origin quantity from reception
  confirmedBoxes: number; // physically confirmed
  status: "active" | "partial" | "returned";
  actor: string; // actorUserId
  createdAt: Timestamp;
  idempotencyKey: string; // UUID
}

// ============================================
// Returns (Recepción del Etiquetado)
// ============================================

/** Shortage reason enum */
export type ShortageReason =
  | "damaged_merchandise" // Mercancía dañada
  | "poor_condition" // Mal estado
  | "damaged_during_labeling"; // Dañada durante etiquetado

/** Evidence reference for shortages/discrepancies */
export interface EvidenceRef {
  evidenceId: string;
  type: "handoff" | "shortage" | "discrepancy";
  storagePath: string;
  downloadUrl: string;
  uploadedAt: Timestamp;
  uploadedBy: string;
}

/** Return/receipt of a delivery from the labeling company */
export interface LabelingReturn {
  returnId: string; // UUID
  batchId: string;
  assignmentId: string;
  sourceQr: string;
  trackingKey: string;
  receivedBoxes: number; // physically received
  shortageBoxes: number; // max(0, confirmed - returned - received)
  shortageReason: ShortageReason | null;
  evidenceRefs: EvidenceRef[];
  actor: string; // actorUserId
  receivedAt: Timestamp;
  idempotencyKey: string; // UUID
}

// ============================================
// Output Pallets (Salidas Etiquetadas)
// ============================================

/** Source allocation traceability */
export interface SourceAllocation {
  type: "assignment" | "return";
  refId: string; // assignmentId or returnId
  boxes: number;
  trackingKey: string; // redundant for validation
}

/** Output pallet — physical pallet returned from labeling, now tagged */
export interface LabelingOutputPallet {
  outputPalletId: string; // UUID
  batchId: string;
  outputQr: string; // TQR-{batchId}-{seq}
  trackingKey: string;
  boxes: number;
  sourceAllocation: SourceAllocation[]; // must all share same trackingKey
  status: "created" | "published";
  createdAt: Timestamp;
}

// ============================================
// Discrepancies
// ============================================

/** Discrepancy type */
export type DiscrepancyType = "SHORTAGE" | "EXCESS" | "QUALITY";

/** Discrepancy status */
export type DiscrepancyStatus = "pending" | "approved" | "rejected";

/** Shortage/discrepancy record */
export interface LabelingDiscrepancy {
  discrepancyId: string; // UUID
  batchId: string;
  trackingKey: string;
  type: DiscrepancyType;
  boxes: number;
  reason: ShortageReason | string;
  evidenceRefs: EvidenceRef[];
  reportedBy: string;
  reportedAt: Timestamp;
  approvedBy: string | null;
  approvedAt: Timestamp | null;
  resolution: string | null;
  status: DiscrepancyStatus;
}

// ============================================
// Ledger & Projections
// ============================================

/** Ledger event type */
export type LedgerEventType =
  | "ASSIGN"
  | "RETURN"
  | "LOSS"
  | "OUTPUT"
  | "RECONCILE"
  | "CLOSE_RECONCILED"
  | "CLOSE_WITH_DISCREPANCY"
  | "CANCELLED"
  | "CANCELLED_WITH_REVERSAL"
  | "REVERSE_ASSIGN"
  | "REVERSE_RETURN"
  | "REVERSE_OUTPUT";

/** Immutable ledger event */
export interface LabelingLedgerEvent {
  eventId: string; // UUID
  eventType: LedgerEventType;
  batchId: string;
  trackingKey: string;
  quantityDelta: number; // signed: +assign/return/output, -return/loss/reverse
  sourceRefs: string[]; // related doc IDs (pallet, assignment, return, output)
  actor: string; // actorUserId
  serverTimestamp: Timestamp;
  correlationId: string; // groups related events
  idempotencyKey: string; // client-provided
  payloadHash: string; // SHA-256 of request payload
}

/** Materialized projection per warehouse+trackingKey */
export interface LabelingProjection {
  warehouseId: string;
  trackingKey: string;
  receivedBoxes: number; // sum of ASSIGN deltas
  inLabelingBoxes: number; // received - returned - loss
  workedBoxes: number; // sum of OUTPUT deltas (only on valid close)
  updatedAt: Timestamp;
  ledgerCursor: string; // last eventId processed
}

/** Idempotency record */
export interface LabelingIdempotencyRecord {
  key: string; // idempotencyKey from request
  requestHash: string; // SHA-256 of full request payload
  operation: string; // e.g., 'confirmHandoff', 'registerReturn'
  resourceId: string; // created/affected resource ID
  response: any; // original success response (for replay)
  expiresAt: Timestamp; // TTL (e.g., 7 days)
}

// ============================================
// Handoff & Evidence
// ============================================

/** Handoff receipt data for PDF generation */
export interface HandoffReceiptData {
  batchId: string;
  labelingCompanyName: string;
  receiverName: string;
  deliveredByName: string;
  date: Date;
  lines: {
    qr: string;
    product: string;
    lot: string;
    expiry: string;
    cajasOrigen: number;
    cajasConfirmadas: number;
    diferencia: number;
  }[];
  totals: {
    origen: number;
    confirmadas: number;
    diferencia: number;
  };
  signatures: {
    receiver: string;
    deliveredBy: string;
    date: Date;
  };
}

/** Evidence reference stored in batch */
export interface EvidenceRef {
  evidenceId: string;
  type: "handoff" | "shortage" | "discrepancy";
  storagePath: string;
  downloadUrl: string;
  uploadedAt: Timestamp;
  uploadedBy: string;
}

// ============================================
// Catalogs
// ============================================

/** Labeling company */
export interface LabelingCompany {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
}

/** Product eligible for labeling */
export interface LabelingEligibleProduct {
  id: string;
  name: string;
  sku: string;
  lotControlled: boolean;
  expiryControlled: boolean;
}
