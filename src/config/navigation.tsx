/**
 * Navigation Configuration — God Component Refactor
 *
 * Centralized navigation config: screen order, nav items, header config, and icon renderer.
 * Extracted from App.tsx to enable Layout components to consume via UIContext.
 */

import type { Screen, NavItem, HeaderConfig } from "@/types";
import { ASSETS, CANONICAL_WAREHOUSE_IDS } from "@/config/constants";

// ============================================
// Screen Order (for keyboard navigation, etc.)
// ============================================

/** Ordered list of screens for sequential navigation */
export const screenOrder: Screen[] = [
  "home",
  "programacion-recepcion",
  "nueva-step1",
  "nueva-step2",
  "captura-evidencia",
  "captura-tarima",
  "completada",
  "recepciones",
  "tarima-detalle",
  "impresion",
  "escanear-qr",
  "editar-recepcion",
  "evidencias",
  "evidencia-detalle",
  "lotes-caducidades",
  "embarques",
  "configuracion",
  "login",
  "register",
];

// ============================================
// Navigation Items (Sidebar & BottomNav)
// ============================================

/** Navigation entries for sidebar and bottom nav */
export interface NavEntry {
  id: NavItem;
  label: string;
  screen: Screen;
  icon: NavItem;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
}

/** Navigation items displayed in sidebar (desktop) and bottom nav (mobile) */
export const navItems: readonly NavEntry[] = [
  {
    id: "home",
    label: "Inicio",
    screen: "home",
    icon: "home",
  },
  {
    id: "recepciones",
    label: "Recepciones",
    screen: "recepciones",
    icon: "recepciones",
  },
  {
    id: "embarques",
    label: "Embarques",
    screen: "embarques",
    icon: "embarques",
  },
  {
    id: "qr",
    label: "Escanear QR",
    screen: "escanear-qr",
    icon: "qr",
  },
  {
    id: "evidencias",
    label: "Evidencias",
    screen: "evidencias",
    icon: "evidencias",
  },
  {
    id: "lotes",
    label: "Inventario",
    screen: "lotes-caducidades",
    icon: "lotes",
  },
  {
    id: "configuracion",
    label: "Config.",
    screen: "configuracion",
    icon: "configuracion",
  },
  {
    id: "etiquetado",
    label: "Etiquetado",
    screen: "etiquetado",
    icon: "etiquetado",
  },
] as const;

/** Mapping from NavItem id to asset icon */
export function getNavIconAsset(iconId: NavItem): string {
  switch (iconId) {
    case "home":
      return ASSETS.WAREHOUSE_NAV;
    case "recepciones":
    case "evidencias":
    case "lotes":
      return ASSETS.CLIPBOARD_LIST_NAV;
    case "embarques":
      return ASSETS.PACKAGE;
    case "qr":
      return ASSETS.SCAN_QR_CODE_NAV;
    case "configuracion":
      return ASSETS.INDICADOR;
    case "etiquetado":
      return ASSETS.ETIQUETADO_NAV || ASSETS.PACKAGE;
    default:
      return ASSETS.WAREHOUSE_NAV;
  }
}

// ============================================
// Header Configuration per Screen
// ============================================

