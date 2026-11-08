/**
 * UIContext — God Component Refactor Phase 2
 *
 * Pure UI state: mobile detection, sidebar state, header config derivation.
 * Zero business logic - only presentational state.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from 'react';
import type { HeaderConfig, Screen } from '@/types';
import { createHeaderConfig } from '@/config/navigation';

// ============================================
// State & Action Types
// ============================================

interface UIState {
  isMobile: boolean;
  sidebarOpen: boolean;
  // Derived header config (computed from current screen + reception state)
  header: HeaderConfig | null;
}

type UIAction =
  | { type: 'SET_MOBILE'; payload: boolean }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_HEADER'; payload: HeaderConfig | null }
  | { type: 'RESET_ALL' };

// ============================================
// Initial State
// ============================================

const initialState: UIState = {
  isMobile: false,
  sidebarOpen: false,
  header: null,
};

// ============================================
// Reducer
// ============================================

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_MOBILE':
      return {
        ...state,
        isMobile: action.payload,
        // Auto-close sidebar on mobile resize
        sidebarOpen: action.payload ? false : state.sidebarOpen,
      };

    case 'SET_SIDEBAR_OPEN':
      return { ...state, sidebarOpen: action.payload };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'SET_HEADER':
      return { ...state, header: action.payload };

    case 'RESET_ALL':
      return initialState;

    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface UIContextValue extends UIState {
  setMobile: (isMobile: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setHeader: (header: HeaderConfig | null) => void;
  // Derived helpers
  closeSidebarOnMobile: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

interface UIProviderProps {
  children: ReactNode;
  // Optional: current screen + reception state for dynamic header
  currentScreen?: Screen;
  currentReception?: { ocFolio?: string; tarimas?: number } | null;
  tarimaPosition?: number;
  tarimaTotal?: number;
}

export function UIProvider({
  children,
  currentScreen,
  currentReception,
  tarimaPosition = 1,
  tarimaTotal = 20,
}: UIProviderProps) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  // Mobile detection effect
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 769;
      dispatch({ type: 'SET_MOBILE', payload: mobile });
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Dynamic header config derivation
  useEffect(() => {
    if (currentScreen) {
      const headerConfig = createHeaderConfig(currentReception ?? null, tarimaPosition, tarimaTotal);
      dispatch({ type: 'SET_HEADER', payload: headerConfig[currentScreen] ?? null });
    }
  }, [currentScreen, currentReception, tarimaPosition, tarimaTotal]);

  const setMobile = useCallback((isMobile: boolean) => {
    dispatch({ type: 'SET_MOBILE', payload: isMobile });
  }, []);

  const setSidebarOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_SIDEBAR_OPEN', payload: open });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);

  const setHeader = useCallback((header: HeaderConfig | null) => {
    dispatch({ type: 'SET_HEADER', payload: header });
  }, []);

  const closeSidebarOnMobile = useCallback(() => {
    if (state.isMobile) {
      dispatch({ type: 'SET_SIDEBAR_OPEN', payload: false });
    }
  }, [state.isMobile]);

  const value = useMemo<UIContextValue>(
    () => ({
      ...state,
      setMobile,
      setSidebarOpen,
      toggleSidebar,
      setHeader,
      closeSidebarOnMobile,
    }),
    [state, setMobile, setSidebarOpen, toggleSidebar, setHeader, closeSidebarOnMobile]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useUIContext(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUIContext must be used within a UIProvider');
  }
  return context;
}

export type { UIContextValue };
export default UIContext;