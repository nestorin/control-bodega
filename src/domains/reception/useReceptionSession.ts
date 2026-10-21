import { useCallback, useEffect, useReducer } from "react";

export type ReceptionSessionPhase =
  | "PROGRAMMING"
  | "REVIEW"
  | "EVIDENCE"
  | "PALLETS"
  | "CONFIRMED"
  | "COMPLETED";

export interface ReceptionSessionData {
  receptionId: string;
  folio: string;
  warehouseId: string;
  supplierId?: string;
  provider: string;
  logisticsProvider: string;
  productIds: string[];
  totalPallets: number;
  draftExpiresAt?: number;
}

export interface ReceptionSession {
  phase: ReceptionSessionPhase;
  data: ReceptionSessionData | null;
}

const transitions: Record<ReceptionSessionPhase, ReceptionSessionPhase[]> = {
  PROGRAMMING: ["REVIEW"],
  REVIEW: ["EVIDENCE"],
  EVIDENCE: ["PALLETS"],
  PALLETS: ["CONFIRMED"],
  CONFIRMED: ["COMPLETED"],
  COMPLETED: [],
};

const STORAGE_KEY = "exepa:reception-session:v1";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function loadSession(): ReceptionSession {
  if (typeof window === "undefined") return { phase: "PROGRAMMING", data: null };
  try {
    const value = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "null",
    ) as ReceptionSession | null;
    if (!value?.data || (value.data.draftExpiresAt ?? 0) < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return { phase: "PROGRAMMING", data: null };
    }
    return value;
  } catch {
    return { phase: "PROGRAMMING", data: null };
  }
}

export function canTransitionReception(
  from: ReceptionSessionPhase,
  to: ReceptionSessionPhase,
): boolean {
  return transitions[from].includes(to);
}

export function transitionReception(
  session: ReceptionSession,
  to: ReceptionSessionPhase,
): ReceptionSession {
  if (!session.data || !canTransitionReception(session.phase, to)) {
    throw new Error(`Invalid reception transition: ${session.phase} -> ${to}`);
  }
  return { ...session, phase: to };
}

type Action =
  | {
      type: "START";
      data: ReceptionSessionData;
      phase: ReceptionSessionPhase;
    }
  | {
      type: "TRANSITION";
      phase: ReceptionSessionPhase;
    }
  | { type: "END" };

function reducer(session: ReceptionSession, action: Action): ReceptionSession {
  if (action.type === "START") return { phase: action.phase, data: action.data };
  if (action.type === "END") return { phase: "PROGRAMMING", data: null };
  return transitionReception(session, action.phase);
}

export function useReceptionSession() {
  const [session, dispatch] = useReducer(reducer, undefined, loadSession);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session.data || session.phase === "COMPLETED") {
      if (session.phase === "COMPLETED") window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);
  const startSession = useCallback(
    (data: ReceptionSessionData, phase: ReceptionSessionPhase = "PROGRAMMING") =>
      dispatch({
        type: "START",
        data: {
          ...data,
          draftExpiresAt: data.draftExpiresAt ?? Date.now() + SESSION_TTL_MS,
        },
        phase,
      }),
    [],
  );
  const transition = useCallback(
    (phase: ReceptionSessionPhase) => dispatch({ type: "TRANSITION", phase }),
    [],
  );
  const endSession = useCallback(() => dispatch({ type: "END" }), []);
  return { session, startSession, transition, endSession };
}
