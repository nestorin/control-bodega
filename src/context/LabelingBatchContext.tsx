import { createContext, useContext, useReducer, useCallback, useMemo, ReactNode } from "react";
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

interface LabelingLineInternal {
  lineId: string;
  trackingKey: string;
  productId: string;
  productSnapshot: { id: string; sku: string; name: string };
  lotKey: string;
  lotSnapshot: string;
  expiryKey: string;
  expiryDate: string | null;
  estimatedBoxes: number;
  estimatedPallets: number;
  assignedBoxes: number;
  returnedBoxes: number;
  approvedLossBoxes: number;
  outputBoxes: number;
}

interface LabelingBatchInternal {
  batchId: string;
  warehouseId: string;
  labelingCompanyId: string;
  labelingCompanyName: string;
  receiverName: string;
  deliveredByName: string;
  status: string;
  estimatedTotals: { boxes: number; pallets: number };
  actualTotals: {
    assigned: number;
    returned: number;
    loss: number;
    pending: number;
    output: number;
  };
  openedAt: string | null;
  closedAt: string | null;
  version: number;
  evidenceRefs: any[];
}

interface LabelingAssignmentInternal {
  assignmentId: string;
  batchId: string;
  sourcePalletId: string;
  sourceQr: string;
  trackingKey: string;
  sourceBoxes: number;
  confirmedBoxes: number;
  status: "active" | "partial" | "returned";
  actor: string;
  createdAt: string;
  idempotencyKey: string;
}

interface LabelingReturnInternal {
  returnId: string;
  batchId: string;
  assignmentId: string;
  sourceQr: string;
  trackingKey: string;
  receivedBoxes: number;
  shortageBoxes: number;
  shortageReason: string | null;
  evidenceRefs: any[];
  actor: string;
  receivedAt: string;
  idempotencyKey: string;
}

interface LabelingOutputPalletInternal {
  outputPalletId: string;
  batchId: string;
  outputQr: string;
  trackingKey: string;
  boxes: number;
  sourceAllocation: any[];
  status: "created" | "published";
  createdAt: string;
}

interface LabelingDiscrepancyInternal {
  discrepancyId: string;
  batchId: string;
  trackingKey: string;
  type: string;
  boxes: number;
  reason: string;
  evidenceRefs: any[];
  reportedBy: string;
  reportedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  resolution: string | null;
  status: "pending" | "approved" | "rejected";
}

interface EvidenceRefInternal {
  evidenceId: string;
  type: "handoff" | "shortage" | "discrepancy";
  storagePath: string;
  downloadUrl: string;
  uploadedAt: string;
  uploadedBy: string;
}

interface LabelingBatchState {
  currentBatch: any | null;
  status: string;
  lines: Map<string, LabelingLineInternal>;
  assignments: Map<string, LabelingAssignmentInternal>;
  returns: Map<string, LabelingReturnInternal>;
  outputPallets: Map<string, LabelingOutputPalletInternal>;
  discrepancies: Map<string, LabelingDiscrepancyInternal>;
  evidenceRefs: any[];
  version: number;
  isLoading: boolean;
  error: string | null;
}

type LabelingBatchAction =
  | { type: "CREATE_BATCH"; payload: any }
  | { type: "PLAN_BATCH"; payload: { expectedVersion: number } }
  | { type: "CANCEL_BATCH"; payload: { reason: string; expectedVersion: number } }
  | { type: "ADD_LINE"; payload: any }
  | { type: "UPDATE_LINE"; payload: { lineId: string; updates: Partial<any> } }
  | { type: "REMOVE_LINE"; payload: { lineId: string } }
  | { type: "CONFIRM_HANDOFF"; payload: any }
  | { type: "REGISTER_RETURN"; payload: any }
  | { type: "CREATE_OUTPUT_PALLETS"; payload: any }
  | { type: "RECONCILE_BATCH"; payload: { expectedVersion: number } }
  | { type: "CLOSE_BATCH"; payload: { resolution: any; expectedVersion: number } }
  | { type: "CANCEL_BATCH_WITH_REVERSAL"; payload: { reason: string; expectedVersion: number } }
  | { type: "SET_EVIDENCE_REF"; payload: any }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "RESET_ALL" };

