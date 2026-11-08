/**
 * useReceptionFlow — God Component Refactor Phase 3
 *
 * Navigation + state transitions for reception workflow.
 * Delegates to ReceptionContext, adds validation before navigation.
 */

import { useCallback } from 'react';
import { useReceptionContext } from '@/context';
import { useUIContext } from '@/context';
import { useNavigate } from 'react-router-dom';
import type { Screen, NavItem, ReceptionData, EvidenciaData, Tarima } from '@/types';

// ============================================
// Hook Return Type
// ============================================

interface UseReceptionFlowReturn {
  // State (from context)
  currentReception: ReceptionData | null;
  sessionState: ReturnType<typeof useReceptionContext>['sessionState'];
  editId: string | null;
  editReceptionData: ReceptionData | null;
  scannedQrCode: string | null;
  selectedEvidencia: EvidenciaData | null;
  tarimaActual: Tarima | null;
  // Navigation state (from context)
  currentScreen: Screen;
  activeNav: NavItem;

  // Actions
  startNewReception: (data: ReceptionData) => void;
  continueToEvidence: () => void;
  continueToPallets: () => void;
  completeReception: () => void;
  editReception: (id: string, data: ReceptionData) => void;
  viewTarimaDetalle: (tarima: Tarima) => void;
  cancelReception: () => void;
  setCurrentReception: (data: ReceptionData | null) => void;
  transition: (phase: ReturnType<typeof useReceptionContext>['sessionState']) => void;
  setScannedQrCode: (code: string | null) => void;
  setSelectedEvidencia: (item: EvidenciaData | null) => void;
  setTarimaActual: (pallet: Tarima | null) => void;
  navigate: (screen: Screen, nav?: NavItem) => void;
  resetAll: () => void;
}

// ============================================
// Hook
// ============================================

export function useReceptionFlow(): UseReceptionFlowReturn {
  const {
    currentReception,
    sessionState,
    editId,
    editReceptionData,
    scannedQrCode,
    selectedEvidencia,
    tarimaActual,
    currentScreen,
    activeNav,
    setCurrentReception,
    transition,
    editReception: ctxEditReception,
    cancelEdit: ctxCancelEdit,
    setScannedQrCode: ctxSetScannedQrCode,
    setSelectedEvidencia: ctxSetSelectedEvidencia,
    setTarimaActual: ctxSetTarimaActual,
    resetAll: ctxResetAll,
  } = useReceptionContext();

  const { closeSidebarOnMobile } = useUIContext();
  const navigate = useNavigate();

  // Navigation with sidebar close on mobile
  const navigateWithSidebar = useCallback(
    (screen: Screen, nav?: NavItem) => {
      navigate(screen);
      closeSidebarOnMobile();
      // Note: Active nav update is handled by UIContext or screen components
      // The nav parameter is kept for API compatibility
    },
    [navigate, closeSidebarOnMobile]
  );

  // Start a new reception (from NuevaRecepcionStep1/Step2)
  const startNewReception = useCallback(
    (data: ReceptionData) => {
      setCurrentReception(data);
      transition('planning');
      navigateWithSidebar('nueva-step1');
    },
    [setCurrentReception, transition, navigateWithSidebar]
  );

  // Continue from Step 1 to Evidence capture
  const continueToEvidence = useCallback(() => {
    if (!currentReception) {
      console.warn('[useReceptionFlow] Cannot continue to evidence: no current reception');
      return;
    }
    transition('evidence');
    navigateWithSidebar('captura-evidencia');
  }, [currentReception, transition, navigateWithSidebar]);

  // Continue from Evidence to Pallet capture
  const continueToPallets = useCallback(() => {
    if (!currentReception) {
      console.warn('[useReceptionFlow] Cannot continue to pallets: no current reception');
      return;
    }
    transition('pallets');
    navigateWithSidebar('captura-tarima');
  }, [currentReception, transition, navigateWithSidebar]);

  // Complete the reception (from Completada or CapturaTarima)
  const completeReception = useCallback(() => {
    transition('completed');
    navigateWithSidebar('completada');
  }, [transition, navigateWithSidebar]);

  // Edit an existing reception
  const editReception = useCallback(
    (id: string, data: ReceptionData) => {
      ctxEditReception(id, data);
      navigateWithSidebar('editar-recepcion');
    },
    [ctxEditReception, navigateWithSidebar]
  );

  // View tarima detail (from CapturaTarima or QR scan)
  const viewTarimaDetalle = useCallback(
    (tarima: Tarima) => {
      ctxSetTarimaActual(tarima);
      navigateWithSidebar('tarima-detalle', 'qr');
    },
    [ctxSetTarimaActual, navigateWithSidebar]
  );

  // Cancel current reception flow
  const cancelReception = useCallback(() => {
    ctxCancelEdit();
    ctxResetAll();
    navigateWithSidebar('home');
  }, [ctxCancelEdit, ctxResetAll, navigateWithSidebar]);

  return {
    // State
    currentReception,
    sessionState,
    editId,
    editReceptionData,
    scannedQrCode,
    selectedEvidencia,
    tarimaActual,
    // Navigation state (from context)
    currentScreen,
    activeNav,

    // Actions
    startNewReception,
    continueToEvidence,
    continueToPallets,
    completeReception,
    editReception,
    viewTarimaDetalle,
    cancelReception,
    setCurrentReception,
    transition,
    setScannedQrCode: ctxSetScannedQrCode,
    setSelectedEvidencia: ctxSetSelectedEvidencia,
    setTarimaActual: ctxSetTarimaActual,
    navigate: navigateWithSidebar,
    resetAll: ctxResetAll,
  };
}

export default useReceptionFlow;