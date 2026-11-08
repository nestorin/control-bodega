/**
 * Labeling Hooks — Phase 3
 *
 * Custom hooks that consume the labeling contexts and provide typed APIs.
 */

import { useCallback } from "react";
import { useLabelingBatchContext } from "@/context/LabelingBatchContext";
import type {
  LabelingBatch,
  LabelingLine,
  LabelingAssignment,
  LabelingReturn,
  LabelingOutputPallet,
  LabelingDiscrepancy,
  EvidenceRef,
  BatchStatus,
} from "@/types/labeling";

// ============================================
// useLabelingBatch - Main batch operations
// ============================================

export function useLabelingBatch() {
  const {
    currentBatch,
    status,
    lines,
    assignments,
    returns,
    outputPallets,
    discrepancies,
    evidenceRefs,
    version,
    isLoading,
    error,
    createBatch,
    planBatch,
    cancelBatch,
    addLine,
    updateLine,
    removeLine,
    confirmHandoff,
    registerReturn,
    createOutputPallets,
    reconcileBatch,
    closeBatch,
    cancelBatchWithReversal,
    setEvidenceRef,
    setError,
    setLoading,
    resetAll,
  } = useLabelingBatchContext();

  // Derived state
  const totalEstimatedBoxes = useCallback(() => {
    let total = 0;
    for (const line of lines.values()) {
      total += line.estimatedBoxes;
    }
    return total;
  }, [lines]);

  const totalPendingBoxes = useCallback(() => {
    let total = 0;
    for (const line of lines.values()) {
      const pending = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
      if (pending > 0) total += pending;
    }
    return total;
  }, [lines]);

  const isFullyReconciled = useCallback(() => {
    for (const line of lines.values()) {
      const pending = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
      if (pending > 0) return false;
    }
    return true;
  }, [lines]);

  const canPlan = useCallback(() => {
    return status === "draft" && lines.size > 0 && totalEstimatedBoxes() > 0;
  }, [status, lines]);

  const canReconcile = useCallback(() => {
    return status === "in_progress" || status === "planned";
  }, [status]);

  const canClose = useCallback(() => {
    return status === "reconciling";
  }, [status]);

  return {
    // State
    currentBatch,
    status,
    lines,
    assignments,
    returns,
    outputPallets,
    discrepancies,
    evidenceRefs,
    version,
    isLoading,
    error,
    // Derived
    totalEstimatedBoxes: totalEstimatedBoxes(),
    totalPendingBoxes: totalPendingBoxes(),
    isFullyReconciled: isFullyReconciled(),
    canPlan: canPlan(),
    canReconcile: canReconcile(),
    canClose: canClose(),
    // Actions
    createBatch,
    planBatch,
    cancelBatch,
    addLine,
    updateLine,
    removeLine,
    confirmHandoff,
    registerReturn,
    createOutputPallets,
    reconcileBatch,
    closeBatch,
    cancelBatchWithReversal,
    setEvidenceRef,
    setError,
    setLoading,
    resetAll,
  };
}

// ============================================
// useLabelingHandoff - Handoff (entrega) operations
// ============================================

export function useLabelingHandoff() {
  const { currentBatch, status, lines, assignments, confirmHandoff, setError } =
    useLabelingBatchContext();

  const scanSourcePallet = useCallback(
    async (
      qrCode: string,
      warehouseId: string,
    ): Promise<{ success: boolean; data?: any; error?: string }> => {
      // This would call the Callable to validate the pallet
      // For now, return mock validation
      if (!qrCode.startsWith("TQR-")) {
        return { success: false, error: "Código QR inválido" };
      }
      return { success: true, data: { qr: qrCode } };
    },
    [],
  );

  const confirmDelivery = useCallback(
    (
      assignmentId: string,
      sourceBoxes: number,
      confirmedBoxes: number,
      trackingKey: string,
      sourcePalletId: string,
      sourceQr: string,
      actor: string,
      idempotencyKey: string,
    ) => {
      if (confirmedBoxes <= 0) {
        setError("Las cajas confirmadas deben ser mayores a 0");
        return;
      }
      if (confirmedBoxes > sourceBoxes) {
        setError("No puede confirmar más cajas de las que existen en la tarima origen");
        return;
      }
      confirmHandoff({
        assignmentId,
        sourceBoxes,
        confirmedBoxes,
        trackingKey,
        sourcePalletId,
        sourceQr,
        actor,
        createdAt: new Date().toISOString(),
        idempotencyKey,
      });
    },
    [confirmHandoff, setError],
  );

  const getLineByTrackingKey = useCallback(
    (trackingKey: string) => {
      return lines.get(trackingKey);
    },
    [lines],
  );

  return {
    currentBatch,
    status,
    lines,
    assignments,
    scanSourcePallet,
    confirmDelivery,
    getLineByTrackingKey,
  };
}

// ============================================
// useLabelingReturn - Return (recepción) operations
// ============================================

