import { useState, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  CANONICAL_WAREHOUSE_IDS,
  isGlobalMembershipRole,
  normalizeMembershipWarehouses,
} from "@/schemas/membership";
import Home from "./screens/Home";
import Login from "./screens/Login";
import Unauthorized from "./screens/Unauthorized";
import CapturaEvidencia from "./screens/CapturaEvidencia";
import ProgramacionRecepcion from "./screens/ProgramacionRecepcion";
import NuevaRecepcionStep1 from "./screens/NuevaRecepcionStep1";
import NuevaRecepcionStep2 from "./screens/NuevaRecepcionStep2";
import CapturaTarima from "./screens/CapturaTarima";
import type { PlannedReceptionPallet } from "@/services/firestore/types";
import RecepcionCompletada from "./screens/RecepcionCompletada";
import Recepciones from "./screens/Recepciones";
import TarimaDetalle from "./screens/TarimaDetalle";
import ImpresionEtiquetas from "./screens/ImpresionEtiquetas";
import EscanearQR from "./screens/EscanearQR";
import EditarRecepcion from "./screens/EditarRecepcion";
import Evidencias from "./screens/Evidencias";
import EvidenciaDetalle, { type EvidenciaData } from "./screens/EvidenciaDetalle";
import LotesCaducidades from "./screens/LotesCaducidades";
import Embarques from "./screens/Embarques";
import Configuracion, {
  type Producto,
  PRODUCTOS_INIT,
  type Proveedor,
  PROVEEDORES_INIT,
  type Conversion,
  CONVERSIONES_INIT,
  type Almacen,
  ALMACENES_INIT,
} from "./screens/Configuracion";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { programacionToAppReception } from "@/services/domain/programacionToApp";
import { isFeatureEnabled } from "@/config/featureFlags";
import { createFirestoreServices } from "@/services/firestore";
import { db } from "@/lib/firebase";
import {
  mergeSupplierCatalog,
  normalizeSupplierType,
  CANONICAL_SUPPLIER_LOCAL,
} from "@/config/supplierCatalog";
import { useReceptionSession } from "@/domains/reception/useReceptionSession";

const assetPathPrefix = "/assets";
const imgPackage = `${assetPathPrefix}/4cca0.svg`;
const imgWarehouseNav = `${assetPathPrefix}/66fcc.svg`;
const imgClipboardListNav = `${assetPathPrefix}/c2509.svg`;
const imgScanQrCodeNav = `${assetPathPrefix}/ba9e1.svg`;
const imgAvatar = `${assetPathPrefix}/35fee.svg`;
const imgIndicador = `${assetPathPrefix}/08d70.svg`;

type Screen =
  | "home"
  | "programacion-recepcion"
  | "captura-evidencia"
  | "nueva-step1"
  | "nueva-step2"
  | "captura-tarima"
  | "completada"
  | "recepciones"
  | "tarima-detalle"
  | "impresion"
  | "escanear-qr"
  | "editar-recepcion"
  | "evidencias"
  | "evidencia-detalle"
  | "lotes-caducidades"
  | "embarques"
  | "configuracion";
type NavItem =
  | "home"
  | "recepciones"
  | "embarques"
  | "qr"
  | "evidencias"
  | "lotes"
  | "configuracion";

