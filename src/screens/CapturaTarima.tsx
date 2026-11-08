/**
 * CapturaTarima — Migrated to new architecture (God Component Refactor Phase 7)
 *
 * Uses hooks directly instead of props:
 * - useReceptionFlow for navigation and reception state
 * - useCatalogos for product catalog access
 * - useInventory for inventory operations
 * - useUIContext for UI state (mobile, sidebar)
 * - useQrScanner for typed QR scanning with AbortController
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { isFeatureEnabled } from '@/config/featureFlags';
import { createFirestoreServices } from '@/services/firestore';
import { db, storage } from '@/lib/firebase';
import { WAREHOUSE_IDS } from '@/config/warehouses';
import { useAuthorization } from '@/hooks/useAuthorization';
import { Timestamp } from 'firebase/firestore';
import { resolveCatalogProduct } from '@/services/domain/productMatching';
import { palletRegistrationErrorMessage } from '@/services/palletRegistrationError';
import { Panel } from '@/components/ui';
import { parseTarimaQR, buildTarimaQR } from '@/types/qrcode';
import type { PlannedReceptionPallet } from '@/services/firestore/types';
import {
  getFirstIncompletePalletIndex,
  shouldReadLocalPalletCache,
} from '@/domains/reception/receptionLifecycle';
import { useReceptionFlow } from '@/hooks/useReceptionFlow';
import { useCatalogos } from '@/hooks/useCatalogos';
import { useInventory } from '@/hooks/useInventory';
import { useUIContext } from '@/context';
import { useQrScanner } from '@/hooks/useQrScanner';

const assetPathPrefix = '/assets';
const imgIndicador = `${assetPathPrefix}/08d70.svg`;
const imgIndicador1 = `${assetPathPrefix}/9d6fd.svg`;
const imgArrowRight = `${assetPathPrefix}/55de6.svg`;
const imgCheck = `${assetPathPrefix}/3eae4.svg`;
const imgWarehouse = `${assetPathPrefix}/ccb3f.svg`;
const imgKey = `${assetPathPrefix}/key.svg`;

const ORG_ID = 'org_exepa_001';

function checkpointOperationId(receptionId: string, palletNumber: number): string {
  return `checkpoint-${receptionId.slice(-32)}-${palletNumber}-${Date.now()}`;
}

export function canCreateExtraPallet(accessStatus: string, role: string | undefined): boolean {
  return accessStatus === 'ACTIVE' && (role === 'ADMIN' || role === 'SUPERVISOR');
}

interface ConversionesTablaItem {
  producto: string;
  productId?: string | null;
  codigo: string;
  unidades: number;
  unidad: string;
  piezasPorCaja: number;
  cajasPorTarima: number;
  cajas: number;
  tarimas: number;
  stickers: number;
}

interface TarimaData {
  id: string;
  numero: number;
  total: number;
  ocFolio: string;
  fechaRecepcion: string;
  producto: string;
  productId?: string | null;
  codigo: string;
  caducidad: string;
  cajas: number;
  unidadesPorCaja: number;
  unidad: string;
  lote: string;
  observaciones: string;
  proveedor: string;
  proveedorLogistico: string;
  completed: boolean;
}

export default function CapturaTarima() {
  // ============================================
  // New Architecture Hooks (order matters - useAuthorization before useFirestore)
  // ============================================
  const {
    currentReception: ctxCurrentReception,
    setCurrentReception,
    setScannedQrCode,
    setTarimaActual,
    transition,
    navigate,
    completeReception,
  } = useReceptionFlow();

  const {
    catalogoProductos,
    catalogoConversiones,
    catalogosLoading,
    refreshCatalogos,
    getAlmacenActivo,
  } = useCatalogos();

  const {
    aumentarInventario,
    getInventarioAlmacen,
  } = useInventory();

  const { closeSidebarOnMobile, isMobile } = useUIContext();

  // Authorization must come before useFirestore logic
  const { accessStatus, profile, canQuery } = useAuthorization();

  // ============================================
  // QR Scanner Hook (Phase 6)
  // ============================================
  const {
    qrReaderRef,
    isScanning,
    scanError,
    lastResult,
    startScanning,
    stopScanning,
    onScanSuccess: handleQrScanSuccess,
    clearError: clearScannerError,
  } = useQrScanner();

  // ============================================
  // Legacy Props Fallback (for migration period)
  // ============================================
  const currentReception = ctxCurrentReception;
  const almacenActivo = getAlmacenActivo() ?? null;
  const catalogos = { productos: catalogoProductos };
  const onAumentarInventario = aumentarInventario;
  const onBack = () => navigate('home');
  const onFinish = () => navigate('completada');
  const conversionesTablaBase = (currentReception?.conversionesTabla ?? []) as unknown as ConversionesTablaItem[];

  // ============================================
  // Local State
  // ============================================
  const [testModeKey, setTestModeKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('test') === 'legacy-captura-tarima') {
      setTestModeKey((prev) => prev + 1);
    }
  }, []);

  // Use type assertion to handle the union of ConversionesTablaItem and ConversionTableRow
  const conversionesTabla = testModeKey > 0
    ? (JSON.parse(localStorage.getItem('conversionesTabla') || '[]') as ConversionesTablaItem[])
    : (conversionesTablaBase as unknown as ConversionesTablaItem[]);

  // ============================================
  // Firestore Services Init
  // ============================================
  const isTestMode = new URLSearchParams(window.location.search).get('test') === 'legacy-captura-tarima';
  const useFirestore = !isTestMode && isFeatureEnabled('USE_FIRESTORE_RECEPCIONES') && !!db && canQuery;
  const [fsServices, setFsServices] = useState<ReturnType<typeof createFirestoreServices> | null>(null);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const canAddExtraTarima = canCreateExtraPallet(accessStatus, profile?.role);

  // Initialize Firestore services
  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID);
      setFsServices(services);
      setFirestoreReady(true);
    }
  }, [useFirestore]);

  // ============================================
  // ConversionesTabla - Test mode support
  // ============================================
  const [tarimasList, setTarimasList] = useState<TarimaData[]>(() => {
    // Guard: if no currentReception, return empty
    if (!currentReception) return [];
    
    // Use the PlannedReceptionPallet from firestore/types which has the correct fields
    const plannedPallets = currentReception.plannedPallets as Array<{
      qrIdentifier: string;
      palletNumber: number;
      productId?: string;
      productName: string;
      quantity: number;
      unit: string;
      status?: string;
      lot?: string;
      expiryDate?: string;
    }> | undefined;
    
    if (plannedPallets?.length) {
      return plannedPallets.map((pallet) => ({
        id: pallet.qrIdentifier,
        numero: pallet.palletNumber,
        total: plannedPallets!.length,
        ocFolio: currentReception.ocFolio,
        fechaRecepcion: currentReception.fechaRecepcion || '',
        producto: pallet.productName,
        productId: pallet.productId,
        codigo: '',
        caducidad: pallet.expiryDate || currentReception.caducidad || '',
        cajas: pallet.quantity,
        unidadesPorCaja: 1,
        unidad: pallet.unit,
        lote: pallet.lot || currentReception.lote || '',
        observaciones: '',
        proveedor: currentReception.proveedor,
        proveedorLogistico: currentReception.proveedorLogistico,
        completed: pallet.status === 'ACTIVE' || pallet.status === 'RECEIVED',
      }));
    }
    if (conversionesTablaBase.length === 0) return [];

    const ocNumber = currentReception.ocFolio.replace('OC-', '');
    const fechaHoy =
      new Date().toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Mexico_City',
      }) +
      ` · ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' })}`;

    let numero = 1;
    return conversionesTablaBase.flatMap((conv: ConversionesTablaItem) =>
      Array.from({ length: conv.tarimas ?? 0 }, () => ({
        id: buildTarimaQR(ocNumber, numero++),
        numero: numero - 1,
        total: conversionesTablaBase.reduce((a, b: ConversionesTablaItem) => a + (b.tarimas ?? 0), 0),
        ocFolio: currentReception.ocFolio,
        fechaRecepcion: fechaHoy,
        producto: 'producto' in conv ? conv.producto : '',
        productId: 'productId' in conv ? conv.productId : undefined,
        codigo: 'codigo' in conv ? conv.codigo : '',
        caducidad: currentReception.caducidad || '',
        cajas: 'cajas' in conv && 'tarimas' in conv ? Math.ceil(conv.cajas / conv.tarimas) : 0,
        unidadesPorCaja: 'piezasPorCaja' in conv ? conv.piezasPorCaja : 1,
        unidad: 'unidad' in conv ? conv.unidad : 'cajas',
        lote: currentReception.lote || '',
        observaciones: '',
        proveedor: currentReception.proveedor,
        proveedorLogistico: currentReception.proveedorLogistico,
        completed: false,
      }))
    );
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [manualPalletId, setManualPalletId] = useState('');
  const [isValidatingManualId, setIsValidatingManualId] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const handlingScanRef = useRef(false);
  const scannerStartingRef = useRef(false);

  // Cleanup scanner on index change
  useEffect(() => {
    return () => stopScanning();
  }, [currentIndex, stopScanning]);

  // ============================================
  // Atomic Save Pattern (Race Condition Fix)
  // ============================================
  const STORAGE_KEY = `recepcion_${currentReception?.ocFolio}_tarimas`;

  // Save to localStorage immediately (backup)
  useEffect(() => {
    if (tarimasList.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tarimasList));
    }
  }, [tarimasList, currentReception?.ocFolio]);

  // Load from localStorage on init
  useEffect(() => {
    if (currentReception?.ocFolio) {
      const canonicalPlan = currentReception.plannedPallets;
      if (!shouldReadLocalPalletCache(Boolean(canonicalPlan?.length), useFirestore)) {
        setCurrentIndex(getFirstIncompletePalletIndex((canonicalPlan || []) as Array<{ status?: string }>));
        return;
      }
      const saved = localStorage.getItem(`recepcion_${currentReception.ocFolio}_tarimas`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTarimasList(parsed);
            // Find first incomplete
            const firstIncomplete = parsed.findIndex((t: TarimaData) => !t.completed);
            setCurrentIndex(firstIncomplete >= 0 ? firstIncomplete : parsed.length - 1);
          }
        } catch (e) {
          console.error('Error loading saved tarimas:', e);
        }
      }
    }
  }, [currentReception?.ocFolio, currentReception?.plannedPallets, useFirestore]);

  async function retryReceptionConfirmation() {
    if (!currentReception?.receptionId || !fsServices) return;
    setIsSaving(true);
    setConfirmationError(null);
    try {
      await fsServices.receptions.confirmReception(
        currentReception.receptionId,
        'user',
        `op-${Date.now()}-confirm`,
      );
      onFinish();
    } catch (error) {
      console.error('Reception confirmation retry failed:', error);
      setConfirmationError(
        'No se pudo confirmar; el progreso de tarimas quedó guardado. Reintentá.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  // ============================================
  // QR Scanner Integration (useQrScanner hook)
  // ============================================
  const handleScannedCode = useCallback(async (code: string) => {
    if (handlingScanRef.current) return;
    handlingScanRef.current = true;
    const parsed = parseTarimaQR(code);
    if (!parsed) {
      alert(`Código QR inválido: ${code}\nFormato esperado: TQR-24891-001`);
      handlingScanRef.current = false;
      return;
    }

    const tarimaIndex = tarimasList.findIndex((pallet) => pallet.id === code);
    const tarimaNum = String(parsed.tarimaIndex).padStart(3, '0');

    if (tarimaIndex < 0) {
      alert(`Tarima ${tarimaNum} no existe en esta recepción (total: ${tarimasList.length})`);
      handlingScanRef.current = false;
      return;
    }

    if (tarimasList[tarimaIndex].completed) {
      alert(`El código ${tarimaNum} ya está activo y asociado a una tarima.`);
      handlingScanRef.current = false;
      return;
    }
    try {
      if (useFirestore) {
        if (!fsServices || !currentReception?.receptionId) {
          throw new Error('Reception backend is not ready');
        }
        const validated = await fsServices.receptions.validatePalletScan(
          currentReception.receptionId,
          code,
          almacenActivo?.id || WAREHOUSE_IDS.NORTH,
        );
        setTarimasList((prev) =>
          prev.map((pallet, index) =>
            index === tarimaIndex
              ? {
                  ...pallet,
                  lote: validated.lot ?? pallet.lote,
                  caducidad: validated.expiryDate ?? pallet.caducidad,
                }
              : pallet,
          ),
        );
      }
      setScannedQrCode(code);
      setManualPalletId('');
      setCurrentIndex(tarimaIndex);
      stopScanning();
      setCaptureError(null);
    } catch (error) {
      console.error('Reception QR validation failed:', error);
      alert('Este QR no está disponible para esta recepción o ya fue activado.');
    } finally {
      handlingScanRef.current = false;
    }
  }, [tarimasList, useFirestore, fsServices, currentReception?.receptionId, almacenActivo?.id, setScannedQrCode, setCurrentIndex, stopScanning, setCaptureError]);

  async function handleManualPalletValidation() {
    const palletId = manualPalletId.trim();
    if (!palletId || isValidatingManualId) return;
    setIsValidatingManualId(true);
    try {
      await handleScannedCode(palletId);
    } finally {
      setIsValidatingManualId(false);
    }
  }

  async function persistCaptureCheckpoint(pallet: TarimaData) {
    if (!useFirestore) return;
    if (!fsServices || !currentReception?.receptionId) {
      setCaptureError('La conexión de recepción todavía no está lista; el avance no se guardó.');
      return;
    }
    try {
      await fsServices.receptions.savePalletCapture(
        currentReception.receptionId,
        pallet.id,
        pallet.lote.trim(),
        pallet.caducidad,
        checkpointOperationId(currentReception.receptionId, pallet.numero),
      );
      setCaptureError(null);
    } catch (error) {
      console.error('Pallet capture checkpoint failed:', error);
      setCaptureError(
        'No se pudo guardar el avance de esta tarima. Revisá la conexión y reintentá.',
      );
    }
  }

  async function handleSaveTarima() {
    if (!currentTarima) return;
    if (useFirestore && lastResult !== currentTarima.id) {
      alert('Escaneá el QR de esta tarima antes de activar su registro.');
      return;
    }

    // Validar campos requeridos
    const lotToSave = currentTarima.lote.trim() || autoLote.trim();
    const expiryToSave = currentTarima.caducidad || autoCaducidad;
    if (!lotToSave) {
      alert('El lote es obligatorio');
      return;
    }
    if (!expiryToSave.trim()) {
      alert('La fecha de caducidad es obligatoria');
      return;
    }

    // Save to localStorage first (atomic pattern)
    setIsSaving(true);
    setCaptureError(null);

    try {
      // Update tarima with lote/caducidad
      const updatedTarima: TarimaData = {
        ...currentTarima,
        lote: lotToSave,
        caducidad: expiryToSave,
        completed: true,
      };

      setTarimasList((prev) =>
        prev.map((pallet, index) =>
          index === currentIndex ? updatedTarima : pallet,
        ),
      );

      // Persist to Firestore
      if (useFirestore && fsServices && currentReception?.receptionId) {
        await fsServices.receptions.savePalletCapture(
          currentReception.receptionId,
          currentTarima.id,
          lotToSave,
          expiryToSave,
          checkpointOperationId(currentReception.receptionId, currentTarima.numero),
        );
      }

      // Update inventory
      if (currentReception?.productos) {
        const producto = currentReception.productos.find(
          (p) => p.nombre === currentTarima.producto,
        );
        if (producto?.productId) {
          onAumentarInventario(almacenActivo?.id || WAREHOUSE_IDS.NORTH, [
            { productoId: producto.productId, cajas: currentTarima.cajas },
          ]);
        }
      }

      // Move to next or complete
      if (isLastTarima) {
        transition('completed');
        navigate('completada');
      } else {
        setCurrentIndex((prev) => prev + 1);
        setScannedQrCode(null);
      }
    } catch (error) {
      console.error('Save tarima failed:', error);
      setCaptureError('No se pudo guardar la tarima. Reintentá.');
    } finally {
      setIsSaving(false);
    }
  }

  // Auto-fill lote/caducidad from previous tarima
  const autoLote = tarimasList[currentIndex]?.lote || '';
  const autoCaducidad = tarimasList[currentIndex]?.caducidad || '';

  // ============================================
  // Derived state for render
  // ============================================
  const currentTarima = tarimasList[currentIndex];
  const isLastTarima = currentIndex >= tarimasList.length - 1;
  const completedCount = tarimasList.filter((t) => t.completed).length;

  // ============================================
  // Render
  // ============================================
  if (!currentReception) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sin recepción activa</h2>
          <p className="text-gray-600">Iniciá una nueva recepción desde el inicio.</p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2 bg-[#16343f] text-white rounded-lg hover:bg-[#1e4456] transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Progress indicator */}
      <div className="sticky top-16 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              {currentReception.ocFolio} · {currentReception.proveedor}
            </span>
            <span className="text-sm font-medium text-gray-900">
              Tarima {currentIndex + 1} de {tarimasList.length}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#16343f] transition-all duration-300"
              style={{ width: `${((currentIndex + (currentTarima?.completed ? 1 : 0)) / tarimasList.length) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0%</span>
            <span>{completedCount}/{tarimasList.length}</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Current Tarima Card */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <Panel className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">{currentTarima.producto}</h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              currentTarima.completed
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {currentTarima.completed ? 'Completada' : 'Pendiente'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Código QR</p>
              <p className="font-mono text-gray-900">{currentTarima.id}</p>
            </div>
            <div>
              <p className="text-gray-500">Cajas</p>
              <p className="font-semibold text-gray-900">{currentTarima.cajas}</p>
            </div>
            <div>
              <p className="text-gray-500">Unidad</p>
              <p className="text-gray-900">{currentTarima.unidad}</p>
            </div>
            <div>
              <p className="text-gray-500">Proveedor</p>
              <p className="text-gray-900">{currentTarima.proveedor}</p>
            </div>
          </div>
        </Panel>

        {/* QR Scanner */}
        <Panel className="mb-4">
          <div className="relative aspect-video bg-gray-100 rounded-xl overflow-hidden">
            <video
              ref={qrReaderRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {scanError && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-50 p-4">
                <div className="text-center">
                  <p className="text-red-700 mb-2">{scanError}</p>
                  <button
                    onClick={() => { clearScannerError(); startScanning(handleScannedCode); }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}
            {!isScanning && !scanError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <button
                  onClick={() => startScanning(handleScannedCode)}
                  className="px-6 py-3 bg-white rounded-xl shadow-lg text-gray-900 font-medium hover:bg-gray-100 transition-colors"
                >
                  Activar cámara
                </button>
              </div>
            )}
          </div>
          {lastResult && !currentTarima.completed && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
              <span className="text-green-800 font-medium">✓ QR Detectado: {lastResult}</span>
              <button
                onClick={handleSaveTarima}
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Guardando...' : 'Guardar y siguiente'}
              </button>
            </div>
          )}
        </Panel>

        {/* Manual Input */}
        <Panel className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Entrada manual de tarima</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualPalletId}
              onChange={(e) => setManualPalletId(e.target.value.toUpperCase())}
              placeholder="TQR-24891-001"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono focus:ring-2 focus:ring-[#16343f] focus:border-transparent"
              disabled={isValidatingManualId}
            />
            <button
              onClick={handleManualPalletValidation}
              disabled={isValidatingManualId || !manualPalletId.trim()}
              className="px-6 py-3 bg-[#16343f] text-white rounded-lg hover:bg-[#1e4456] disabled:opacity-50 transition-colors font-medium"
            >
              {isValidatingManualId ? 'Validando...' : 'Validar'}
            </button>
          </div>
        </Panel>

        {/* Lote & Caducidad */}
        <Panel className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Lote *</label>
              <input
                type="text"
                value={currentTarima.lote}
                onChange={(e) => setTarimasList((prev) => prev.map((p, i) => i === currentIndex ? { ...p, lote: e.target.value } : p))}
                placeholder="LT-2026-001"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#16343f] focus:border-transparent"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Caducidad *</label>
              <input
                type="date"
                value={currentTarima.caducidad}
                onChange={(e) => setTarimasList((prev) => prev.map((p, i) => i === currentIndex ? { ...p, caducidad: e.target.value } : p))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#16343f] focus:border-transparent"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Observaciones</label>
              <textarea
                value={currentTarima.observaciones}
                onChange={(e) => setTarimasList((prev) => prev.map((p, i) => i === currentIndex ? { ...p, observaciones: e.target.value } : p))}
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#16343f] focus:border-transparent"
                placeholder="Observaciones opcionales..."
              />
            </div>
          </div>
        </Panel>

        {/* Admin: Extra Tarima */}
        {canAddExtraTarima && (
          <Panel className="mb-4 border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-amber-900">¿Necesitás una tarima extra?</p>
                <p className="text-sm text-amber-700">Solo para administradores (clave: 01603485)</p>
              </div>
              <button
                onClick={() => setShowAdminModal(true)}
                className="px-4 py-2 border border-amber-400 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
              >
                Agregar tarima
              </button>
            </div>
          </Panel>
        )}

        {/* Error Display */}
        {captureError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
            {captureError}
          </div>
        )}
        {confirmationError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
            {confirmationError}
            <button
              onClick={retryReceptionConfirmation}
              className="ml-3 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
            >
              Reintentar confirmación
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={onBack}
            className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancelar
          </button>
          {currentTarima.completed && !isLastTarima && (
            <button
              onClick={() => {
                setScannedQrCode(null);
                setCurrentIndex((prev) => prev + 1);
              }}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Siguiente tarima
            </button>
          )}
        </div>
      </div>

      {/* Admin Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar tarima extra (Admin)</h3>
            <input
              type="password"
              placeholder="Clave de administrador"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-[#16343f] focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value === '01603485') {
                  // Add extra tarima logic here
                  setShowAdminModal(false);
                }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowAdminModal(false)}
                className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                className="flex-1 py-3 px-4 bg-[#16343f] text-white rounded-lg hover:bg-[#1e4456] transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}