/**
 * Shared Types Barrel — God Component Refactor
 *
 * Single source of truth for all shared types used across contexts, hooks, and screens.
 * Replaces inline types in App.tsx with centralized, reusable definitions.
 */

// ============================================
// Navigation & Screen Types
// ============================================

/** All possible screen identifiers in the application */
export type Screen =
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
  | "configuracion"
  | "etiquetado"
  | "login"
  | "register";

/** Navigation item identifiers (subset of screens shown in nav) */
export type NavItem =
  | "home"
  | "recepciones"
  | "embarques"
  | "qr"
  | "evidencias"
  | "lotes"
  | "configuracion"
  | "etiquetado";

/** Navigation entry for sidebar/bottom nav rendering */
export interface NavEntry {
  id: NavItem;
  label: string;
  screen: Screen;
  icon: NavItem;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
}

/** Header configuration per screen */
export interface HeaderConfig {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: React.ReactNode;
}

// ============================================
// Reception Session Types
// ============================================

/** Phase of the reception workflow session */
export type ReceptionSessionPhase =
  | "idle"
  | "planning"
  | "evidence"
  | "pallets"
  | "completed"
  | "editing";

/** Session data for the reception workflow */
export interface ReceptionSessionData {
  phase: ReceptionSessionPhase;
  receptionId?: string;
  editId?: string;
  currentScreen?: Screen;
  scannedQrCode?: string;
  selectedEvidencia?: EvidenciaItem | null;
  tarimaActual?: Tarima | null;
}

/** Complete reception data structure */
export interface ReceptionData {
  hasOC?: boolean;
  ocFolio: string;
  tarimas: number;
  proveedor: string;
  proveedorLogistico: string;
  warehouseId?: string;
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
  productos: ReceptionProducto[];
  conversionesTabla?: ConversionTableRow[];
}

/** Product in reception (UI state) */
export interface ReceptionProducto {
  productId: string | null;
  codigo: string | null;
  nombre: string;
  unidad: string | null;
  cantidad: number;
  precio: number;
  importe: number;
  estadoMatch: "confirmado" | "sugerido" | "manual";
}

/** Planned reception pallet from Firestore */
export interface PlannedReceptionPallet {
  lineIndex: number;
  productId?: string;
  productName: string;
  unit: string;
  quantity: number;
  cajasPorTarima: number;
  targetTarimas: number;
  qrPayload: string;
}

/** Evidence item for listing */
export interface EvidenciaItem {
  id: string;
  fotoTrailer?: string | null;
  fotoProducto?: string | null;
  proveedor: string;
  proveedorLogistico: string;
  item: string;
  tarimas: number;
  caducidad: string;
  lote: string;
  ocFolio: string;
  fecha: string;
  hora: string;
  estado: string;
  color: string;
  bg: string;
  img: string;
}

/** Detailed evidence data */
export interface EvidenciaData {
  id: string;
  fotoTrailer?: string | null;
  fotoProducto?: string | null;
  documento?: string | null;
  proveedor: string;
  proveedorLogistico: string;
  item: string;
  tarimas: number;
  caducidad: string;
  lote: string;
  ocFolio: string;
  fecha: string;
  hora: string;
  estado: string;
  color: string;
  bg: string;
  img: string;
  receptionId?: string;
  evidenceId?: string;
  purchaseOrderNumber?: string;
  pallets?: EvidencePalletRow[];
}

/** Evidence pallet row for PDF generation */
export interface EvidencePalletRow {
  palletNumber: number;
  qrIdentifier?: string;
  lot?: string;
  expiryDate?: string | Date | { toDate?: () => Date };
}

// ============================================
// Tarima Types
// ============================================
// Canonical definitions live in @/types/embarque — re-exported here so that
// consumers importing from '@/types' keep a single source of truth.
import type {
  Tarima,
  TarimaScanInput,
  TarimaWithProgress,
  TarimaStatus,
  Embarque,
  EmbarqueStatus,
  EmbarqueWithProgress,
} from "./embarque";

export type {
  Tarima,
  TarimaScanInput,
  TarimaWithProgress,
  TarimaStatus,
  Embarque,
  EmbarqueStatus,
  EmbarqueWithProgress,
} from "./embarque";

// ============================================
// Catalog Types
// ============================================

/** Product catalog item */
export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  categoria: string;
  unidad: "cajas" | "piezas" | "kg";
  activo: boolean;
  codigosProveedor?: string[];
}

/** Supplier catalog item */
export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  tipo: "mercancia" | "logistica";
}

/** Conversion catalog item */
export interface Conversion {
  id: string;
  producto: string;
  piezasPorCaja: number;
  cajasPorTarima: number;
  pesoKgCaja: string;
}

/** Warehouse catalog item */
export interface Almacen {
  id: string;
  nombre: string;
  ubicacion: string;
  responsable: string;
  activo: boolean;
  creadoEn: string;
}

// ============================================
// Conversion Calculator Types
// ============================================

/** Input for conversion calculation */
export interface MatchedProduct {
  productId: string | null;
  productName: string;
  originalUnit: string;
  originalQuantity: number;
  conversion?: {
    unit: string;
    quantity: number;
    piecesPerBox: number;
    boxesPerPallet: number;
  };
}

/** Conversion properties from catalog */
export interface ConversionProps {
  piezasPorCaja: number;
  cajasPorTarima: number;
}

/** Result row in conversion table */
export interface ConversionTableRow {
  productId: string;
  productName: string;
  originalUnit: string;
  originalQuantity: number;
  conversions: Array<{
    unit: string;
    quantity: number;
    stickers: Array<{
      qrPayload: string;
      quantity: number;
    }>;
  }>;
}

// ============================================
// OCR Types
// ============================================
// Canonical definitions live in @/types/domain — re-exported here so that
// consumers importing from '@/types' keep a single source of truth.
import type { OcrProduct, OcrParsed, OcrResponse } from "./domain";

export type { OcrProduct, OcrParsed, OcrResponse } from "./domain";

// ============================================
// Validation Types
// ============================================

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================
// Soft Reservation Constants
// ============================================
// Canonical definitions live in @/types/embarque — re-exported here so that
// consumers importing from '@/types' keep a single source of truth.
export { SOFT_RESERVATION_HOURS, SOFT_RESERVATION_MS } from "./embarque";
