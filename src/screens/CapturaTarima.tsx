import { useState, useEffect, useRef } from "react";
import { isFeatureEnabled } from "@/config/featureFlags";
import { createFirestoreServices } from "@/services/firestore";
import { db, storage } from "@/lib/firebase";
import { WAREHOUSE_IDS } from "@/config/warehouses";
import { useAuthorization } from "@/hooks/useAuthorization";
import { Timestamp } from "firebase/firestore";
import { resolveCatalogProduct } from "@/services/domain/productMatching";
import { Panel } from "@/components/ui";
import { parseTarimaQR, buildTarimaQR } from "@/types/qrcode";
import type { PlannedReceptionPallet } from "@/services/firestore/types";
import {
  getFirstIncompletePalletIndex,
  shouldReadLocalPalletCache,
} from "@/domains/reception/receptionLifecycle";

const assetPathPrefix = "/assets";
const imgIndicador = `${assetPathPrefix}/08d70.svg`;
const imgIndicador1 = `${assetPathPrefix}/9d6fd.svg`;
const imgArrowRight = `${assetPathPrefix}/55de6.svg`;
const imgCheck = `${assetPathPrefix}/3eae4.svg`;
const imgWarehouse = `${assetPathPrefix}/ccb3f.svg`;
const imgKey = `${assetPathPrefix}/key.svg`;

const ORG_ID = "org_exepa_001";

function checkpointOperationId(receptionId: string, palletNumber: number): string {
  return `checkpoint-${receptionId.slice(-32)}-${palletNumber}-${Date.now()}`;
}

