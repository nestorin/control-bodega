/**
 * LabelingUIContext — UI state for Labeling Module
 *
 * Manages responsive layout state: mobile/desktop detection, sidebar open/close,
 * current screen, header configuration.
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

// ============================================
// State & Action Types
// ============================================

export type LabelingScreen = "nueva" | "entregar" | "recibir" | "conciliar" | "dashboard";

export interface LabelingHeaderConfig {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
}

interface LabelingUIState {
  isMobile: boolean;
  sidebarOpen: boolean;
  currentScreen: LabelingScreen;
  headerConfig: LabelingHeaderConfig;
}

type LabelingUIAction =
  | { type: "SET_MOBILE"; payload: boolean }
  | { type: "SET_SIDEBAR_OPEN"; payload: boolean }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_CURRENT_SCREEN"; payload: LabelingScreen }
  | { type: "SET_HEADER_CONFIG"; payload: Partial<LabelingHeaderConfig> }
  | { type: "RESET_HEADER_CONFIG" }
  | { type: "RESET_ALL" };

const initialState: LabelingUIState = {
  isMobile: typeof window !== "undefined" ? window.innerWidth < 1024 : false,
  sidebarOpen: false,
  currentScreen: "nueva",
  headerConfig: {
    title: "Etiquetado",
    subtitle: "",
    actions: undefined,
    showBackButton: false,
    onBack: undefined,
  },
};

function labelingUIReducer(state: LabelingUIState, action: LabelingUIAction): LabelingUIState {
  switch (action.type) {
    case "SET_MOBILE":
      return { ...state, isMobile: action.payload };
    case "SET_SIDEBAR_OPEN":
      return { ...state, sidebarOpen: action.payload };
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "SET_CURRENT_SCREEN":
      return { ...state, currentScreen: action.payload };
    case "SET_HEADER_CONFIG":
      return {
        ...state,
        headerConfig: { ...state.headerConfig, ...action.payload },
      };
    case "RESET_HEADER_CONFIG":
      return { ...state, headerConfig: initialState.headerConfig };
    case "RESET_ALL":
      return initialState;
    default:
      return state;
  }
}

// ============================================
// Context & Provider
// ============================================

interface LabelingUIContextValue extends LabelingUIState {
  setMobile: (isMobile: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCurrentScreen: (screen: LabelingScreen) => void;
  setHeaderConfig: (config: Partial<LabelingHeaderConfig>) => void;
  resetHeaderConfig: () => void;
  resetAll: () => void;
}

const LabelingUIContext = createContext<LabelingUIContextValue | null>(null);

interface LabelingUIProviderProps {
  children: ReactNode;
}

export function LabelingUIProvider({ children }: LabelingUIProviderProps) {
  const [state, dispatch] = useReducer(labelingUIReducer, initialState);

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      dispatch({ type: "SET_MOBILE", payload: window.innerWidth < 1024 });
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const setMobile = useCallback((isMobile: boolean) => {
    dispatch({ type: "SET_MOBILE", payload: isMobile });
  }, []);

  const setSidebarOpen = useCallback((open: boolean) => {
    dispatch({ type: "SET_SIDEBAR_OPEN", payload: open });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: "TOGGLE_SIDEBAR" });
  }, []);

  const setCurrentScreen = useCallback((screen: LabelingScreen) => {
    dispatch({ type: "SET_CURRENT_SCREEN", payload: screen });
  }, []);

  const setHeaderConfig = useCallback((config: Partial<LabelingHeaderConfig>) => {
    dispatch({ type: "SET_HEADER_CONFIG", payload: config });
  }, []);

  const resetHeaderConfig = useCallback(() => {
    dispatch({ type: "RESET_HEADER_CONFIG" });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: "RESET_ALL" });
  }, []);

  const value = useMemo<LabelingUIContextValue>(
    () => ({
      ...state,
      setMobile,
      setSidebarOpen,
      toggleSidebar,
      setCurrentScreen,
      setHeaderConfig,
      resetHeaderConfig,
      resetAll,
    }),
    [
      state,
      setMobile,
      setSidebarOpen,
      toggleSidebar,
      setCurrentScreen,
      setHeaderConfig,
      resetHeaderConfig,
      resetAll,
    ],
  );

  return <LabelingUIContext.Provider value={value}>{children}</LabelingUIContext.Provider>;
}

export function useLabelingUIContext(): LabelingUIContextValue {
  const context = useContext(LabelingUIContext);
  if (!context) {
    throw new Error("useLabelingUIContext must be used within a LabelingUIProvider");
  }
  return context;
}

export default LabelingUIContext;