/** Dynamic header config factory - receives current reception state */
export function createHeaderConfig(
  currentReception: {
    ocFolio?: string;
    tarimas?: number;
  } | null,
  tarimaPosition: number,
  tarimaTotal: number,
): Record<Screen, HeaderConfig> {
  const folio = currentReception?.ocFolio ?? "OC-24891";
  const totalPallets = currentReception?.tarimas ?? 20;

  return {
    home: {
      subtitle: `TARIMA QR · ALMACÉN NORTE`,
      title: "Buenos días, Mariana",
    },
    "captura-evidencia": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Evidencia de mercancía",
    },
    "nueva-step1": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Orden de compra",
    },
    "nueva-step2": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Detalles de recepción",
    },
    "captura-tarima": {
      subtitle: `RECEPCIÓN · ${folio}`,
      title: "Captura de tarima",
    },
    completada: {
      subtitle: `RECEPCIÓN · ${folio}`,
      title: "Recepción completada",
    },
    recepciones: {
      subtitle: "HISTORIAL Y SEGUIMIENTO",
      title: "Recepciones",
    },
    "tarima-detalle": {
      subtitle: `${folio} · DETALLE DE TARIMA`,
      title: `Tarima ${tarimaPosition} de ${tarimaTotal}`,
    },
    impresion: {
      subtitle: folio,
      title: "Impresión de etiquetas",
    },
    "escanear-qr": {
      subtitle: "TARIMA QR",
      title: "Escanear código",
    },
    "editar-recepcion": {
      subtitle: "RECEPCIONES",
      title: "Editar recepción",
    },
    evidencias: {
      subtitle: "HISTORIAL Y SEGUIMIENTO",
      title: "Evidencias",
    },
    "evidencia-detalle": {
      subtitle: "EVIDENCIAS",
      title: "Detalle de evidencia",
    },
    "lotes-caducidades": {
      subtitle: "CONTROL DE INVENTARIO",
      title: "Lotes y caducidades",
    },
    embarques: {
      subtitle: "CONTROL DE SALIDAS",
      title: "Embarques",
    },
    configuracion: {
      subtitle: "SISTEMA",
      title: "Configuración",
    },
    etiquetado: {
      subtitle: "ETIQUETADO",
      title: "Módulo de etiquetado",
    },
    "programacion-recepcion": {
      subtitle: "NUEVA RECEPCIÓN",
      title: "Programación de recepción",
    },
    login: {
      subtitle: "",
      title: "Iniciar sesión",
    },
    register: {
      subtitle: "",
      title: "Registro",
    },
  };
}

// ============================================
// NavIcon Renderer
// ============================================

/** Renders a navigation icon for sidebar/bottom nav */
export function renderNavIcon(iconId: NavItem, active: boolean, size = 22): React.ReactNode {
  const iconColor = active ? "#f2b84b" : "#b9c9cf";

  switch (iconId) {
    case "home":
      return <img alt="" className={`size-[${size}px]`} src={ASSETS.WAREHOUSE_NAV} />;

    case "recepciones":
    case "evidencias":
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
          <path d="M22 8.5V15a2.5 2.5 0 0 1-2.5 2.5h-.08a2.5 2.5 0 0 1-1.6-.8l-7.5-6a2.5 2.5 0 0 1 0-3.4l7.5-6a2.5 2.5 0 0 1 1.6-.8H19.5A2.5 2.5 0 0 1 22 8.5Z" />
        </svg>
      );

    case "qr":
      return <img alt="" className={`size-[${size}px]`} src={ASSETS.SCAN_QR_CODE_NAV} />;

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
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );

    default:
      return <img alt="" className={`size-[${size}px]`} src={ASSETS.WAREHOUSE_NAV} />;
  }
}

// ============================================
// Default header config (static fallback)
// ============================================

/** Static header config for screens without dynamic content */
export const staticHeaderConfig: Partial<Record<Screen, HeaderConfig>> = {
  home: {
    subtitle: "TARIMA QR · ALMACÉN NORTE",
    title: "Buenos días, Mariana",
  },
  "captura-evidencia": {
    subtitle: "NUEVA RECEPCIÓN",
    title: "Evidencia de mercancía",
  },
  "nueva-step1": {
    subtitle: "NUEVA RECEPCIÓN",
    title: "Orden de compra",
  },
  "nueva-step2": {
    subtitle: "NUEVA RECEPCIÓN",
    title: "Detalles de recepción",
  },
  "escanear-qr": {
    subtitle: "TARIMA QR",
    title: "Escanear código",
  },
  "editar-recepcion": {
    subtitle: "RECEPCIONES",
    title: "Editar recepción",
  },
  evidencias: {
    subtitle: "HISTORIAL Y SEGUIMIENTO",
    title: "Evidencias",
  },
  "evidencia-detalle": {
    subtitle: "EVIDENCIAS",
    title: "Detalle de evidencia",
  },
  "lotes-caducidades": {
    subtitle: "CONTROL DE INVENTARIO",
    title: "Lotes y caducidades",
  },
  embarques: {
    subtitle: "CONTROL DE SALIDAS",
    title: "Embarques",
  },
  configuracion: {
    subtitle: "SISTEMA",
    title: "Configuración",
  },
  etiquetado: {
    subtitle: "ETIQUETADO",
    title: "Módulo de etiquetado",
  },
  "programacion-recepcion": {
    subtitle: "NUEVA RECEPCIÓN",
    title: "Programación de recepción",
  },
  login: {
    subtitle: "",
    title: "Iniciar sesión",
  },
  register: {
    subtitle: "",
    title: "Registro",
  },
};