const defaultInitialState = {
  currentBatch: null,
  status: "draft" as const,
  lines: new Map<string, LabelingLineInternal>(),
  assignments: new Map<string, LabelingAssignmentInternal>(),
  returns: new Map<string, LabelingReturnInternal>(),
  outputPallets: new Map<string, LabelingOutputPalletInternal>(),
  discrepancies: new Map<string, LabelingDiscrepancyInternal>(),
  evidenceRefs: [],
  version: 0,
  isLoading: false,
  error: null,
};

function labelingBatchReducer(
  state: LabelingBatchState,
  action: LabelingBatchAction,
): LabelingBatchState {
  switch (action.type) {
    case "CREATE_BATCH":
      return {
        ...state,
        currentBatch: action.payload,
        status: "draft",
        lines: new Map<string, LabelingLineInternal>(),
        assignments: new Map<string, LabelingAssignmentInternal>(),
        returns: new Map<string, LabelingReturnInternal>(),
        outputPallets: new Map<string, LabelingOutputPalletInternal>(),
        discrepancies: new Map<string, LabelingDiscrepancyInternal>(),
        evidenceRefs: [],
        version: 1,
        isLoading: false,
        error: null,
      };

    case "PLAN_BATCH": {
      const { expectedVersion } = action.payload;
      if (state.version !== expectedVersion) {
        return { ...state, error: "Version conflict: batch was modified by another user" };
      }
      if (!state.currentBatch || state.lines.size === 0) {
        return { ...state, error: "Batch must have at least one line to plan" };
      }
      for (const line of state.lines.values()) {
        if (!line.trackingKey || line.estimatedBoxes <= 0) {
          return { ...state, error: "All lines must have trackingKey and estimatedBoxes > 0" };
        }
      }
      let totalBoxes = 0;
      let totalPallets = 0;
      for (const line of state.lines.values()) {
        totalBoxes += line.estimatedBoxes;
        totalPallets += line.estimatedPallets;
      }
      return {
        ...state,
        status: "planned",
        currentBatch: {
          ...state.currentBatch!,
          estimatedTotals: { boxes: totalBoxes, pallets: totalPallets },
          status: "planned",
          openedAt: new Date().toISOString(),
        },
        version: state.version + 1,
        error: null,
      };
    }

    case "CANCEL_BATCH": {
      if (state.assignments.size > 0 || state.returns.size > 0) {
        return { ...state, error: "Cannot cancel batch with movements; use cancelWithReversal" };
      }
      return {
        ...state,
        status: "cancelled",
        currentBatch: state.currentBatch
          ? { ...state.currentBatch, status: "cancelled", closedAt: new Date().toISOString() }
          : null,
        version: state.version + 1,
      };
    }

    case "ADD_LINE": {
      const line = action.payload;
      if (state.status !== "draft") {
        return { ...state, error: "Cannot add lines after planning" };
      }
      if (state.lines.has(line.lineId)) {
        return { ...state, error: "Line already exists" };
      }
      const newLines = new Map(state.lines);
      newLines.set(line.lineId, line);
      return { ...state, lines: newLines };
    }

    case "UPDATE_LINE": {
      const { lineId, updates } = action.payload;
      if (!state.lines.has(lineId)) {
        return { ...state, error: "Line not found" };
      }
      if (state.status !== "draft") {
        return { ...state, error: "Cannot update lines after planning" };
      }
      const newLines = new Map(state.lines);
      const existingLine = newLines.get(lineId);
      if (existingLine) {
        newLines.set(lineId, { ...existingLine, ...updates });
      }
      return { ...state, lines: newLines };
    }

    case "REMOVE_LINE": {
      const { lineId } = action.payload;
      if (state.status !== "draft") {
        return { ...state, error: "Cannot remove lines after planning" };
      }
      const newLines = new Map(state.lines);
      newLines.delete(lineId);
      return { ...state, lines: newLines };
    }

    case "CONFIRM_HANDOFF": {
      const {
        assignmentId,
        sourceBoxes,
        confirmedBoxes,
        trackingKey,
        sourcePalletId,
        sourceQr,
        actor,
        createdAt,
        idempotencyKey,
      } = action.payload;
      const newAssignments = new Map(state.assignments);
      newAssignments.set(assignmentId, {
        assignmentId,
        sourceBoxes,
        confirmedBoxes,
        trackingKey,
        sourcePalletId,
        sourceQr: state.currentBatch?.sourceQr || "",
        status: "active",
        batchId: state.currentBatch?.batchId || "",
        actor,
        createdAt,
        idempotencyKey,
      });

      const newLines = new Map(state.lines);
      const line = newLines.get(trackingKey);
      if (line) {
        line.assignedBoxes += confirmedBoxes;
      }

      return {
        ...state,
        assignments: newAssignments,
        lines: newLines,
        status: "in_progress",
        currentBatch: state.currentBatch
          ? {
              ...state.currentBatch,
              actualTotals: {
                ...state.currentBatch.actualTotals,
                assigned: state.currentBatch.actualTotals.assigned + confirmedBoxes,
              },
            }
          : null,
        version: state.version + 1,
      };
    }

    case "REGISTER_RETURN": {
      const {
        returnId,
        assignmentId,
        receivedBoxes,
        shortageBoxes,
        shortageReason,
        evidenceRefs,
        trackingKey,
        actor,
        receivedAt,
        idempotencyKey,
      } = action.payload;
      const newReturns = new Map(state.returns);
      newReturns.set(returnId, {
        returnId,
        assignmentId,
        receivedBoxes,
        shortageBoxes,
        shortageReason,
        evidenceRefs: evidenceRefs || [],
        trackingKey,
        actor,
        receivedAt,
        idempotencyKey,
        batchId: state.currentBatch?.batchId || "",
        sourceQr: state.currentBatch?.sourceQr || "",
      });

      const newLines = new Map(state.lines);
      const line = newLines.get(trackingKey);
      if (line) {
        line.returnedBoxes += receivedBoxes;
        line.approvedLossBoxes += shortageBoxes;
      }

      const newAssignments = new Map(state.assignments);
      const assignment = newAssignments.get(action.payload.assignmentId);
      if (assignment) {
        assignment.status = (shortageBoxes || 0) > 0 ? "partial" : "returned";
      }

      const newDiscrepancies = new Map(state.discrepancies);
      if ((shortageBoxes || 0) > 0) {
        const discrepancyId = `disc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        newDiscrepancies.set(discrepancyId, {
          discrepancyId,
          batchId: state.currentBatch?.batchId,
          trackingKey,
          type: "SHORTAGE",
          boxes: shortageBoxes,
          reason: action.payload.shortageReason,
          evidenceRefs: action.payload.evidenceRefs || [],
          reportedBy: actor,
          reportedAt: new Date().toISOString(),
          approvedBy: null,
          approvedAt: null,
          resolution: null,
          status: "pending",
        });
      }

      return {
        ...state,
        returns: newReturns,
        assignments: newAssignments,
        lines: newLines,
        discrepancies: newDiscrepancies,
        currentBatch: state.currentBatch
          ? {
              ...state.currentBatch,
              actualTotals: {
                ...state.currentBatch.actualTotals,
                returned: state.currentBatch.actualTotals.returned + receivedBoxes,
                loss: state.currentBatch.actualTotals.loss + (action.payload.shortageBoxes || 0),
              },
            }
          : null,
        version: state.version + 1,
      };
    }

    case "CREATE_OUTPUT_PALLETS": {
      const { outputPallets, trackingKey } = action.payload;
      const newOutputPallets = new Map(state.outputPallets);

      const newLines = new Map(state.lines);
      const line = newLines.get(trackingKey);
      if (line) {
        const addedBoxes = action.payload.outputPallets.reduce(
          (sum: number, p: any) => sum + p.boxes,
          0,
        );
        line.outputBoxes += addedBoxes;
      }

      return {
        ...state,
        outputPallets: newOutputPallets,
        lines: newLines,
        currentBatch: state.currentBatch
          ? {
              ...state.currentBatch,
              actualTotals: {
                ...state.currentBatch.actualTotals,
                output:
                  state.currentBatch.actualTotals.output +
                  action.payload.outputPallets.reduce((sum: number, p: any) => sum + p.boxes, 0),
              },
            }
          : null,
        version: state.version + 1,
      };
    }

    case "RECONCILE_BATCH": {
      const { expectedVersion } = action.payload;
      if (state.version !== expectedVersion) {
        return { ...state, error: "Version conflict: batch was modified by another user" };
      }

      const linesWithPending: string[] = [];
      for (const line of state.lines.values()) {
        const pending = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
        if (pending > 0) {
          linesWithPending.push(line.trackingKey);
        }
      }

      if (linesWithPending.length === 0) {
        return {
          ...state,
          status: "reconciling",
          currentBatch: state.currentBatch
            ? {
                ...state.currentBatch,
                status: "reconciling",
                reconciledAt: new Date().toISOString(),
              }
            : null,
          version: state.version + 1,
        };
      }

      return {
        ...state,
        status: "reconciling",
        currentBatch: state.currentBatch
          ? { ...state.currentBatch, status: "reconciling", needsDiscrepancy: linesWithPending }
          : null,
        version: state.version + 1,
      };
    }

    case "CLOSE_BATCH": {
      const { resolution, expectedVersion } = action.payload;
      if (state.version !== expectedVersion) {
        return { ...state, error: "Version conflict: batch was modified by another user" };
      }

      const isFullyReconciled = resolution.type === "reconciled";

      if (!isFullyReconciled) {
        for (const [, line] of state.lines) {
          const pending = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
          if (pending > 0) {
            const hasApprovedDiscrepancy = Array.from(state.discrepancies.values()).some(
              (d: any) => d.trackingKey === line.trackingKey && d.status === "approved",
            );
            if (!hasApprovedDiscrepancy) {
              return {
                ...state,
                error: `Line ${line.trackingKey} has pending boxes without approved discrepancy`,
              };
            }
          }
        }
      }

      const workedLines = new Map();
      for (const [trackingKey, line] of state.lines) {
        if (isFullyReconciled) {
          workedLines.set(trackingKey, line.assignedBoxes);
        } else {
          const pending = line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes;
          workedLines.set(trackingKey, line.assignedBoxes - pending);
        }
      }

      const finalStatus = isFullyReconciled ? "closed_reconciled" : "closed_with_discrepancy";

      return {
        ...state,
        status: finalStatus,
        currentBatch: state.currentBatch
          ? {
              ...state.currentBatch,
              status: finalStatus,
              closedAt: new Date().toISOString(),
              workedLines,
            }
          : null,
        version: state.version + 1,
      };
    }

    case "CANCEL_BATCH_WITH_REVERSAL": {
      const { reason, expectedVersion } = action.payload;
      if (state.version !== expectedVersion) {
        return { ...state, error: "Version conflict: batch was modified by another user" };
      }
      return {
        ...state,
        status: "cancelled_with_reversal",
        currentBatch: state.currentBatch
          ? {
              ...state.currentBatch,
              status: "cancelled_with_reversal",
              closedAt: new Date().toISOString(),
            }
          : null,
        version: state.version + 1,
      };
    }

    case "SET_EVIDENCE_REF": {
      const newEvidenceRefs = [...state.evidenceRefs, action.payload];
      return { ...state, evidenceRefs: newEvidenceRefs };
    }

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "RESET_ALL":
      return {
        currentBatch: null,
        status: "draft" as const,
        lines: new Map(),
        assignments: new Map(),
        returns: new Map(),
        outputPallets: new Map(),
        discrepancies: new Map(),
        evidenceRefs: [],
        version: 0,
        isLoading: false,
        error: null,
      };

    default:
      return state;
  }
}

interface LabelingBatchContextValue {
  currentBatch: any | null;
  status: string;
  lines: Map<string, any>;
  assignments: Map<string, any>;
  returns: Map<string, any>;
  outputPallets: Map<string, any>;
  discrepancies: Map<string, any>;
  evidenceRefs: any[];
  version: number;
  isLoading: boolean;
  error: string | null;
  createBatch: (data: any) => void;
  planBatch: (expectedVersion: number) => void;
  cancelBatch: (reason: string) => void;
  addLine: (line: any) => void;
  updateLine: (lineId: string, updates: Partial<any>) => void;
  removeLine: (lineId: string) => void;
  confirmHandoff: (data: any) => void;
  registerReturn: (data: any) => void;
  createOutputPallets: (data: any) => void;
  reconcileBatch: (expectedVersion: number) => void;
  closeBatch: (resolution: any, expectedVersion: number) => void;
  cancelBatchWithReversal: (reason: string, expectedVersion: number) => void;
  setEvidenceRef: (evidenceRef: any) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  resetAll: () => void;
}

const LabelingBatchContext = createContext<any>(null);

interface LabelingBatchProviderProps {
  children: ReactNode;
  initialState?: Partial<any>;
}

export function LabelingBatchProvider({ children, initialState }: any) {
  const [state, dispatch] = useReducer(labelingBatchReducer, {
    ...defaultInitialState,
    ...initialState,
  });

  const createBatch = useCallback((data: any) => {
    dispatch({ type: "CREATE_BATCH", payload: data });
  }, []);

  const planBatch = useCallback((expectedVersion: number) => {
    dispatch({ type: "PLAN_BATCH", payload: { expectedVersion } });
  }, []);

  const cancelBatch = useCallback((reason: string) => {
    dispatch({
      type: "CANCEL_BATCH_WITH_REVERSAL",
      payload: { reason, expectedVersion: state.version },
    });
  }, []);

  const addLine = useCallback((line: any) => {
    dispatch({ type: "ADD_LINE", payload: line });
  }, []);

  const updateLine = useCallback((lineId: string, updates: Partial<any>) => {
    dispatch({ type: "UPDATE_LINE", payload: { lineId, updates } });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    dispatch({ type: "REMOVE_LINE", payload: { lineId } });
  }, []);

  const confirmHandoff = useCallback((data: any) => {
    dispatch({ type: "CONFIRM_HANDOFF", payload: data });
  }, []);

  const registerReturn = useCallback((data: any) => {
    dispatch({ type: "REGISTER_RETURN", payload: data });
  }, []);

  const createOutputPallets = useCallback((data: any) => {
    dispatch({ type: "CREATE_OUTPUT_PALLETS", payload: data });
  }, []);

  const reconcileBatch = useCallback((expectedVersion: number) => {
    dispatch({ type: "RECONCILE_BATCH", payload: { expectedVersion } });
  }, []);

  const closeBatch = useCallback((resolution: any, expectedVersion: number) => {
    dispatch({ type: "CLOSE_BATCH", payload: { resolution, expectedVersion } });
  }, []);

  const cancelBatchWithReversal = useCallback((reason: string, expectedVersion: number) => {
    dispatch({ type: "CANCEL_BATCH_WITH_REVERSAL", payload: { reason, expectedVersion } });
  }, []);

  const setEvidenceRef = useCallback((evidenceRef: any) => {
    dispatch({ type: "SET_EVIDENCE_REF", payload: evidenceRef });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: error });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_LOADING", payload: loading });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: "RESET_ALL" });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
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
    }),
    [
      state,
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
    ],
  );

  return <LabelingBatchContext.Provider value={value}>{children}</LabelingBatchContext.Provider>;
}

export function useLabelingBatchContext(): any {
  const context = useContext(LabelingBatchContext);
  if (!context) {
    throw new Error("useLabelingBatchContext must be used within a LabelingBatchProvider");
  }
  return context;
}

export default LabelingBatchContext;
