/**
 * ReceptionContext — Global reception state + navigation coordination
 * Uses useReducer for predictable state transitions across the reception workflow.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import type {
  ReceptionData,
  ReceptionSessionPhase,
  EvidenciaData,
  Tarima,
  Screen,
  NavItem,
} from '@/types';

// ============================================
// State & Action Types
// ============================================

interface ReceptionState {
  currentReception: ReceptionData | null;
  sessionState: ReceptionSessionPhase;
  editId: string | null;
  editReceptionData: ReceptionData | null;
  scannedQrCode: string | null;
  selectedEvidencia: EvidenciaData | null;
  tarimaActual: Tarima | null;
  // Navigation state (moved from AppLayout)
  currentScreen: Screen;
  activeNav: NavItem;
}

type ReceptionAction =
  | { type: 'SET_CURRENT_RECEPTION'; payload: ReceptionData | null }
  | { type: 'TRANSITION'; payload: ReceptionSessionPhase }
  | { type: 'NAVIGATE'; payload: { screen: Screen; nav?: NavItem } }
  | { type: 'EDIT_RECEPTION'; payload: { id: string; data: ReceptionData } }
  | { type: 'CANCEL_EDIT' }
  | { type: 'SET_SCANNED_QR'; payload: string | null }
  | { type: 'SET_SELECTED_EVIDENCIA'; payload: EvidenciaData | null }
  | { type: 'SET_TARIMA_ACTUAL'; payload: Tarima | null }
  | { type: 'RESET_ALL' };

// ============================================
// Initial State
// ============================================

const defaultInitialState: ReceptionState = {
  currentReception: null,
  sessionState: 'idle',
  editId: null,
  editReceptionData: null,
  scannedQrCode: null,
  selectedEvidencia: null,
  tarimaActual: null,
  currentScreen: 'home',
  activeNav: 'home',
};

// ============================================
// Reducer
// ============================================

function receptionReducer(state: ReceptionState, action: ReceptionAction): ReceptionState {
  switch (action.type) {
    case 'SET_CURRENT_RECEPTION':
      return {
        ...state,
        currentReception: action.payload,
        // Reset session state when new reception starts
        sessionState: action.payload ? 'planning' : 'idle',
      };

    case 'TRANSITION': {
      // Validate state transitions
      const validTransitions: Record<ReceptionSessionPhase, ReceptionSessionPhase[]> = {
        idle: ['planning', 'editing'],
        planning: ['evidence', 'pallets', 'idle'],
        evidence: ['pallets', 'planning', 'idle'],
        pallets: ['completed', 'evidence', 'idle'],
        completed: ['idle', 'editing'],
        editing: ['pallets', 'completed', 'idle'],
      };

      const allowed = validTransitions[state.sessionState] ?? [];
      if (!allowed.includes(action.payload)) {
        console.warn(
          `[ReceptionContext] Invalid transition: ${state.sessionState} -> ${action.payload}`
        );
        return state;
      }

      return {
        ...state,
        sessionState: action.payload,
      };
    }

    case 'NAVIGATE': {
      const { screen, nav } = action.payload;
      return {
        ...state,
        currentScreen: screen,
        activeNav: nav ?? state.activeNav,
      };
    }

    case 'EDIT_RECEPTION':
      return {
        ...state,
        editId: action.payload.id,
        editReceptionData: action.payload.data,
        sessionState: 'editing',
      };

    case 'CANCEL_EDIT':
      return {
        ...state,
        editId: null,
        editReceptionData: null,
        sessionState: 'idle',
      };

    case 'SET_SCANNED_QR':
      return {
        ...state,
        scannedQrCode: action.payload,
      };

    case 'SET_SELECTED_EVIDENCIA':
      return {
        ...state,
        selectedEvidencia: action.payload,
      };

    case 'SET_TARIMA_ACTUAL':
      return {
        ...state,
        tarimaActual: action.payload,
      };

    case 'RESET_ALL':
      return defaultInitialState;

    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface ReceptionContextValue extends ReceptionState {
  // Actions
  setCurrentReception: (data: ReceptionData | null) => void;
  transition: (phase: ReceptionSessionPhase) => void;
  navigate: (screen: Screen, nav?: NavItem) => void;
  editReception: (id: string, data: ReceptionData) => void;
  cancelEdit: () => void;
  setScannedQrCode: (code: string | null) => void;
  setSelectedEvidencia: (item: EvidenciaData | null) => void;
  setTarimaActual: (pallet: Tarima | null) => void;
  resetAll: () => void;
}

const ReceptionContext = createContext<ReceptionContextValue | null>(null);

interface ReceptionProviderProps {
  children: ReactNode;
  initialState?: Partial<ReceptionState>;
}

export function ReceptionProvider({ children, initialState }: ReceptionProviderProps) {
  const [state, dispatch] = useReducer(receptionReducer, {
    ...defaultInitialState,
    ...initialState,
  });

  const setCurrentReception = useCallback((data: ReceptionData | null) => {
    dispatch({ type: 'SET_CURRENT_RECEPTION', payload: data });
  }, []);

  const transition = useCallback((phase: ReceptionSessionPhase) => {
    dispatch({ type: 'TRANSITION', payload: phase });
  }, []);

  const navigate = useCallback((screen: Screen, nav?: NavItem) => {
    dispatch({ type: 'NAVIGATE', payload: { screen, nav } });
  }, []);

  const editReception = useCallback((id: string, data: ReceptionData) => {
    dispatch({ type: 'EDIT_RECEPTION', payload: { id, data } });
  }, []);

  const cancelEdit = useCallback(() => {
    dispatch({ type: 'CANCEL_EDIT' });
  }, []);

  const setScannedQrCode = useCallback((code: string | null) => {
    dispatch({ type: 'SET_SCANNED_QR', payload: code });
  }, []);

  const setSelectedEvidencia = useCallback((item: EvidenciaData | null) => {
    dispatch({ type: 'SET_SELECTED_EVIDENCIA', payload: item });
  }, []);

  const setTarimaActual = useCallback((pallet: Tarima | null) => {
    dispatch({ type: 'SET_TARIMA_ACTUAL', payload: pallet });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);

  const value = useMemo<ReceptionContextValue>(
    () => ({
      ...state,
      setCurrentReception,
      transition,
      navigate,
      editReception,
      cancelEdit,
      setScannedQrCode,
      setSelectedEvidencia,
      setTarimaActual,
      resetAll,
    }),
    [
      state,
      setCurrentReception,
      transition,
      navigate,
      editReception,
      cancelEdit,
      setScannedQrCode,
      setSelectedEvidencia,
      setTarimaActual,
      resetAll,
    ]
  );

  return <ReceptionContext.Provider value={value}>{children}</ReceptionContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useReceptionContext(): ReceptionContextValue {
  const context = useContext(ReceptionContext);
  if (!context) {
    throw new Error('useReceptionContext must be used within a ReceptionProvider');
  }
  return context;
}

export type { ReceptionContextValue };
export default ReceptionContext;