interface HeaderConfig {
  subtitle: string;
  title: string;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Separate layout component for cleaner code
function AppLayout() {
  const { user, profile, logout, canQuery } = useAuthorization();
  const receptionSession = useReceptionSession();
  const [screen, setScreen] = useState<Screen>("home");
  const [activeNav, setActiveNav] = useState<NavItem>("home");
  const [editId, setEditId] = useState<string>("OC-24891");
  const [editReceptionData, setEditReceptionData] = useState<{
    tarimas: number;
    proveedor: string;
    proveedorLogistico: string;
  } | null>(null);
  const [selectedEvidencia, setSelectedEvidencia] = useState<EvidenciaData | null>(null);
  const [tarimaActual, setTarimaActual] = useState(3);
  const [selectedReception, setSelectedReception] = useState<string | null>(null);
  const [scannedQrCode, setScannedQrCode] = useState<string | null>(null);

  // TEST-ONLY: Legacy mode for TarimaDetalle (bypasses Firestore query)
  // Enable with: ?test=legacy-tarima-detalle
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const testMode = params.get("test");
    if (testMode === "legacy-tarima-detalle") {
      setScreen("tarima-detalle");
      setActiveNav("qr");
      // Don't set scannedQrCode - TarimaDetalle will use legacy mode

      // Set up conversionesTabla for CapturaTarima (legacy mode)
      const conversiones = [
        {
          producto: "Agua mineral 600 ml",
          productId: "prod-test-1",
          codigo: "AGUA-600ML",
          unidades: 48,
          unidad: "cajas",
          piezasPorCaja: 24,
          cajasPorTarima: 2,
          cajas: 48,
          tarimas: 2,
          stickers: 8,
          conversionMatch: true,
        },
        {
          producto: "Refresco Cola 500 ml",
          productId: "prod-test-2",
          codigo: "COLA-500ML",
          unidades: 50,
          unidad: "cajas",
          piezasPorCaja: 25,
          cajasPorTarima: 2,
          cajas: 50,
          tarimas: 2,
          stickers: 8,
          conversionMatch: true,
        },
        {
          producto: "Jugo Naranja 1L",
          productId: "prod-test-3",
          codigo: "JUGO-1L",
          unidades: 45,
          unidad: "cajas",
          piezasPorCaja: 15,
          cajasPorTarima: 3,
          cajas: 45,
          tarimas: 1,
          stickers: 4,
          conversionMatch: true,
        },
      ];
      try {
        localStorage.setItem("conversionesTabla", JSON.stringify(conversiones));
      } catch (e) {
        console.warn("[TEST] No se pudo setear localStorage conversionesTabla:", e);
      }

      // Dispatch event to set currentReception state for CapturaTarima
      const receptionData = {
        ocFolio: "OC-TEST-001",
        tarimas: 5,
        proveedor: "Proveedor Test",
        proveedorLogistico: "Logística Test",
        conversionesTabla: conversiones,
        receptionId: "reception-test-e2e",
      };
      window.dispatchEvent(new CustomEvent("TEST_SET_RECEPTION", { detail: receptionData }));
    } else if (testMode === "escanear-qr") {
      setScreen("escanear-qr");
      setActiveNav("qr");
    } else if (testMode === "legacy-captura-evidencia") {
      setScreen("captura-evidencia");
      setActiveNav("home");

      // Set up currentReception for CapturaEvidencia (needs receptionId for Firestore)
      const currentReceptionData = {
        proveedor: "Distribuidora del Norte",
        item: "Agua mineral 600 ml",
        tarimas: 20,
        caducidad: "15 Mar 2027",
        lote: "LT-0926-A",
        proveedorLogistico: "Logística Veloz",
        ocFolio: "OC-TEST-001",
        receptionId: "reception-test-e2e",
        productos: [
          {
            productId: null,
            codigo: null,
            nombre: "Agua mineral 600 ml",
            unidad: null,
            cantidad: 0,
            precio: 0,
            importe: 0,
            estadoMatch: "manual" as const,
          },
        ],
      };
      setCurrentReception(currentReceptionData);

      // Also set localStorage for form prefill
      const receptionData = {
        proveedor: "Distribuidora del Norte",
        item: "Agua mineral 600 ml",
        tarimas: "20",
        caducidad: "15 Mar 2027",
        lote: "LT-0926-A",
      };
      try {
        localStorage.setItem("test-evidencia-form", JSON.stringify(receptionData));
      } catch (e) {
        console.warn("[TEST] No se pudo setear localStorage test-evidencia-form:", e);
      }
    } else if (testMode === "legacy-evidencia-detalle") {
      setScreen("evidencia-detalle");
      setActiveNav("evidencias");

      // Set up test data for legacy evidencia detalle
      const evidenciaData = {
        id: "EVD-QA-12345",
        fotoTrailer: null,
        fotoProducto: null,
        proveedor: "Distribuidora del Norte",
        proveedorLogistico: "Logística Veloz",
        item: "Agua mineral 600 ml",
        tarimas: 20,
        caducidad: "15 Mar 2027",
        lote: "LT-0926-A",
        ocFolio: "OC-24891",
        fecha: "19 Sep 2026",
        hora: "09:42",
        estado: "COMPLETADA",
        color: "#16845b",
        bg: "#e2f5ec",
        img: "/assets/08d70.svg",
      };
      setSelectedEvidencia(evidenciaData);
    } else if (testMode === "legacy-captura-tarima") {
      setScreen("captura-tarima");
      setActiveNav("qr");

      // Set up currentReception for CapturaTarima (legacy mode)
      const conversiones = [
        {
          producto: "Agua mineral 600 ml",
          productId: "prod-test-1",
          codigo: "AGUA-600ML",
          unidades: 48,
          unidad: "cajas",
          piezasPorCaja: 24,
          cajasPorTarima: 2,
          cajas: 48,
          tarimas: 2,
          stickers: 8,
          conversionMatch: true,
        },
        {
          producto: "Refresco Cola 500 ml",
          productId: "prod-test-2",
          codigo: "COLA-500ML",
          unidades: 50,
          unidad: "cajas",
          piezasPorCaja: 25,
          cajasPorTarima: 2,
          cajas: 50,
          tarimas: 2,
          stickers: 8,
          conversionMatch: true,
        },
        {
          producto: "Jugo Naranja 1L",
          productId: "prod-test-3",
          codigo: "JUGO-1L",
          unidades: 45,
          unidad: "cajas",
          piezasPorCaja: 15,
          cajasPorTarima: 3,
          cajas: 45,
          tarimas: 1,
          stickers: 4,
          conversionMatch: true,
        },
      ];
      try {
        localStorage.setItem("conversionesTabla", JSON.stringify(conversiones));
      } catch (e) {
        console.warn("[TEST] No se pudo setear localStorage conversionesTabla:", e);
      }

      // Set up currentReception for CapturaTarima
      const currentReceptionData = {
        proveedor: "Distribuidora del Norte",
        item: "Agua mineral 600 ml",
        tarimas: 5,
        caducidad: "15 Mar 2027",
        lote: "LT-0926-A",
        proveedorLogistico: "Logística Veloz",
        ocFolio: "OC-TEST-001",
        receptionId: "reception-test-e2e",
        productos: [
          {
            productId: null,
            codigo: null,
            nombre: "Agua mineral 600 ml",
            unidad: null,
            cantidad: 0,
            precio: 0,
            importe: 0,
            estadoMatch: "manual" as const,
          },
        ],
        conversionesTabla: conversiones,
      };
      setCurrentReception(currentReceptionData);
    }
  }, []);
  const TARIMA_TOTAL = 20;
  const [catalogoProductos, setCatalogoProductos] = useState<Producto[]>(PRODUCTOS_INIT);
  const [catalogoProveedores, setCatalogoProveedores] = useState<Proveedor[]>(PROVEEDORES_INIT);
  const [catalogoConversiones, setCatalogoConversiones] = useState<Conversion[]>(CONVERSIONES_INIT);
  const [catalogoAlmacenes, setCatalogoAlmacenes] = useState<Almacen[]>(ALMACENES_INIT);
  const [catalogosLoading, setCatalogosLoading] = useState(false);
  const [catalogosError, setCatalogosError] = useState<Error | null>(null);

  // Catalogs are needed by Nueva Recepción as well as Configuración. Load them
  // at the authenticated layout boundary so entering Nueva Recepción directly
  // does not depend on visiting Configuración first.
  useEffect(() => {
    if (!canQuery || !isFeatureEnabled("USE_FIRESTORE_CATALOGOS") || !db) return;

    const services = createFirestoreServices(db, "org_exepa_001");
    let active = true;
    setCatalogosLoading(true);
    setCatalogosError(null);

    Promise.allSettled([
      services.products.getAll({ orderBy: ["name", "asc"] }),
      services.suppliers.getAll({ orderBy: ["code", "asc"] }),
      services.conversions.getAll({ orderBy: ["productName", "asc"] }),
      services.warehouses.getAll({ orderBy: ["code", "asc"] }),
    ]).then(([products, suppliers, conversions, warehouses]) => {
      if (!active) return;
      const failed = [products, suppliers, conversions, warehouses].filter(
        (result) => result.status === "rejected",
      );
      setCatalogosError(
        failed.length > 0
          ? new Error(`${failed.length} catálogo(s) no pudieron actualizarse`)
          : null,
      );
      if (products.status === "fulfilled") {
        setCatalogoProductos(
          products.value.data.map((p) => ({
            id: p.id,
            nombre: p.name,
            sku: p.sku,
            categoria: p.category || "",
            unidad: p.unit as Producto["unidad"],
            activo: true,
            codigosProveedor: p.supplierCodes || [],
          })),
        );
      }
      if (suppliers.status === "fulfilled") {
        setCatalogoProveedores(
          mergeSupplierCatalog(
            suppliers.value.data.map((p) => ({
              id: p.id,
              nombre: p.name,
              contacto: p.contact || "",
              telefono: p.phone || "",
              email: p.email || "",
              tipo: normalizeSupplierType(
                p.tipo,
                CANONICAL_SUPPLIER_LOCAL.find((supplier) => supplier.id === p.id)?.tipo,
              ),
            })),
          ),
        );
      }
      if (conversions.status === "fulfilled") {
        setCatalogoConversiones(
          conversions.value.data.map((c) => ({
            id: c.id,
            producto: c.productName,
            piezasPorCaja: c.piecesPerBox,
            cajasPorTarima: c.boxesPerPallet,
            pesoKgCaja: c.weightKgPerBox || "",
          })),
        );
      }
      if (warehouses.status === "fulfilled") {
        setCatalogoAlmacenes(
          warehouses.value.data.map((w) => ({
            id: w.id,
            nombre: w.name,
            ubicacion: w.location || "",
            responsable: w.manager || "",
            activo: w.active ?? false,
            creadoEn:
              w.createdAt?.toDate?.()?.toISOString?.().slice(0, 10) ||
              new Date().toISOString().slice(0, 10),
          })),
        );
      }
      setCatalogosLoading(false);
    });

    return () => {
      active = false;
    };
  }, [canQuery]);

  // Estado para la recepción actual en proceso
  const [currentReception, setCurrentReception] = useState<{
    hasOC?: boolean;
    ocFolio: string;
    tarimas: number;
    proveedor: string;
    proveedorLogistico: string;
    receptionId?: string;
    fechaRecepcion?: string;
    lote?: string;
    caducidad?: string;
    codigosQR?: string[];
    plannedPallets?: PlannedReceptionPallet[];
    purchaseOrderId?: string;
    purchaseOrderNumber?: string;
    supplierCode?: string;
    supplierName?: string;
    logisticsProvider?: string;
    scheduledDate?: string;
    productos: Array<{
      productId: string | null;
      codigo: string | null;
      nombre: string;
      unidad: string | null;
      cantidad: number;
      precio: number;
      importe: number;
      estadoMatch: "confirmado" | "sugerido" | "manual";
    }>;
    conversionesTabla?: Array<{
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
    }>;
  } | null>(null);

  async function resumeReception(receptionId: string) {
    if (!db || !canQuery) {
      window.alert("No se puede reanudar sin conexión autorizada a Firestore.");
      return;
    }
    try {
      const services = createFirestoreServices(db, "org_exepa_001");
      const reception = await services.receptions.getById(receptionId);
      if (!reception || !["DRAFT", "IN_PROGRESS"].includes(reception.status)) {
        window.alert("La recepción ya no está disponible para reanudar.");
        return;
      }
      const pallets = reception.plannedPallets ?? [];
      if (pallets.length === 0) {
        window.alert("Esta recepción no tiene un plan de tarimas recuperable.");
        return;
      }
      const productsByLine = new Map<number, (typeof pallets)[number]>();
      pallets.forEach((pallet) => productsByLine.set(pallet.lineIndex, pallet));
      setCurrentReception({
        ocFolio: reception.folio || reception.purchaseOrderNumber || reception.id,
        tarimas: pallets.length,
        proveedor: reception.supplierName || reception.supplierCode || "Sin proveedor",
        proveedorLogistico: reception.logisticsProvider || "",
        receptionId: reception.id,
        fechaRecepcion: reception.scheduledDate,
        codigosQR: pallets.map((pallet) => pallet.qrIdentifier),
        plannedPallets: pallets,
        purchaseOrderId: reception.purchaseOrderId,
        purchaseOrderNumber: reception.purchaseOrderNumber,
        supplierCode: reception.supplierCode,
        supplierName: reception.supplierName,
        logisticsProvider: reception.logisticsProvider,
        scheduledDate: reception.scheduledDate,
        productos: [...productsByLine.entries()].map(([, pallet]) => ({
          productId: pallet.productId,
          codigo: null,
          nombre: pallet.productName,
          unidad: pallet.unit,
          cantidad: pallets
            .filter((item) => item.lineIndex === pallet.lineIndex)
            .reduce((sum, item) => sum + item.quantity, 0),
          precio: 0,
          importe: 0,
          estadoMatch: "confirmado" as const,
        })),
      });
      receptionSession.startSession(
        {
          receptionId: reception.id,
          folio: reception.folio || reception.id,
          warehouseId: reception.warehouseId,
          provider: reception.supplierName || reception.supplierCode || "",
          logisticsProvider: reception.logisticsProvider || "",
          productIds: [...new Set(pallets.map((pallet) => pallet.productId))],
          totalPallets: pallets.length,
        },
        "PALLETS",
      );
      navigate("captura-tarima");
    } catch (error) {
      console.error("Unable to resume reception:", error);
      window.alert("No se pudo cargar la recepción. Revisá la conexión y los permisos.");
    }
  }

  // Mobile state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ─── Inventario por almacén ──────────────────────────────────────────────
  const [inventario, setInventario] = useState<Record<string, Record<string, number>>>({});

  function inicializarInventarioAlmacen(almacenId: string) {
    setInventario((prev) => {
      if (prev[almacenId]) return prev;
      const inicial: Record<string, number> = {};
      catalogoProductos.forEach((p) => {
        inicial[p.id] = 0;
      });
      return { ...prev, [almacenId]: inicial };
    });
  }

  function aumentarInventario(
    almacenId: string,
    productos: {
      productoId: string;
      cajas: number;
    }[],
  ) {
    setInventario((prev) => {
      const almacen = prev[almacenId] ?? {};
      const actualizado = { ...almacen };
      productos.forEach(({ productoId, cajas }) => {
        actualizado[productoId] = (actualizado[productoId] ?? 0) + cajas;
      });
      return { ...prev, [almacenId]: actualizado };
    });
  }

  function reducirInventario(
    almacenId: string,
    productos: {
      productoId: string;
      cajas: number;
    }[],
  ) {
    setInventario((prev) => {
      const almacen = prev[almacenId] ?? {};
      const actualizado = { ...almacen };
      productos.forEach(({ productoId, cajas }) => {
        actualizado[productoId] = Math.max(0, (actualizado[productoId] ?? 0) - cajas);
      });
      return { ...prev, [almacenId]: actualizado };
    });
  }

  const almacenActivo = catalogoAlmacenes.find((a) => a.activo);

  const handleActivarAlmacen = (almacenId: string) => {
    setCatalogoAlmacenes((prev) => prev.map((a) => ({ ...a, activo: a.id === almacenId })));
    inicializarInventarioAlmacen(almacenId);
    if (isMobile) setSidebarOpen(false);
  };

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 769);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  function navigate(s: Screen, nav?: NavItem) {
    setScreen(s);
    if (nav) setActiveNav(nav);
    if (isMobile) setSidebarOpen(false);
  }

  const headerConfig: Record<Screen, HeaderConfig> = {
    home: {
      subtitle: "TARIMA QR · ALMACÉN NORTE",
      title: "Buenos días, Mariana",
    },
    "captura-evidencia": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Evidencia de mercancía",
    },
    "nueva-step1": { subtitle: "NUEVA RECEPCIÓN", title: "Orden de compra" },
    "nueva-step2": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Detalles de recepción",
    },
    "captura-tarima": {
      subtitle: currentReception
        ? `RECEPCIÓN · ${currentReception.ocFolio}`
        : "RECEPCIÓN · OC-24891",
      title: "Captura de tarima",
    },
    completada: {
      subtitle: currentReception
        ? `RECEPCIÓN · ${currentReception.ocFolio}`
        : "RECEPCIÓN · OC-24891",
      title: "Recepción completada",
    },
    recepciones: { subtitle: "HISTORIAL Y SEGUIMIENTO", title: "Recepciones" },
    "tarima-detalle": {
      subtitle: currentReception
        ? `${currentReception.ocFolio} · DETALLE DE TARIMA`
        : "OC-24891 · DETALLE DE TARIMA",
      title: `Tarima ${tarimaActual} de ${currentReception?.tarimas ?? TARIMA_TOTAL}`,
    },
    impresion: {
      subtitle: currentReception ? currentReception.ocFolio : "OC-24891",
      title: "Impresión de etiquetas",
    },
    "escanear-qr": { subtitle: "TARIMA QR", title: "Escanear código" },
    "editar-recepcion": { subtitle: "RECEPCIONES", title: "Editar recepción" },
    evidencias: { subtitle: "HISTORIAL Y SEGUIMIENTO", title: "Evidencias" },
    "evidencia-detalle": {
      subtitle: "EVIDENCIAS",
      title: "Detalle de evidencia",
    },
    "lotes-caducidades": {
      subtitle: "CONTROL DE INVENTARIO",
      title: "Lotes y caducidades",
    },
    embarques: { subtitle: "CONTROL DE SALIDAS", title: "Embarques" },
    configuracion: { subtitle: "SISTEMA", title: "Configuración" },
    "programacion-recepcion": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Programación de recepción",
    },
  };

  const header = headerConfig[screen];

  // Navigation items for sidebar/bottom nav
  type NavIcon = NavItem;
  type NavEntry = {
    id: NavItem;
    label: string;
    screen: Screen;
    icon: NavIcon;
  };
  const navItems: NavEntry[] = [
    {
      id: "home" as NavItem,
      label: "Inicio",
      screen: "home" as Screen,
      icon: "home",
    },
    {
      id: "recepciones" as NavItem,
      label: "Recepciones",
      screen: "recepciones" as Screen,
      icon: "recepciones",
    },
    {
      id: "embarques" as NavItem,
      label: "Embarques",
      screen: "embarques" as Screen,
      icon: "embarques",
    },
    {
      id: "qr" as NavItem,
      label: "Escanear QR",
      screen: "escanear-qr" as Screen,
      icon: "qr",
    },
    {
      id: "evidencias" as NavItem,
      label: "Evidencias",
      screen: "evidencias" as Screen,
      icon: "evidencias",
    },
    {
      id: "lotes" as NavItem,
      label: "Inventario",
      screen: "lotes-caducidades" as Screen,
      icon: "lotes",
    },
    {
      id: "configuracion" as NavItem,
      label: "Config.",
      screen: "configuracion" as Screen,
      icon: "configuracion",
    },
  ] as const;

  function renderNavIcon(item: NavEntry, active: boolean, size = 22) {
    const iconColor = active ? "#f2b84b" : "#b9c9cf";
    switch (item.icon) {
      case "home":
        return <img alt="" className={`size-[${size}px]`} src={imgWarehouseNav} />;
      case "recepciones":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="13" y2="16" />
          </svg>
        );
      case "embarques":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1" y="3" width="15" height="13" rx="1" />
            <path d="M16 8h4l3 4v4h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        );
      case "qr":
        return <img alt="" className={`size-[${size}px]`} src={imgScanQrCodeNav} />;
      case "evidencias":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        );
      case "lotes":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="8" y1="14" x2="8" y2="14" />
            <line x1="12" y1="14" x2="16" y2="14" />
            <line x1="8" y1="18" x2="8" y2="18" />
            <line x1="12" y1="18" x2="16" y2="18" />
          </svg>
        );
      case "configuracion":
        return (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={iconColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex h-[100dvh] w-full min-h-0 bg-[#edf1f3] overflow-hidden">
      {/* ─── Sidebar Overlay (mobile) ─── */}
      {isMobile && sidebarOpen && (
        <div
          className="sidebar-overlay open"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── Sidebar / Drawer ─── */}
      <aside
        className={`bg-[#16343f] flex flex-col gap-4 items-center py-5 w-[200px] shrink-0 sidebar-drawer ${
          isMobile && sidebarOpen ? "open" : ""
        }`}
        role="navigation"
        aria-label="Navegación principal"
      >
        <div className="flex flex-col gap-[8px] items-start flex-1 w-full">
          {navItems.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.screen, item.id)}
                className="flex items-center gap-3 py-[10px] px-3 rounded-[14px] w-full touch-target transition-colors text-left"
                style={{
                  backgroundColor: active ? "rgba(255,255,255,0.09)" : "transparent",
                }}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
              >
                {renderNavIcon(item, active, 22)}
                <p
                  className="font-semibold text-[12px] whitespace-nowrap truncate"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    color: active ? "#f2b84b" : "#b9c9cf",
                  }}
                >
                  {item.label}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-[6px] items-center w-full px-3">
          <div className="flex items-center gap-3 w-full py-2">
            <img alt="" className="size-[38px]" src={imgAvatar} />
            <div className="flex-1 min-w-0">
              <p
                className="font-bold text-white text-[12px] truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                {user?.displayName || user?.email || "Usuario"}
              </p>
              <p
                className="text-[#b9c9cf] text-[10px] truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                {profile?.warehouseId === "wh_tehuacan_2" ? "Tehuacan-2" : "Tehuacan-1"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded-[10px] border border-white/20 px-3 py-2 text-left text-[11px] font-semibold text-[#dce8eb] hover:bg-white/10 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ─── Main area ─── */}
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ─── Mobile Header ─── */}
        {isMobile && (
          <header className="bg-white border-b border-[#dce4e7] flex items-center justify-between gap-2 px-3 min-h-[64px] py-2 shrink-0 safe-top">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center size-10 rounded-[10px] border border-[#dce4e7] bg-white touch-target"
              aria-label="Abrir menú"
              aria-expanded={sidebarOpen}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#172126"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex flex-col gap-[2px] items-start flex-1 min-w-0">
              <p
                className="font-bold text-[#3276a8] text-[10px] uppercase truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                {header.subtitle}
              </p>
              <p
                className="text-[#172126] text-[18px] sm:text-[20px] truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                {header.title}
              </p>
            </div>
            <div className="flex gap-[8px] items-center">
              <div className="bg-[#e2f5ec] flex gap-[5px] items-center px-[8px] py-[5px] rounded-full touch-target">
                <img alt="" className="size-[6px]" src={imgIndicador} />
                <p
                  className="font-bold text-[#16845b] text-[11px] whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Online
                </p>
              </div>
            </div>
          </header>
        )}

        {/* ─── Desktop Header ─── */}
        {!isMobile && (
          <header className="bg-white border-b border-[#dce4e7] flex items-center justify-between px-7 h-[72px] shrink-0">
            <div className="flex items-center gap-4">
              {screen === "nueva-step1" && (
                <button
                  onClick={() => {
                    setCurrentReception(null);
                    navigate("captura-evidencia", "home");
                  }}
                  className="flex items-center justify-center size-9 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors shrink-0 touch-target"
                  title="Volver a captura de evidencia"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#172126"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              <div className="flex flex-col gap-[3px] items-start">
                <p
                  className="font-bold text-[#3276a8] text-[11px] uppercase"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  {header.subtitle}
                </p>
                <p
                  className="text-[#172126] text-[25px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
                >
                  {header.title}
                </p>
              </div>
              {screen === "tarima-detalle" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: 12,
                  }}
                >
                  <button
                    onClick={() => setTarimaActual((t) => Math.max(1, t - 1))}
                    disabled={tarimaActual === 1}
                    className="touch-target"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      border: "1px solid #dce4e7",
                      background: "white",
                      cursor: tarimaActual === 1 ? "not-allowed" : "pointer",
                      opacity: tarimaActual === 1 ? 0.35 : 1,
                      transition: "all 0.15s",
                      color: "#607078",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ display: "block", flexShrink: 0 }}
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setTarimaActual((t) => Math.min(TARIMA_TOTAL, t + 1))}
                    disabled={tarimaActual === TARIMA_TOTAL}
                    className="touch-target"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      paddingLeft: 12,
                      paddingRight: 12,
                      borderRadius: 8,
                      flexShrink: 0,
                      border: "1px solid #16343f",
                      background: tarimaActual === TARIMA_TOTAL ? "#dce4e7" : "#16343f",
                      cursor: tarimaActual === TARIMA_TOTAL ? "not-allowed" : "pointer",
                      opacity: tarimaActual === TARIMA_TOTAL ? 0.5 : 1,
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 700,
                        color: tarimaActual === TARIMA_TOTAL ? "#607078" : "white",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Tarima {Math.min(TARIMA_TOTAL, tarimaActual + 1)} de {TARIMA_TOTAL}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={tarimaActual === TARIMA_TOTAL ? "#607078" : "white"}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ display: "block", flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-[10px] items-center">
              <div className="bg-[#e2f5ec] flex gap-[7px] items-center px-[11px] py-[7px] rounded-full">
                <img alt="" className="size-[7px]" src={imgIndicador} />
                <p
                  className="font-bold text-[#16845b] text-[13px] whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Sistema en línea
                </p>
              </div>
              <p
                className="font-semibold text-[#607078] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
              >
                09:42
              </p>
            </div>
          </header>
        )}

        {/* ─── Content ─── */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain ${isMobile ? "content-padded" : ""}`}
        >
          {screen === "home" && (
            <Home
              onNewReception={() => {
                setCurrentReception(null);
                navigate(
                  isFeatureEnabled("USE_NEW_RECEPTION_FLOW")
                    ? "programacion-recepcion"
                    : "nueva-step1",
                  "home",
                );
              }}
              onRecepciones={() => navigate("recepciones", "recepciones")}
              onEscanearQr={() => navigate("escanear-qr", "qr")}
            />
          )}
          {screen === "programacion-recepcion" && (
            <ProgramacionRecepcion
              onBack={() => navigate("home", "home")}
              onFinish={(data) => {
                const conversionesTabla = (data.productos ?? []).map((product) => ({
                  producto: product.nombre,
                  productId: product.productId,
                  codigo: product.codigo || "",
                  unidades: product.cantidad,
                  unidad: product.unidad || "cajas",
                  piezasPorCaja: 1,
                  cajasPorTarima: product.cajasPorTarima || 1,
                  cajas: product.cantidad,
                  tarimas:
                    product.tarimas || Math.ceil(product.cantidad / (product.cajasPorTarima || 1)),
                  stickers: (product.tarimas || 0) * 4,
                  conversionMatch: true,
                }));
                const appReception = programacionToAppReception({
                  hasOC: true,
                  ocFolio: data.folio,
                  tarimas: String(data.tarimas),
                  proveedor: data.proveedor,
                  proveedorLogistico: data.proveedorLogistico,
                  productos: (data.productos ?? []).map((product) => ({
                    ...product,
                    precio: 0,
                    estadoMatch: product.productId ? "confirmado" : "sugerido",
                  })),
                  conversionesTabla,
                });
                if (!data.recepcionId) {
                  console.error("Reception session requires a stable receptionId");
                  return;
                }
                receptionSession.startSession(
                  {
                    receptionId: data.recepcionId,
                    folio: data.folio,
                    warehouseId: profile?.warehouseId || "wh_tehuacan_1",
                    provider: data.proveedor,
                    logisticsProvider: data.proveedorLogistico,
                    productIds: (data.productos ?? [])
                      .map((product) => product.productId)
                      .filter((id): id is string => Boolean(id)),
                    totalPallets: data.tarimas,
                  },
                  "EVIDENCE",
                );
                setCurrentReception({
                  ocFolio: data.folio,
                  tarimas: data.tarimas,
                  proveedor: data.proveedor,
                  proveedorLogistico: data.proveedorLogistico,
                  receptionId: data.recepcionId,
                  productos: appReception.lineas,
                  fechaRecepcion: data.fechaRecepcion,
                  codigosQR: data.codigosQR,
                  plannedPallets: data.plannedPallets,
                  purchaseOrderId: data.purchaseOrderId,
                  purchaseOrderNumber: data.purchaseOrderNumber,
                  supplierCode: data.supplierCode,
                  scheduledDate: data.scheduledDate,
                  conversionesTabla,
                });
                navigate("captura-evidencia");
              }}
              catalogos={{
                proveedores: catalogoProveedores,
                productos: catalogoProductos,
              }}
            />
          )}
          {screen === "captura-evidencia" && (
            <CapturaEvidencia
              onBack={() => navigate("home", "home")}
              currentReception={currentReception}
              receptionId={currentReception?.receptionId}
              onContinue={(evidence) => {
                setCurrentReception((prev) =>
                  prev
                    ? {
                        ...prev,
                        evidencePhotos: {
                          trailer: evidence.photos[0] || undefined,
                          product: evidence.photos[1] || undefined,
                          documentation: undefined,
                        },
                        proveedor: evidence.form.proveedor,
                        proveedorLogistico: evidence.form.item || prev?.proveedorLogistico,
                        lote: evidence.form.lote,
                        caducidad: evidence.form.caducidad,
                      }
                    : {
                        ocFolio: "OC-24891",
                        tarimas: parseInt(evidence.form.tarimas) || 20,
                        proveedor: evidence.form.proveedor,
                        proveedorLogistico: evidence.form.item, // item becomes proveedorLogistico
                        lote: evidence.form.lote,
                        caducidad: evidence.form.caducidad,
                        productos: [],
                        evidencePhotos: {
                          trailer: evidence.photos[0] || undefined,
                          product: evidence.photos[1] || undefined,
                          documentation: undefined,
                        },
                      },
                );
                receptionSession.transition("PALLETS");
                navigate("captura-tarima");
              }}
            />
          )}
          {screen === "nueva-step1" && (
            <NuevaRecepcionStep1
              onBack={() => {
                setCurrentReception(null);
                navigate("home", "home");
              }}
              initialData={
                currentReception?.receptionId
                  ? {
                      hasOC: currentReception.hasOC ?? true,
                      ocFolio: currentReception.ocFolio,
                      tarimas: String(currentReception.tarimas),
                      proveedor: currentReception.proveedor,
                      proveedorLogistico: currentReception.proveedorLogistico,
                      receptionId: currentReception.receptionId,
                      productos: currentReception.productos.map((product) => ({
                        ...product,
                        importe: product.importe,
                      })),
                      conversionesTabla: currentReception.conversionesTabla,
                    }
                  : undefined
              }
              onContinue={(data) => {
                setCurrentReception((prev) => ({
                  ...prev,
                  hasOC: data.hasOC,
                  ocFolio: data.ocFolio,
                  tarimas: parseInt(data.tarimas) || 20,
                  proveedor: data.proveedor,
                  proveedorLogistico: data.proveedorLogistico,
                  receptionId: data.receptionId,
                  productos: (data.productos ?? []).map((product) => ({
                    ...product,
                    precio: 0,
                    estadoMatch: product.estadoMatch,
                  })),
                  conversionesTabla: data.conversionesTabla,
                  lote: prev?.lote,
                  caducidad: prev?.caducidad,
                }));
                navigate("nueva-step2");
              }}
              catalogos={{
                proveedores: catalogoProveedores,
                productos: catalogoProductos,
              }}
              catalogosStatus={{
                loading: catalogosLoading,
                error: catalogosError,
              }}
            />
          )}

          {screen === "nueva-step2" && (
            <NuevaRecepcionStep2
              onBack={() => navigate("nueva-step1")}
              onContinue={() => navigate("captura-tarima")}
              initialData={
                currentReception
                  ? {
                      hasOC: true,
                      ocFolio: currentReception.ocFolio,
                      tarimas: currentReception.tarimas.toString(),
                      proveedor: currentReception.proveedor,
                      proveedorLogistico: currentReception.proveedorLogistico,
                      productos: currentReception.productos.map((product) => ({
                        ...product,
                      })),
                    }
                  : undefined
              }
              catalogos={{
                proveedores: catalogoProveedores,
                productos: catalogoProductos,
              }}
              catalogosStatus={{
                loading: catalogosLoading,
                error: catalogosError,
              }}
              conversiones={catalogoConversiones}
            />
          )}

          {screen === "captura-tarima" && (
            <CapturaTarima
              onBack={() => {
                if (
                  isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") &&
                  db &&
                  canQuery &&
                  currentReception?.receptionId
                ) {
                  navigate("recepciones", "recepciones");
                } else {
                  navigate("nueva-step2");
                }
              }}
              onFinish={() => {
                if (receptionSession.session.data && receptionSession.session.phase === "PALLETS") {
                  receptionSession.transition("CONFIRMED");
                  receptionSession.transition("COMPLETED");
                }
                navigate("completada");
              }}
              almacenActivo={almacenActivo ?? null}
              onAumentarInventario={aumentarInventario}
              catalogos={{ productos: catalogoProductos }}
              currentReception={currentReception}
              conversionesTabla={currentReception?.conversionesTabla}
            />
          )}
          {screen === "completada" && (
            <RecepcionCompletada
              onHome={() => {
                receptionSession.endSession();
                setCurrentReception(null);
                navigate("home", "home");
              }}
              onPrint={() => navigate("impresion")}
              currentReception={currentReception}
            />
          )}
          {screen === "impresion" && (
            <ImpresionEtiquetas
              onClose={() => navigate("completada")}
              currentReception={currentReception}
              conversionesTabla={currentReception?.conversionesTabla}
            />
          )}
          {screen === "recepciones" && (
            <Recepciones
              onResume={resumeReception}
              onSelectTarima={(id) => {
                setSelectedReception(id);
                navigate("tarima-detalle", "recepciones");
              }}
              onEdit={(id) => {
                setEditId(id);
                setEditReceptionData(null);
                navigate("editar-recepcion", "recepciones");
              }}
            />
          )}
          {screen === "escanear-qr" && (
            <EscanearQR
              onFound={(qrCode) => {
                setScannedQrCode(qrCode);
                setSelectedReception(null);
                navigate("tarima-detalle", "qr");
              }}
              onClose={() => navigate("home", "home")}
            />
          )}
          {screen === "editar-recepcion" && (
            <EditarRecepcion
              recId={editId}
              readOnly={!!editReceptionData}
              initialData={editReceptionData ?? undefined}
              onBack={() => {
                setEditReceptionData(null);
                navigate("recepciones", "recepciones");
              }}
              onSave={() => {
                setEditReceptionData(null);
                navigate("recepciones", "recepciones");
              }}
            />
          )}
          {screen === "tarima-detalle" && (
            <TarimaDetalle
              authorizedWarehouseIds={
                profile && isGlobalMembershipRole(profile.role)
                  ? [...CANONICAL_WAREHOUSE_IDS]
                  : profile
                    ? (normalizeMembershipWarehouses(profile) ?? [])
                    : []
              }
              onBack={() => {
                setScannedQrCode(null);
                setSelectedReception(null);
                navigate("recepciones", "recepciones");
              }}
              onViewReference={(reference) => {
                setEditId(reference.recId);
                setEditReceptionData({
                  tarimas: reference.tarimas,
                  proveedor: reference.proveedor,
                  proveedorLogistico: reference.proveedorLogistico,
                });
                navigate("editar-recepcion", "recepciones");
              }}
              currentReception={
                currentReception ||
                (selectedReception ? { ocFolio: selectedReception, tarimas: 20 } : null)
              }
              qrCode={scannedQrCode ?? undefined}
            />
          )}
          {screen === "evidencias" && (
            <Evidencias
              onSelect={(ev) => {
                setSelectedEvidencia(ev);
                navigate("evidencia-detalle", "evidencias");
              }}
            />
          )}
          {screen === "evidencia-detalle" && selectedEvidencia && (
            <EvidenciaDetalle
              evidencia={selectedEvidencia}
              onBack={() => navigate("evidencias", "evidencias")}
            />
          )}
          {screen === "lotes-caducidades" && <LotesCaducidades />}
          {screen === "embarques" && (
            <Embarques
              catalogoProductos={catalogoProductos}
              catalogoProveedores={catalogoProveedores}
              catalogoConversiones={catalogoConversiones}
              onReducirInventario={reducirInventario}
            />
          )}
          {screen === "configuracion" && (
            <Configuracion
              productos={catalogoProductos}
              setProductos={setCatalogoProductos}
              proveedores={catalogoProveedores}
              setProveedores={setCatalogoProveedores}
              conversiones={catalogoConversiones}
              setConversiones={setCatalogoConversiones}
              almacenes={catalogoAlmacenes}
              setAlmacenes={setCatalogoAlmacenes}
              onActivarAlmacen={handleActivarAlmacen}
            />
          )}
        </div>
      </main>

      {/* ─── Bottom Navigation (mobile only) ─── */}
      {isMobile && (
        <nav
          className="bottom-nav bg-white border-t border-[#dce4e7] flex items-center justify-between px-2 py-2 overflow-x-auto hide-scrollbar"
          role="navigation"
          aria-label="Navegación principal"
          style={{ gap: 4 }}
        >
          {navItems.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.screen, item.id)}
                className="flex flex-col gap-1 items-center px-3 py-2 touch-target flex-shrink-0"
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
              >
                {renderNavIcon(item, active, 22)}
                <p
                  className="text-[10px] whitespace-nowrap"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    color: active ? "#f2b84b" : "#b9c9cf",
                  }}
                >
                  {item.label}
                </p>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
