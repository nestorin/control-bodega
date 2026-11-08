/**
 * LabelingOfflineContext — Labeling Module Phase 2
 *
 * Offline queue management for labeling operations.
 * Reuses the existing VITE_FIRESTORE_OFFLINE_QUEUE pattern.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import type {
  LabelingAssignment,
  LabelingReturn,
  LabelingOutputPallet,
  LabelingDiscrepancy,
  EvidenceRef,
} from "@/types/labeling";
import { isFeatureEnabled } from "@/config/featureFlags";

// ============================================
// State & Action Types
// ============================================

export interface OfflineQueueItem {
  id: string;
  type: "assignment" | "return" | "output" | "discrepancy" | "evidence";
  payload: any;
  timestamp: number;
  retryCount: number;
  lastAttempt?: number;
}

interface LabelingOfflineState {
  queue: OfflineQueueItem[];
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: number | null;
  syncError: Error | null;
}

type LabelingOfflineAction =
  | { type: "ADD_TO_QUEUE"; payload: Omit<OfflineQueueItem, "id" | "timestamp" | "retryCount"> }
  | { type: "REMOVE_FROM_QUEUE"; payload: string }
  | { type: "UPDATE_QUEUE_ITEM"; payload: { id: string; updates: Partial<OfflineQueueItem> } }
  | { type: "SET_ONLINE"; payload: boolean }
  | { type: "SET_SYNC_ERROR"; payload: Error | null }
  | { type: "SET_LAST_SYNC"; payload: number }
  | { type: "CLEAR_QUEUE" }
  | { type: "RESET_ALL" };

const initialState: LabelingOfflineState = {
  queue: [],
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingCount: 0,
  lastSyncAt: null,
  syncError: null,
};

function labelingOfflineReducer(
  state: LabelingOfflineState,
  action: LabelingOfflineAction,
): LabelingOfflineState {
  switch (action.type) {
    case "ADD_TO_QUEUE": {
      const newItem: OfflineQueueItem = {
        ...action.payload,
        id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        retryCount: 0,
      };
      return {
        ...state,
        queue: [...state.queue, newItem],
        pendingCount: state.pendingCount + 1,
      };
    }
    case "REMOVE_FROM_QUEUE":
      return {
        ...state,
        queue: state.queue.filter((item) => item.id !== action.payload),
        pendingCount: Math.max(0, state.pendingCount - 1),
      };
    case "UPDATE_QUEUE_ITEM":
      return {
        ...state,
        queue: state.queue.map((item) =>
          item.id === action.payload.id ? { ...item, ...action.payload.updates } : item,
        ),
      };
    case "SET_ONLINE":
      return { ...state, isOnline: action.payload };
    case "SET_SYNC_ERROR":
      return { ...state, syncError: action.payload };
    case "SET_LAST_SYNC":
      return { ...state, lastSyncAt: action.payload };
    case "CLEAR_QUEUE":
      return { ...state, queue: [], pendingCount: 0 };
    case "RESET_ALL":
      return initialState;
    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface LabelingOfflineContextValue extends LabelingOfflineState {
  enqueueAssignment: (assignment: LabelingAssignment) => void;
  enqueueReturn: (returnData: LabelingReturn) => void;
  enqueueOutput: (output: LabelingOutputPallet) => void;
  enqueueDiscrepancy: (discrepancy: LabelingDiscrepancy) => void;
  enqueueEvidence: (evidence: EvidenceRef) => void;
  processQueue: () => Promise<void>;
  clearQueue: () => void;
}

const LabelingOfflineContext = createContext<LabelingOfflineContextValue | null>(null);

interface LabelingOfflineProviderProps {
  children: ReactNode;
}

export function LabelingOfflineProvider({ children }: LabelingOfflineProviderProps) {
  const [state, dispatch] = useReducer(labelingOfflineReducer, initialState);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => dispatch({ type: "SET_ONLINE", payload: true });
    const handleOffline = () => dispatch({ type: "SET_ONLINE", payload: false });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const enqueueAssignment = useCallback((assignment: LabelingAssignment) => {
    dispatch({
      type: "ADD_TO_QUEUE",
      payload: { type: "assignment", payload: assignment },
    });
  }, []);

  const enqueueReturn = useCallback((returnData: LabelingReturn) => {
    dispatch({
      type: "ADD_TO_QUEUE",
      payload: { type: "return", payload: returnData },
    });
  }, []);

  const enqueueOutput = useCallback((output: LabelingOutputPallet) => {
    dispatch({
      type: "ADD_TO_QUEUE",
      payload: { type: "output", payload: output },
    });
  }, []);

  const enqueueDiscrepancy = useCallback((discrepancy: LabelingDiscrepancy) => {
    dispatch({
      type: "ADD_TO_QUEUE",
      payload: { type: "discrepancy", payload: discrepancy },
    });
  }, []);

  const enqueueEvidence = useCallback((evidence: EvidenceRef) => {
    dispatch({
      type: "ADD_TO_QUEUE",
      payload: { type: "evidence", payload: evidence },
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (!state.isOnline || state.queue.length === 0) return;

    // Sort by timestamp (FIFO)
    const sortedQueue = [...state.queue].sort((a, b) => a.timestamp - b.timestamp);

    for (const item of sortedQueue) {
      if (item.retryCount >= 3) {
        // Max retries reached, could move to dead letter queue
        console.warn("Offline item max retries reached:", item.id);
        continue;
      }

      try {
        // Update retry count
        dispatch({
          type: "UPDATE_QUEUE_ITEM",
          payload: {
            id: item.id,
            updates: { retryCount: item.retryCount + 1, lastAttempt: Date.now() },
          },
        });

        // Process based on type
        // This would call the actual Callables
        // For now, just simulate success
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Remove on success
        dispatch({ type: "REMOVE_FROM_QUEUE", payload: item.id });
      } catch (error) {
        console.error("Failed to process offline item:", item.id, error);
        dispatch({
          type: "SET_SYNC_ERROR",
          payload: error instanceof Error ? error : new Error("Sync failed"),
        });
      }
    }

    dispatch({ type: "SET_LAST_SYNC", payload: Date.now() });
  }, [state.isOnline, state.queue]);

  const clearQueue = useCallback(() => {
    dispatch({ type: "CLEAR_QUEUE" });
  }, []);

  const value = useMemo<LabelingOfflineContextValue>(
    () => ({
      ...state,
      enqueueAssignment,
      enqueueReturn,
      enqueueOutput,
      enqueueDiscrepancy,
      enqueueEvidence,
      processQueue,
      clearQueue,
    }),
    [
      state,
      enqueueAssignment,
      enqueueReturn,
      enqueueOutput,
      enqueueDiscrepancy,
      enqueueEvidence,
      processQueue,
      clearQueue,
    ],
  );

  return (
    <LabelingOfflineContext.Provider value={value}>{children}</LabelingOfflineContext.Provider>
  );
}

export function useLabelingOfflineContext(): LabelingOfflineContextValue {
  const context = useContext(LabelingOfflineContext);
  if (!context) {
    throw new Error("useLabelingOfflineContext must be used within a LabelingOfflineProvider");
  }
  return context;
}

export default LabelingOfflineContext;