export function canCreateExtraPallet(accessStatus: string, role: string | undefined): boolean {
  return accessStatus === "ACTIVE" && (role === "ADMIN" || role === "SUPERVISOR");
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

interface Props {
  onBack: () => void;
  onFinish: () => void;
  almacenActivo: {
    id: string;
    nombre: string;
  } | null;
  onAumentarInventario: (
    almacenId: string,
    productos: {
      productoId: string;
      cajas: number;
    }[],
  ) => void;
  catalogos: {
    productos: Array<{
      id: string;
      nombre: string;
      sku?: string;
      codigosProveedor?: string[];
    }>;
  };
  currentReception: {
    ocFolio: string;
    tarimas: number;
    proveedor: string;
    proveedorLogistico: string;
    lote?: string;
    caducidad?: string;
    receptionId?: string;
    fechaRecepcion?: string;
    productos?: Array<{
      productId: string | null;
      codigo: string | null;
      nombre: string;
      unidad: string | null;
      cantidad: number;
      precio: number;
      importe: number;
      estadoMatch: "confirmado" | "sugerido" | "manual";
    }>;
    conversionesTabla?: ConversionesTablaItem[];
    plannedPallets?: PlannedReceptionPallet[];
  } | null;
  conversionesTabla?: ConversionesTablaItem[];
}

export default function CapturaTarima({
  onBack,
  onFinish,
  almacenActivo,
  onAumentarInventario,
  catalogos,
  currentReception,
  conversionesTabla: conversionesTablaProp,
}: Props) {
  // Usar conversionesTabla del prop o de currentReception
  const conversionesTablaBase = conversionesTablaProp || currentReception?.conversionesTabla || [];

  // TEST-ONLY: Legacy mode via URL parameter ?test=legacy-captura-tarima
  // Automatically sets up conversionesTabla from localStorage
  const [testModeKey, setTestModeKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("test") === "legacy-captura-tarima") {
      // Force re-initialization by incrementing testModeKey
      setTestModeKey((prev) => prev + 1);
    }
  }, []);

  // Get conversionesTabla - use localStorage in test mode
  const conversionesTabla: ConversionesTablaItem[] =
    testModeKey > 0
      ? (JSON.parse(localStorage.getItem("conversionesTabla") || "[]") as ConversionesTablaItem[])
      : conversionesTablaBase;

  // Generar lista de tarimas basada en conversiones
  const [tarimasList, setTarimasList] = useState<TarimaData[]>(() => {
    if (currentReception?.plannedPallets?.length) {
      return currentReception.plannedPallets.map((pallet) => ({
        id: pallet.qrIdentifier,
        numero: pallet.palletNumber,
        total: currentReception.plannedPallets!.length,
        ocFolio: currentReception.ocFolio,
        fechaRecepcion: currentReception.fechaRecepcion || "",
        producto: pallet.productName,
        productId: pallet.productId,
        codigo: "",
        caducidad: pallet.expiryDate || currentReception.caducidad || "",
        cajas: pallet.quantity,
        unidadesPorCaja: 1,
        unidad: pallet.unit,
        lote: pallet.lot || currentReception.lote || "",
        observaciones: "",
        proveedor: currentReception.proveedor,
        proveedorLogistico: currentReception.proveedorLogistico,
        completed: pallet.status === "ACTIVE" || pallet.status === "RECEIVED",
      }));
    }
    if (!currentReception || conversionesTabla.length === 0) return [];

    const ocNumber = currentReception.ocFolio.replace("OC-", "");
    const fechaHoy =
      new Date().toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "America/Mexico_City",
      }) +
      ` · ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" })}`;

    let numero = 1;
    return conversionesTabla.flatMap((conv) =>
      Array.from({ length: conv.tarimas }, () => ({
        id: buildTarimaQR(ocNumber, numero++),
        numero: numero - 1,
        total: conversionesTabla.reduce((a, b) => a + b.tarimas, 0),
        ocFolio: currentReception.ocFolio,
        fechaRecepcion: fechaHoy,
        producto: conv.producto,
        productId: conv.productId,
        codigo: conv.codigo,
        caducidad: currentReception.caducidad || "",
        cajas: Math.ceil(conv.cajas / conv.tarimas),
        unidadesPorCaja: conv.piezasPorCaja,
        unidad: conv.unidad,
        lote: currentReception.lote || "",
        observaciones: "",
        proveedor: currentReception.proveedor,
        proveedorLogistico: currentReception.proveedorLogistico,
        completed: false,
      })),
    );
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const handlingScanRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrReaderRef = useRef<any>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const scannerStartingRef = useRef(false);

  const { accessStatus, profile, canQuery } = useAuthorization();

  // TEST-ONLY: Disable Firestore in legacy test mode
  const isTestMode =
    new URLSearchParams(window.location.search).get("test") === "legacy-captura-tarima";
  const useFirestore =
    !isTestMode && isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery;
  const [fsServices, setFsServices] = useState<ReturnType<typeof createFirestoreServices> | null>(
    null,
  );
  const [firestoreReady, setFirestoreReady] = useState(false);
  const canAddExtraTarima = canCreateExtraPallet(accessStatus, profile?.role);

  const currentTarima = tarimasList[currentIndex];
  const isLastTarima = currentIndex >= tarimasList.length - 1;
  const completedCount = tarimasList.filter((t) => t.completed).length;

  // Initialize Firestore services
  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID);
      setFsServices(services);
      setFirestoreReady(true);
    }
  }, [useFirestore]);

  // Keep camera permission prompts behind a direct user gesture (required on iOS Safari).
  useEffect(() => {
    return () => stopScanner();
  }, [currentIndex]);

  // Save to localStorage for persistence
  const STORAGE_KEY = `recepcion_${currentReception?.ocFolio}_tarimas`;
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
        setCurrentIndex(getFirstIncompletePalletIndex(canonicalPlan || []));
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
          console.error("Error loading saved tarimas:", e);
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
        "user",
        `op-${Date.now()}-confirm`,
      );
      onFinish();
    } catch (error) {
      console.error("Reception confirmation retry failed:", error);
      setConfirmationError(
        "No se pudo confirmar; el progreso de tarimas quedó guardado. Reintentá.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function startScanner() {
    if (scannerStartingRef.current || scanning) return;
    scannerStartingRef.current = true;
    setScannerError(null);
    setScanning(true);
    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        throw new Error(
          "La cámara requiere una conexión segura (HTTPS). Abre la aplicación con HTTPS.",
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Este navegador no permite usar la cámara. Prueba con Safari o Chrome actualizado.",
        );
      }
      if (!videoRef.current)
        throw new Error("No se pudo preparar la vista de cámara. Vuelve a intentarlo.");
      // @ts-ignore - BrowserQRCodeReader from @zxing/browser
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      qrReaderRef.current = reader;

      const devices = await BrowserQRCodeReader.listVideoInputDevices();
      if (devices.length === 0) {
        throw new Error("No se encontró una cámara disponible en este dispositivo.");
      }

      // Prefer back camera
      const backCamera = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[0];

      const controls = await reader.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current,
        (result) => {
          if (result) {
            const code = result.getText();
            stopScanner();
            handleScannedCode(code);
          }
        },
      );
      scannerControlsRef.current = controls;
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
    } catch (e) {
      console.error("Scanner error:", e);
      const error = e as { name?: string; message?: string };
      const message =
        error.name === "NotAllowedError" || error.name === "PermissionDeniedError"
          ? "El navegador bloqueó el permiso de cámara. Habilítalo en los ajustes del sitio y vuelve a intentar."
          : error.name === "NotFoundError" || error.name === "DevicesNotFoundError"
            ? "No se encontró una cámara disponible en este dispositivo."
            : error.name === "NotReadableError" || error.name === "TrackStartError"
              ? "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo."
              : error.message ||
                "No se pudo iniciar la cámara. Revisa los permisos del navegador e inténtalo de nuevo.";
      setScannerError(message);
      stopScanner();
    } finally {
      scannerStartingRef.current = false;
    }
  }

  function stopScanner() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (typeof qrReaderRef.current?.reset === "function") {
      qrReaderRef.current.reset();
    }
    qrReaderRef.current = null;
    setScanning(false);
  }

  async function handleScannedCode(code: string) {
    if (handlingScanRef.current) return;
    handlingScanRef.current = true;
    const parsed = parseTarimaQR(code);
    if (!parsed) {
      alert(`Código QR inválido: ${code}\nFormato esperado: TQR-24891-001`);
      handlingScanRef.current = false;
      return;
    }

    const tarimaIndex = tarimasList.findIndex((pallet) => pallet.id === code);
    const tarimaNum = String(parsed.tarimaIndex).padStart(3, "0");

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
          throw new Error("Reception backend is not ready");
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
      setScannedCode(code);
      setCurrentIndex(tarimaIndex);
      stopScanner();
      setCaptureError(null);
    } catch (error) {
      console.error("Reception QR validation failed:", error);
      alert("Este QR no está disponible para esta recepción o ya fue activado.");
    } finally {
      handlingScanRef.current = false;
    }
  }

  async function persistCaptureCheckpoint(pallet: TarimaData) {
    if (!useFirestore) return;
    if (!fsServices || !currentReception?.receptionId) {
      setCaptureError("La conexión de recepción todavía no está lista; el avance no se guardó.");
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
      console.error("Pallet capture checkpoint failed:", error);
      setCaptureError(
        "No se pudo guardar el avance de esta tarima. Revisá la conexión y reintentá.",
      );
    }
  }

  async function handleSaveTarima() {
    if (!currentTarima) return;
    if (useFirestore && scannedCode !== currentTarima.id) {
      alert("Escaneá el QR de esta tarima antes de activar su registro.");
      return;
    }

    // Validar campos requeridos
    const lotToSave = currentTarima.lote.trim() || autoLote.trim();
    const expiryToSave = currentTarima.caducidad || autoCaducidad;
    if (!lotToSave) {
      alert("El lote es obligatorio");
      return;
    }
    if (!expiryToSave.trim()) {
      alert("La fecha de caducidad es obligatoria");
      return;
    }

    if (useFirestore && (!firestoreReady || !fsServices || !currentReception?.receptionId)) {
      alert("La conexión de recepción todavía no está lista. Esperá un momento y reintentá.");
      return;
    }

    setIsSaving(true);

    // Guardar en Firestore si está habilitado
    if (useFirestore) {
      if (!firestoreReady || !fsServices || !currentReception?.receptionId) {
        setIsSaving(false);
        alert("La conexión de recepción todavía no está lista. Esperá un momento y reintentá.");
        return;
      }
      const receptionId = currentReception.receptionId;
      const services = fsServices;
      const tarimaId = currentTarima.id;
      const canonicalProduct = resolveCatalogProduct(catalogos.productos, {
        productId: currentTarima.productId,
        name: currentTarima.producto,
        code: currentTarima.codigo,
      });
      if (!canonicalProduct) {
        setIsSaving(false);
        alert(
          "No se pudo identificar el producto en el catálogo. Seleccioná un producto válido antes de registrar la tarima.",
        );
        return;
      }
      const palletData = {
        receptionId,
        palletNumber: currentTarima.numero,
        qrCode: tarimaId,
        productId: canonicalProduct.id,
        lot: lotToSave,
        expiryDate: expiryToSave ? new Date(expiryToSave) : undefined,
        quantity: currentTarima.cajas,
        unit: currentTarima.unidad,
        status: "RECEIVED",
        observations: currentTarima.observaciones,
        warehouseId: almacenActivo?.id || WAREHOUSE_IDS.NORTH,
      };

      try {
        await services.receptions.savePalletCapture(
          receptionId,
          tarimaId,
          lotToSave,
          expiryToSave,
          checkpointOperationId(receptionId, currentTarima.numero),
        );
        await services.pallets.createPalletsForReception(
          receptionId,
          [
            {
              warehouseId: palletData.warehouseId,
              qrIdentifier: palletData.qrCode,
              productId: palletData.productId,
              quantity: palletData.quantity,
              unit: palletData.unit,
              status: "RECEIVED",
              lot: palletData.lot,
              expiryDate: palletData.expiryDate ? Timestamp.fromDate(palletData.expiryDate) : null,
            },
          ],
          "user",
          `op-${Date.now()}`,
        );
      } catch (e) {
        console.error("Authorized pallet registration failed:", e);
        setIsSaving(false);
        alert(
          "No se pudo registrar la tarima. Verificá tu conexión y permisos e intentá nuevamente.",
        );
        return;
      }
    }

    // Mark the pallet complete only after the authorized write succeeds (or
    // when Firestore is disabled for this local/demo flow).
    const updated = [...tarimasList];
    updated[currentIndex] = { ...updated[currentIndex], completed: true };
    setTarimasList(updated);

    // Actualizar inventario
    if (almacenActivo && !useFirestore) {
      const producto = resolveCatalogProduct(catalogos.productos, {
        productId: currentTarima.productId,
        name: currentTarima.producto,
        code: currentTarima.codigo,
      });
      if (producto) {
        onAumentarInventario(almacenActivo.id, [
          { productoId: producto.id, cajas: currentTarima.cajas },
        ]);
      }
    }

    setShowSuccess(true);
    setIsSaving(false);

    // Auto-avance a la siguiente tarima
    setTimeout(async () => {
      setShowSuccess(false);
      if (!isLastTarima) {
        setCurrentIndex((i) => i + 1);
      } else {
        // Todas completadas
        if (currentReception?.receptionId && useFirestore && firestoreReady && fsServices) {
          try {
            await fsServices.receptions.confirmReception(
              currentReception.receptionId,
              "user",
              `op-${Date.now()}`,
            );
          } catch (e) {
            console.error("Authorized reception confirmation failed:", e);
            setConfirmationError(
              "Las tarimas se guardaron, pero no se confirmó la recepción. Reintentá.",
            );
            alert(
              "Las tarimas se guardaron, pero no se pudo confirmar la recepción. Reintentá desde el historial.",
            );
            return;
          }
        }
        // Limpiar localStorage
        if (currentReception?.ocFolio) {
          localStorage.removeItem(STORAGE_KEY);
        }
        onFinish();
      }
    }, 1500);
  }

  function handleAddExtraTarima() {
    if (canAddExtraTarima) {
      // Agregar una tarima extra del mismo producto de la última conversión
      const lastConv = conversionesTabla[conversionesTabla.length - 1];
      if (lastConv && currentReception) {
        const ocNumber = currentReception.ocFolio.replace("OC-", "");
        const nextNum = tarimasList.length + 1;
        const newTarima: TarimaData = {
          id: buildTarimaQR(ocNumber, nextNum),
          numero: nextNum,
          total: tarimasList.length + 1,
          ocFolio: currentReception.ocFolio,
          fechaRecepcion:
            new Date().toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "America/Mexico_City",
            }) +
            ` · ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" })}`,
          producto: lastConv.producto,
          productId: lastConv.productId,
          codigo: lastConv.codigo,
          caducidad: currentReception.caducidad || "",
          cajas: Math.ceil(lastConv.cajas / lastConv.tarimas),
          unidadesPorCaja: lastConv.piezasPorCaja,
          unidad: lastConv.unidad,
          lote: currentReception.lote || "",
          observaciones: "",
          proveedor: currentReception.proveedor,
          proveedorLogistico: currentReception.proveedorLogistico,
          completed: false,
        };
        setTarimasList((prev) => [...prev, newTarima]);
        setShowAdminModal(false);
        setCurrentIndex(tarimasList.length); // Ir a la nueva
      }
    } else {
      setShowAdminModal(false);
      alert("Solo usuarios ADMIN o SUPERVISOR pueden agregar tarimas adicionales");
    }
  }

  function manualTarimaSelect(index: number) {
    if (index >= 0 && index < tarimasList.length) {
      setCurrentIndex(index);
      if (!tarimasList[index].completed) {
        startScanner();
      }
    }
  }

  // Pre-fill data from previous tarima (auto-copia)
  const prevCompleted = tarimasList
    .slice(0, currentIndex)
    .reverse()
    .find((t) => t.completed);
  const autoLote = prevCompleted?.lote || "";
  const autoCaducidad = prevCompleted?.caducidad || "";
  const autoObservaciones = prevCompleted?.observaciones || "";

  if (!currentReception || tarimasList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center size-full p-4">
        <p className="text-[#607078] text-center">No hay recepción activa</p>
        <button
          onClick={onBack}
          className="mt-4 bg-[#16343f] text-white px-6 py-3 rounded-[14px] font-bold touch-target"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 overflow-x-hidden px-3 py-4 pb-[calc(80px+env(safe-area-inset-bottom))] md:gap-[18px] md:p-7 md:pb-7">
      {/* Progress Bar */}
      <div className="bg-[#dce4e7] flex flex-col h-2 items-start overflow-hidden rounded-full w-full">
        <div
          className="bg-[#f2b84b] h-2 rounded-full"
          style={{
            width: `${tarimasList.length > 0 ? (completedCount / tarimasList.length) * 100 : 0}%`,
          }}
        />
      </div>
      <p
        className="text-[#607078] text-sm md:text-[13px] text-center"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        Tarima {currentTarima?.numero ?? 1} de {tarimasList.length} · {completedCount} completadas ·{" "}
        {tarimasList.length - completedCount} pendientes
      </p>

      {/* Scanner Area */}
      <Panel className="flex flex-col gap-4 md:gap-[14px] p-4 md:p-5 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col gap-1">
            <p
              className="font-extrabold text-[#172126] text-xl md:text-[22px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              {currentTarima?.completed ? "✓ Tarima completada" : "📷 Escanear QR de tarima"}
            </p>
            <p
              className="text-[#607078] text-sm md:text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {currentTarima
                ? `ID: ${currentTarima.id} · ${currentTarima.producto}`
                : "Preparando..."}
            </p>
          </div>
          {currentTarima?.completed && (
            <span
              className="bg-[#e2f5ec] border border-[#16845b] text-[#16845b] text-[11px] font-bold px-3 py-1 rounded-full touch-target"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              ✓ COMPLETADA
            </span>
          )}
        </div>

        {/* QR Scanner Video */}
        <div
          className="relative bg-[#172126] rounded-[14px] overflow-hidden w-full"
          style={{ aspectRatio: "4/3" }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            muted
            style={{ opacity: scanning ? 1 : 0.3 }}
          />
          {!scanning && (
            <div
              className="absolute inset-0 bg-[#172126] flex flex-col items-center justify-center gap-3 p-4"
              style={{ opacity: 0.9 }}
            >
              <svg
                aria-hidden="true"
                className="size-16 md:size-20 text-[#f2b84b]"
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 24V12a4 4 0 0 1 4-4h12M40 8h12a4 4 0 0 1 4 4v12M56 40v12a4 4 0 0 1-4 4H40M24 56H12a4 4 0 0 1-4-4V40" />
                <path d="M20 20h10v10H20zM34 20h10v10H34zM20 34h10v10H20zM36 36h3v3h-3zM43 43h3v3h-3zM34 43h3v3h-3z" />
              </svg>
              <p
                className="font-bold text-white text-base md:text-lg text-center"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {currentTarima?.completed ? "Tarima completada" : "Toca para activar escáner"}
              </p>
              <button
                onClick={startScanner}
                disabled={currentTarima?.completed}
                className="bg-[#f2b84b] text-[#16343f] font-bold text-[13px] px-6 py-2 rounded-[10px] touch-target"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {currentTarima?.completed ? "Ver detalles" : "Activar cámara"}
              </button>
            </div>
          )}
          {scannerError && (
            <div
              className="absolute inset-x-3 bottom-3 rounded-lg bg-white p-3 text-sm text-red-700 shadow-lg"
              role="alert"
            >
              <p>{scannerError}</p>
              <button
                onClick={startScanner}
                className="mt-2 min-h-11 rounded-lg bg-[#f2b84b] px-4 font-semibold text-[#16343f]"
              >
                Reintentar cámara
              </button>
            </div>
          )}

          {/* Corner brackets overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
              linear-gradient(to right, #f2b84b 4px, transparent 4px),
              linear-gradient(to left, #f2b84b 4px, transparent 4px),
              linear-gradient(to bottom, #f2b84b 4px, transparent 4px),
              linear-gradient(to top, #f2b84b 4px, transparent 4px)
            `,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "top left, top right, bottom left, bottom right",
              backgroundSize: "40px 40px",
            }}
          />

          {scannedCode && (
            <div
              className="absolute inset-0 bg-green-600/90 flex flex-col items-center justify-center gap-2 p-4"
              style={{ animation: "pulse 0.5s" }}
            >
              <span className="text-white font-bold text-lg">✓ QR Detectado</span>
              <span className="text-white font-mono text-base">{scannedCode}</span>
              <span className="text-white/80 text-sm">Tarima {currentTarima?.numero}</span>
            </div>
          )}
        </div>

        {/* Datos Preliminares (Auto-llenados del QR) */}
        <div className="bg-[#e7f0f2] border border-[#3276a8] rounded-[14px] p-4 w-full">
          <p
            className="font-extrabold text-[#172126] text-[14px] mb-3 flex items-center gap-2"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            <span>📋</span> Datos preliminares (auto del sticker QR)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div>
              <p className="text-[#607078] mb-1">Fecha recepción</p>
              <p className="font-bold text-[#172126]">{currentTarima?.fechaRecepcion}</p>
            </div>
            <div>
              <p className="text-[#607078] mb-1">Folio pedido</p>
              <p className="font-bold text-[#172126]">{currentTarima?.ocFolio}</p>
            </div>
            <div>
              <p className="text-[#607078] mb-1">Proveedor</p>
              <p className="font-bold text-[#172126] truncate">{currentTarima?.proveedor}</p>
            </div>
            <div>
              <p className="text-[#607078] mb-1">Producto</p>
              <p className="font-bold text-[#172126] truncate">{currentTarima?.producto}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[#607078] mb-1">Código producto</p>
              <p className="font-bold text-[#172126]">{currentTarima?.codigo}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[#607078] mb-1">Prov. logístico</p>
              <p className="font-bold text-[#172126] truncate">
                {currentTarima?.proveedorLogistico}
              </p>
            </div>
          </div>
        </div>

        {/* Datos Complementarios (Manual) */}
        <div className="bg-[#fff8f0] border border-[#f2b84b] rounded-[14px] p-4 w-full">
          <p
            className="font-extrabold text-[#172126] text-[14px] mb-3 flex items-center gap-2"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            <span>✏️</span> Datos complementarios (manual - se copian de la tarima anterior)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="flex flex-col gap-1">
              <label
                className="font-bold text-[#607078] text-[11px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Lote *
              </label>
              <input
                type="text"
                value={currentTarima?.lote || autoLote}
                onBlur={() =>
                  currentTarima &&
                  void persistCaptureCheckpoint({
                    ...currentTarima,
                    lote: currentTarima.lote || autoLote,
                    caducidad: currentTarima.caducidad || autoCaducidad,
                  })
                }
                onChange={(e) => {
                  if (currentTarima) {
                    setTarimasList((prev) => {
                      const updated = [...prev];
                      updated[currentIndex] = {
                        ...updated[currentIndex],
                        lote: e.target.value,
                      };
                      return updated;
                    });
                  }
                }}
                placeholder={autoLote ? `Auto: ${autoLote}` : "Ej: LT-0926-A"}
                className="bg-white border border-[#dce4e7] min-h-12 px-3 md:px-[14px] py-3 rounded-lg w-full text-[14px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="font-bold text-[#607078] text-[11px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Fecha caducidad *
              </label>
              <input
                type="date"
                value={currentTarima?.caducidad || autoCaducidad}
                onBlur={() =>
                  currentTarima &&
                  void persistCaptureCheckpoint({
                    ...currentTarima,
                    lote: currentTarima.lote || autoLote,
                    caducidad: currentTarima.caducidad || autoCaducidad,
                  })
                }
                onChange={(e) => {
                  if (currentTarima) {
                    setTarimasList((prev) => {
                      const updated = [...prev];
                      updated[currentIndex] = {
                        ...updated[currentIndex],
                        caducidad: e.target.value,
                      };
                      return updated;
                    });
                  }
                }}
                className="bg-white border border-[#dce4e7] min-h-12 px-3 md:px-[14px] py-3 rounded-lg w-full text-[14px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              />
            </div>
          </div>
          {captureError && (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {captureError}
            </p>
          )}

          <div className="flex flex-col gap-1 mt-2">
            <label
              className="font-bold text-[#607078] text-[11px]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Observaciones
            </label>
            <textarea
              value={currentTarima?.observaciones || autoObservaciones}
              onChange={(e) => {
                if (currentTarima) {
                  setTarimasList((prev) => {
                    const updated = [...prev];
                    updated[currentIndex] = {
                      ...updated[currentIndex],
                      observaciones: e.target.value,
                    };
                    return updated;
                  });
                }
              }}
              placeholder={
                autoObservaciones ? `Auto: ${autoObservaciones}` : "Observaciones opcionales..."
              }
              rows={2}
              className="bg-white border border-[#dce4e7] min-h-[80px] px-3 md:px-[14px] py-3 rounded-lg w-full text-[13px] resize-none"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
          </div>
        </div>

        {/* Resumen de la tarima actual */}
        <div className="bg-[#f4f8fc] border border-[#b6d4e7] rounded-[14px] p-4 w-full">
          <p
            className="font-bold text-[#172126] text-[13px] mb-3"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Resumen de tarima {currentTarima?.numero}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-[#607078]">Cajas: </span>
              <span className="font-bold text-[#172126]">{currentTarima?.cajas}</span>
            </div>
            <div>
              <span className="text-[#607078]">Unid./caja: </span>
              <span className="font-bold text-[#172126]">{currentTarima?.unidadesPorCaja}</span>
            </div>
            <div>
              <span className="text-[#607078]">Total unds: </span>
              <span className="font-bold text-[#172126]">
                {currentTarima?.cajas * currentTarima?.unidadesPorCaja}
              </span>
            </div>
            <div>
              <span className="text-[#607078]">Stickers: </span>
              <span className="font-extrabold text-[#c54b45]">4 (2 caras × 2)</span>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => manualTarimaSelect(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="bg-white border border-[#dce4e7] flex flex-1 h-11 md:h-[52px] items-center justify-center px-3 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#f8fafb] transition-colors touch-target opacity-50"
            style={{ opacity: currentIndex === 0 ? 0.5 : 1 }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16343f"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span
              className="ml-2 font-bold text-[#16343f] text-sm md:text-[15px]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Anterior
            </span>
          </button>

          {completedCount === tarimasList.length &&
          tarimasList.length > 0 &&
          useFirestore &&
          currentReception?.receptionId ? (
            <button
              type="button"
              onClick={retryReceptionConfirmation}
              disabled={isSaving || showSuccess}
              className="bg-[#16343f] text-white font-bold flex flex-1 h-11 items-center justify-center rounded-[14px] disabled:opacity-60"
            >
              {isSaving ? "Confirmando..." : "Reintentar confirmación"}
            </button>
          ) : (
            <button
              onClick={handleSaveTarima}
              disabled={isSaving || !currentTarima || currentTarima.completed}
              className={`bg-[#16343f] border border-[#16343f] flex flex-1 h-11 md:h-[52px] items-center justify-center gap-2 px-3 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target ${
                isSaving ? "opacity-75" : ""
              }`}
            >
              {isSaving ? (
                <svg
                  className="animate-spin"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              ) : (
                <img alt="" className="size-5 md:size-[18px]" src={imgCheck} />
              )}
              <span
                className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {isSaving
                  ? "Guardando..."
                  : currentTarima?.completed
                    ? "Re-guardar"
                    : "Guardar y siguiente →"}
              </span>
            </button>
          )}
        </div>
        {confirmationError && (
          <p role="alert" className="text-sm text-red-700">
            {confirmationError}
          </p>
        )}

        {/* Navegación rápida entre tarimas */}
        <div className="flex flex-wrap gap-1 justify-center w-full">
          {tarimasList.map((t, i) => (
            <button
              key={t.id}
              onClick={() => manualTarimaSelect(i)}
              className={`size-10 rounded-[10px] font-bold text-[11px] touch-target transition-all ${
                i === currentIndex
                  ? "bg-[#f2b84b] text-[#16343f] ring-2 ring-[#f2b84b]"
                  : t.completed
                    ? "bg-[#e2f5ec] text-[#16845b] border border-[#16845b]"
                    : "bg-white text-[#607078] border border-[#dce4e7] hover:bg-[#f4f8fc]"
              }`}
              style={{ fontFamily: "'Inter', sans-serif" }}
              title={`Tarima ${t.numero}${t.completed ? " ✓" : ""}`}
            >
              {t.numero}
            </button>
          ))}
        </div>

        {/* Role-authorized action for an extra pallet */}
        {canAddExtraTarima && (
          <button
            onClick={() => setShowAdminModal(true)}
            className="flex items-center justify-center gap-2 bg-transparent border border-dashed border-[#dce4e7] text-[#607078] text-[11px] font-bold px-4 py-2 rounded-[10px] hover:border-[#f2b84b] hover:text-[#f2b84b] hover:bg-[#fff8f0] transition-colors touch-target w-full"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <img alt="" className="size-4" src={imgKey} />
            Agregar tarima extra (requiere autorización)
          </button>
        )}
      </Panel>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-[#16845b] text-white flex items-center gap-3 px-6 py-4 rounded-[14px] shadow-[0px_8px_24px_rgba(22,132,91,0.3)]">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="font-bold text-base" style={{ fontFamily: "'Inter', sans-serif" }}>
              Tarima {currentTarima?.numero} guardada ✓
            </span>
          </div>
        </div>
      )}

      {/* Admin Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[20px] p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <p
                className="font-extrabold text-[#172126] text-xl"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Autorizar tarima adicional
              </p>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-[#607078] text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <p
              className="text-[#607078] text-sm mb-4"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Tu rol autoriza crear una tarima adicional para esta recepción.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAdminModal(false)}
                className="flex-1 bg-white border border-[#dce4e7] text-[#16343f] font-bold py-3 rounded-[14px] touch-target"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAddExtraTarima}
                className="flex-1 bg-[#f2b84b] border border-[#f2b84b] text-[#16343f] font-bold py-3 rounded-[14px] touch-target"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Crear tarima
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes pulse {
          0% { opacity: 0; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
