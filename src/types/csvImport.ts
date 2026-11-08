/**
 * CSV Import & Inventory Grid View — Types
 * God Component Refactor Phase 8 extension
 */

// ─── Catalog Types ────────────────────────────────────────────────────────────

export type CatalogType = 'products' | 'suppliers' | 'conversions' | 'warehouses';

export interface ProductCsvRow {
  nombre: string;
  sku: string;
  categoria?: string;
  unidad: 'cajas' | 'piezas' | 'kg';
  codigosProveedor?: string; // comma-separated
}

export interface SupplierCsvRow {
  nombre: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  tipo: 'mercancia' | 'logistica';
}

export interface ConversionCsvRow {
  producto: string; // matches product nombre (case-insensitive)
  piezasPorCaja: number;
  cajasPorTarima: number;
  pesoKgCaja?: number;
}

export interface WarehouseCsvRow {
  nombre: string;
  ubicacion?: string;
  responsable?: string;
}

export type CsvRow = ProductCsvRow | SupplierCsvRow | ConversionCsvRow | WarehouseCsvRow;

// ─── Validation ────────────────────────────────────────────────────────────────

export type ValidationCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_TYPE'
  | 'DUPLICATE_SKU'
  | 'DUPLICATE_WAREHOUSE'
  | 'UNKNOWN_PRODUCT'
  | 'INVALID_ENUM'
  | 'DUPLICATE_IN_FILE';

export interface ValidationError {
  code: ValidationCode;
  message: string;
  column?: string;
}

export interface ValidationResult {
  rowIndex: number; // 1-based (header = 0)
  data: CsvRow;
  isValid: boolean;
  errors: ValidationError[];
}

export interface ParseResult<T> {
  rows: T[];
  errors: Array<{ row: number; code: string; message: string; data: Record<string, string> }>;
  meta: {
    lines: number;
    delimiter: string;
    encoding: string;
  };
}

// ─── Import Log ────────────────────────────────────────────────────────────────

export interface ImportLog {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  type: CatalogType;
  fileName: string;
  fileSize: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  status: 'preview' | 'committed' | 'failed';
  errors: Array<{
    row: number;
    code: ValidationCode;
    message: string;
    data: Record<string, string>;
  }>;
  createdAt: Date; // Firestore Timestamp in reality
  committedAt?: Date;
}

// ─── Inventory Grid ────────────────────────────────────────────────────────────

export interface InventoryMonthly {
  id: string; // `${warehouseId}_${productId}_${year}_${month}`
  warehouseId: string;
  productId: string;
  year: number;
  month: number; // 1-12
  cajas: number;
  tarimas: number;
  updatedAt: Date;
  updatedBy: string;
}

export interface GridFilters {
  warehouseId: string;
  year: number;
}

export interface GridCell {
  productId: string;
  productName: string;
  productSku?: string;
  monthlyCajas: number[]; // 12 months (index 0 = Jan)
  monthlyTarimas: number[];
  rowTotalCajas: number;
  rowTotalTarimas: number;
  // For drill-down
  hasBreakdown?: boolean;
  breakdown?: ReceptionBreakdown;
}

export interface GridData {
  rows: GridCell[];
  columnTotalsCajas: number[]; // 12 months
  columnTotalsTarimas: number[];
  grandTotalCajas: number;
  grandTotalTarimas: number;
  filters: GridFilters;
  lastUpdated: Date;
}

export interface ReceptionBreakdown {
  productId: string;
  productName: string;
  month: number;
  year: number;
  receptions: Array<{
    id: string;
    folio: string;
    fecha: Date;
    proveedor: string;
    cajas: number;
    tarimas: number;
  }>;
  totalCajas: number;
  totalTarimas: number;
}

// ─── Hook Return Types ────────────────────────────────────────────────────────

export interface UseCsvImportReturn {
  // State
  previewRows: ValidationResult[];
  isParsing: boolean;
  isCommitting: boolean;
  importLog: ImportLog | null;
  selectedType: CatalogType;
  
  // Actions
  parseFile: (file: File, type: CatalogType) => Promise<void>;
  commitImport: () => Promise<void>;
  downloadTemplate: (type: CatalogType) => void;
  clearPreview: () => void;
  setSelectedType: (type: CatalogType) => void;
}

export interface UseInventoryGridReturn {
  // State
  gridData: GridData | null;
  isLoading: boolean;
  error: Error | null;
  filters: GridFilters;
  
  // Actions
  setFilters: (filters: Partial<GridFilters>) => void;
  exportCsv: () => void;
  exportPdf: () => void;
  refresh: () => void;
  getBreakdown: (productId: string, month: number) => Promise<ReceptionBreakdown | null>;
}

export interface UseImportLogReturn {
  logs: ImportLog[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

// ─── Template Headers ──────────────────────────────────────────────────────────

export const TEMPLATE_HEADERS: Record<CatalogType, string[]> = {
  products: ['nombre', 'sku', 'categoria', 'unidad', 'codigosProveedor'],
  suppliers: ['nombre', 'contacto', 'telefono', 'email', 'tipo'],
  conversions: ['producto', 'piezasPorCaja', 'cajasPorTarima', 'pesoKgCaja'],
  warehouses: ['nombre', 'ubicacion', 'responsable'],
};

export const TEMPLATE_EXAMPLES: Record<CatalogType, CsvRow[]> = {
  products: [
    { nombre: 'AGUA MINERAL 600 ML', sku: 'AGU-600', categoria: 'Bebidas', unidad: 'cajas', codigosProveedor: 'AGU600,AGUA-600ML' },
    { nombre: 'COCA COLA 600ML', sku: 'COC-600', categoria: 'Bebidas', unidad: 'cajas', codigosProveedor: 'COC600' },
  ],
  suppliers: [
    { nombre: 'COCA COLA FEMSA', contacto: 'Juan Pérez', telefono: '55-1234-5678', email: 'juan@cocacola.com', tipo: 'mercancia' },
    { nombre: 'TRANSPORTES NORTE', contacto: 'María García', telefono: '55-8765-4321', email: 'maria@transportesnorte.com', tipo: 'logistica' },
  ],
  conversions: [
    { producto: 'AGUA MINERAL 600 ML', piezasPorCaja: 24, cajasPorTarima: 84, pesoKgCaja: 15.5 },
    { producto: 'COCA COLA 600ML', piezasPorCaja: 24, cajasPorTarima: 84, pesoKgCaja: 16.0 },
  ],
  warehouses: [
    { nombre: 'Bodega Norte', ubicacion: 'Av. Insurgentes 123, CDMX', responsable: 'Carlos López' },
    { nombre: 'Bodega Sur', ubicacion: 'Calzada de Tlalpan 456, CDMX', responsable: 'Ana Martínez' },
  ],
};