export function useLabelingReturn() {
  const { currentBatch, status, lines, returns, assignments, registerReturn, setError } =
    useLabelingBatchContext();

  const scanReturnQr = useCallback(
    async (qrCode: string): Promise<{ success: boolean; assignment?: any; error?: string }> => {
      if (!qrCode.startsWith("TQR-")) {
        return { success: false, error: "Código QR inválido" };
      }
      // Find the assignment
      const assignment = Array.from(assignments.values()).find((a: any) => a.sourceQr === qrCode);
      if (!assignment) {
        return { success: false, error: "No se encontró entrega asociada a este QR" };
      }
      return { success: true, assignment };
    },
    [assignments],
  );

  const receiveDelivery = useCallback(
    (
      returnId: string,
      assignmentId: string,
      receivedBoxes: number,
      shortageBoxes: number,
      shortageReason: string | null,
      evidenceRefs: EvidenceRef[],
      trackingKey: string,
      actor: string,
      idempotencyKey: string,
    ) => {
      if (receivedBoxes < 0) {
        setError("Las cajas recibidas no pueden ser negativas");
        return;
      }
      if (shortageBoxes < 0) {
        setError("Las cajas faltantes no pueden ser negativas");
        return;
      }
      if (shortageBoxes > 0 && !shortageReason) {
        setError("Debe especificar la razón del faltante");
        return;
      }
      registerReturn({
        returnId,
        assignmentId,
        receivedBoxes,
        shortageBoxes,
        shortageReason,
        evidenceRefs,
        trackingKey,
        actor,
        receivedAt: new Date().toISOString(),
        idempotencyKey,
      });
    },
    [registerReturn, setError],
  );

  const getShortageReasons = useCallback(
    () => [
      { value: "damaged_merchandise", label: "Mercancía dañada" },
      { value: "poor_condition", label: "Mal estado" },
      { value: "damaged_during_labeling", label: "Dañada durante etiquetado" },
    ],
    [],
  );

  return {
    currentBatch,
    status,
    lines,
    returns,
    scanReturnQr,
    receiveDelivery,
    getShortageReasons,
  };
}

// ============================================
// useLabelingOutput - Output pallets (salidas etiquetadas)
// ============================================

export function useLabelingOutput() {
  const { currentBatch, status, lines, outputPallets, createOutputPallets, setError } =
    useLabelingBatchContext();

  const createOutputPallet = useCallback(
    (
      outputPallets: Array<{
        outputPalletId: string;
        outputQr: string;
        trackingKey: string;
        boxes: number;
        sourceAllocation: any[];
      }>,
      trackingKey: string,
    ) => {
      // Validate all pallets share the same trackingKey
      for (const p of outputPallets) {
        if (p.trackingKey !== trackingKey) {
          setError("Todos los pallets de salida deben tener el mismo trackingKey");
          return;
        }
      }
      // Validate total boxes don't exceed available
      const line = lines.get(trackingKey);
      if (line) {
        const available =
          line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes - line.outputBoxes;
        const totalRequested = outputPallets.reduce((sum, p) => sum + p.boxes, 0);
        if (totalRequested > available) {
          setError(
            `No hay suficientes cajas disponibles. Disponibles: ${available}, solicitadas: ${totalRequested}`,
          );
          return;
        }
      }
      createOutputPallets({ outputPallets, trackingKey });
    },
    [createOutputPallets, lines, setError],
  );

  const getOutputPalletsByTrackingKey = useCallback(
    (trackingKey: string) => {
      const result: any[] = [];
      for (const pallet of outputPallets.values()) {
        if (pallet.trackingKey === trackingKey) {
          result.push(pallet);
        }
      }
      return result;
    },
    [outputPallets],
  );

  return {
    currentBatch,
    status,
    lines,
    outputPallets,
    createOutputPallet,
    getOutputPalletsByTrackingKey,
  };
}

// ============================================
// useLabelingReconcile - Reconciliation & Close
// ============================================

export function useLabelingReconcile() {
  const { currentBatch, status, lines, discrepancies, reconcileBatch, closeBatch, setError } =
    useLabelingBatchContext();

  const getPendingLines = useCallback(() => {
    const pending: any[] = [];
    for (const [trackingKey, line] of lines) {
      const pendingBoxes = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
      if (pendingBoxes > 0) {
        pending.push({ trackingKey, line, pendingBoxes });
      }
    }
    return pending;
  }, [lines]);

  const hasPending = useCallback(() => {
    for (const [, line] of lines) {
      const pending = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
      if (pending > 0) return true;
    }
    return false;
  }, [lines]);

  const startReconciliation = useCallback(
    (expectedVersion: number) => {
      reconcileBatch(expectedVersion);
    },
    [reconcileBatch],
  );

  const closeReconciled = useCallback(
    (expectedVersion: number) => {
      closeBatch({ type: "reconciled" }, expectedVersion);
    },
    [closeBatch],
  );

  const closeWithDiscrepancy = useCallback(
    (expectedVersion: number, resolution: any) => {
      closeBatch({ type: "with_discrepancy", ...resolution }, expectedVersion);
    },
    [closeBatch],
  );

  const getDiscrepanciesByTrackingKey = useCallback(
    (trackingKey: string) => {
      const result: any[] = [];
      for (const disc of discrepancies.values()) {
        if (disc.trackingKey === trackingKey) {
          result.push(disc);
        }
      }
      return result;
    },
    [discrepancies],
  );

  return {
    currentBatch,
    status,
    lines,
    discrepancies,
    getPendingLines,
    hasPending: hasPending(),
    startReconciliation,
    closeReconciled,
    closeWithDiscrepancy,
    getDiscrepanciesByTrackingKey,
  };
}

// ============================================
// useLabelingEvidence - Evidence management
// ============================================

export function useLabelingEvidence() {
  const { evidenceRefs, setEvidenceRef } = useLabelingBatchContext();

  const addEvidence = useCallback(
    (type: "handoff" | "shortage" | "discrepancy", evidenceRef: EvidenceRef) => {
      setEvidenceRef({ ...evidenceRef, type });
    },
    [setEvidenceRef],
  );

  const getEvidenceByType = useCallback(
    (type: "handoff" | "shortage" | "discrepancy") => {
      return evidenceRefs.filter((e: any) => e.type === type);
    },
    [evidenceRefs],
  );

  const getEvidenceByBatch = useCallback(() => {
    return evidenceRefs;
  }, [evidenceRefs]);

  return {
    evidenceRefs,
    addEvidence,
    getEvidenceByType,
    getEvidenceByBatch,
  };
}

// ============================================
// Barrel export
// ============================================
