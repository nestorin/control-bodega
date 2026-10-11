import { useState, useRef, useEffect } from "react"
import type { Producto as CatalogoProducto, Proveedor } from "./Configuracion"
import { useOcr } from "../hooks/useOcr"
import { isFeatureEnabled } from "@/config/featureFlags"
import { db } from "@/lib/firebase"
import { createFirestoreServices } from "@/services/firestore"
import { useAuthorization, isPermissionDenied } from "@/hooks/useAuthorization"
import type { ShipmentDoc, ShipmentLine } from "@/services/firestore/types"
import { ImprimirEtiquetas } from "@/components/ImprimirEtiquetas"
import { ScannerTarimas } from "@/components/ScannerTarimas"
import { planificarEmbarque } from "@/services/embarques"
import { httpsCallable, getFunctions } from "firebase/functions"
import { getStockDisponible } from "@/services/inventario"
import type { DocumentoCargado } from "@/types/documento"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import { buildUpcomingExpiryAlert } from "@/services/expiryAlerts"
import {
  mergeCanonicalConversions,
  type EmbarqueConversion,
} from "@/services/conversiones"
import { normalizeShipmentProducts } from "@/services/domain/shipmentProductSelection"

// ─── Types ────────────────────────────────────────────────────────────────────

const ORG_ID = "org_exepa_001"

type EmbarqueStatus = "programado" | "en-proceso" | "completado"
type Paso = 1 | 2 | 3
type Unidad = "cajas" | "piezas"

interface Producto {
  id: string
  productId?: string
  nombre: string
  cantidad: number
  unidad: Unidad
  precioUnitario: number
  piezasPorCaja: string
  cajasPorTarima: string
  tarimasDeclaradas: number
}

interface TarimaEscaneada {
  id: string
  productoNombre: string
  timestamp: string
}

interface Evidencia {
  fotosEmbarque: string[]
  fotoCaja: string
  transportista: string
  fotoSelloInterno: string
  fotoSelloCaja: string
  fotoDocumento: string
}

interface Embarque {
  id: string
  folio: string
  cliente: string
  bodega: string
  productos: Producto[]
  tarimasEscaneadas: TarimaEscaneada[]
  evidencia: Partial<Evidencia>
  status: EmbarqueStatus
  paso: Paso
  fechaCreacion: string
  fechaProgramada?: string
}

// Firestore-compatible types for dual-write
interface FirestoreShipment {
  id: string
  folio: string
  cliente: string
  bodega: string
  warehouseId: string
  lines: ShipmentLine[]
  tarimasEscaneadas: TarimaEscaneada[]
  evidencia: Partial<Evidencia>
  status: ShipmentDoc["status"]
  paso: Paso
  fechaCreacion: string
  fechaProgramada?: string
}

// ─── Mock history ─────────────────────────────────────────────────────────────

const EMBARQUES_INICIALES: Embarque[] = [
  {
    id: "EMB-001",
    folio: "FAC-2024-0891",
    cliente: "Súper Ahorro S.A. de C.V.",
    bodega: "Tehuacan-1",
    productos: [
      {
        id: "p1",
        nombre: "Coca Cola regular 235ml",
        cantidad: 240,
        unidad: "cajas",
        precioUnitario: 185,
        piezasPorCaja: "24",
        cajasPorTarima: "60",
        tarimasDeclaradas: 4,
      },
      {
        id: "p2",
        nombre: "Agua mineral 355ml c/24",
        cantidad: 120,
        unidad: "cajas",
        precioUnitario: 95,
        piezasPorCaja: "24",
        cajasPorTarima: "60",
        tarimasDeclaradas: 2,
      },
    ],
    tarimasEscaneadas: [
      {
        id: "TAR-0021",
        productoNombre: "Coca Cola regular 235ml",
        timestamp: "09:14",
      },
      {
        id: "TAR-0022",
        productoNombre: "Coca Cola regular 235ml",
        timestamp: "09:17",
      },
      {
        id: "TAR-0031",
        productoNombre: "Agua mineral 355ml c/24",
        timestamp: "09:22",
      },
    ],
    evidencia: { transportista: "Roberto Méndez" },
    status: "completado",
    paso: 3,
    fechaCreacion: "2026-09-20",
  },
  {
    id: "EMB-002",
    folio: "FAC-2024-0912",
    cliente: "Distribuidora Del Valle",
    bodega: "Tehuacan-1",
    productos: [
      {
        id: "p1",
        nombre: "Pepsi 3 lts",
        cantidad: 60,
        unidad: "cajas",
        precioUnitario: 210,
        piezasPorCaja: "6",
        cajasPorTarima: "40",
        tarimasDeclaradas: 2,
      },
    ],
    tarimasEscaneadas: [
      { id: "TAR-0041", productoNombre: "Pepsi 3 lts", timestamp: "14:05" },
    ],
    evidencia: {},
    status: "en-proceso",
    paso: 2,
    fechaCreacion: "2026-09-26",
  },
  {
    id: "EMB-003",
    folio: "FAC-2024-0930",
    cliente: "Tiendas Oriente",
    bodega: "Tehuacan-1",
    productos: [
      {
        id: "p1",
        nombre: "Lechera 375grs c/48",
        cantidad: 144,
        unidad: "cajas",
        precioUnitario: 320,
        piezasPorCaja: "48",
        cajasPorTarima: "72",
        tarimasDeclaradas: 2,
      },
    ],
    tarimasEscaneadas: [],
    evidencia: {},
    status: "programado",
    paso: 1,
    fechaCreacion: "2026-09-27",
    fechaProgramada: "2026-09-29",
  },
]

// Convert local Embarque to Firestore ShipmentLine[]
function toShipmentLines(productos: Producto[]): ShipmentLine[] {
  return productos.map((p) => ({
    productId: p.productId ?? p.id,
    quantity: p.tarimasDeclaradas,
    unit: p.unidad,
    palletsScanned: [],
  }))
}

// Convert Firestore ShipmentDoc to local Embarque
function fromFirestoreShipment(
  fs: FirestoreShipment,
  catalogoProductos: CatalogoProducto[],
): Embarque {
  // Map productId back to product names from catalog
  const productos = fs.lines.map((line) => {
    const cat = catalogoProductos.find((c) => c.id === line.productId)
    return {
      id: line.productId,
      productId: line.productId,
      nombre: cat?.nombre || line.productId,
      cantidad: line.quantity,
      unidad: line.unit as Unidad,
      precioUnitario: 0, // Not stored in Firestore
      piezasPorCaja: "",
      cajasPorTarima: "",
      tarimasDeclaradas: line.quantity,
    }
  })

  const statusMap: Record<ShipmentDoc["status"], EmbarqueStatus> = {
    PROGRAMMED: "programado",
    IN_PROGRESS: "en-proceso",
    COMPLETED: "completado",
    CANCELLED: "completado", // Treat cancelled as completed for UI
  }

  return {
    id: fs.id,
    folio: fs.folio,
    cliente: fs.cliente,
    bodega: fs.bodega,
    productos,
    tarimasEscaneadas: fs.tarimasEscaneadas,
    evidencia: fs.evidencia,
    status: statusMap[fs.status] || "programado",
    paso: fs.paso,
    fechaCreacion: fs.fechaCreacion,
    fechaProgramada: fs.fechaProgramada,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newProducto(): Producto {
  return {
    id: `p-${Date.now()}`,
    productId: undefined,
    nombre: "",
    cantidad: 0,
    unidad: "cajas",
    precioUnitario: 0,
    piezasPorCaja: "",
    cajasPorTarima: "",
    tarimasDeclaradas: 0,
  }
}

function calcTotal(p: Producto) {
  return p.cantidad * p.precioUnitario
}

function calcTarimasAuto(
  p: Producto,
  conversiones: EmbarqueConversion[],
): number | null {
  const conv = conversiones.find(
    (c) =>
      c.producto.trim().toLocaleLowerCase() ===
      p.nombre.trim().toLocaleLowerCase(),
  )
  const pxc = conv ? conv.piezasPorCaja : parseFloat(p.piezasPorCaja)
  const cxt = conv ? conv.cajasPorTarima : parseFloat(p.cajasPorTarima)
  if (!pxc || !cxt || pxc <= 0 || cxt <= 0) return null
  if (p.unidad === "cajas") return Math.ceil(p.cantidad / cxt)
  return Math.ceil(p.cantidad / pxc / cxt)
}

function totalTarimas(productos: Producto[]) {
  return productos.reduce((s, p) => s + p.tarimasDeclaradas, 0)
}

function statusLabel(s: EmbarqueStatus) {
  return s === "completado"
    ? "Completado"
    : s === "en-proceso"
      ? "En proceso"
      : "Programado"
}

function statusColor(s: EmbarqueStatus) {
  return s === "completado"
    ? { bg: "#e2f5ec", text: "#16845b" }
    : s === "en-proceso"
      ? { bg: "#fff3cd", text: "#856404" }
      : { bg: "#e8eef6", text: "#3276a8" }
}

// ─── Components ───────────────────────────────────────────────────────────────

function Pill({ label, s }: { label: string s: EmbarqueStatus }) {
  const c = statusColor(s)
  return (
    <span
      className="text-[11px] font-bold px-[10px] py-[4px] rounded-full"
      style={{
        background: c.bg,
        color: c.text,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {label}
    </span>
  )
}

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white rounded-[20px] shadow-[0px_4px_12px_rgba(22,52,63,0.07)] p-4 md:p-6 ${className}`}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-bold uppercase text-[#607078] mb-1"
      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
    >
      {children}
    </p>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`border border-[#dce4e7] rounded-[10px] px-3 py-2 text-[14px] text-[#172126] w-full outline-none focus:border-[#3276a8] transition-colors bg-white ${className}`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    />
  )
}

function ProductoAutocomplete({
  value,
  onChange,
  catalogo,
}: {
  value: string
  onChange: (nombre: string, producto?: CatalogoProducto) => void
  catalogo: CatalogoProducto[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const activos = catalogo.filter((p) => p.activo)
  const filtered = query.trim()
    ? activos.filter((p) =>
        p.nombre.toLowerCase().includes(query.toLowerCase()),
      )
    : activos

  function select(p: CatalogoProducto) {
    setQuery(p.nombre)
    setOpen(false)
    onChange(p.nombre, p)
  }

  function handleChange(v: string) {
    setQuery(v)
    onChange(v)
    setOpen(true)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Buscar producto del catálogo…"
        className="border border-[#dce4e7] rounded-[10px] px-3 py-2 text-[14px] text-[#172126] w-full outline-none focus:border-[#3276a8] transition-colors bg-white"
        style={{ fontFamily: "'Inter', sans-serif" }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#dce4e7] rounded-[12px] shadow-[0px_8px_24px_rgba(22,52,63,0.12)] overflow-hidden max-h-[220px] overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              onMouseDown={() => select(p)}
              className="flex items-center justify-between w-full px-4 py-[10px] hover:bg-[#f4f8fc] transition-colors text-left border-b border-[#f0f4f5] last:border-0"
            >
              <div>
                <p
                  className="text-[13px] font-semibold text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.nombre}
                </p>
                <p
                  className="text-[11px] text-[#607078]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.sku} · {p.categoria}
                </p>
              </div>
              <span
                className="text-[11px] text-[#607078] capitalize shrink-0 ml-3"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {p.unidad}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#dce4e7] rounded-[12px] shadow-[0px_8px_24px_rgba(22,52,63,0.12)] px-4 py-3">
          <p
            className="text-[13px] text-[#607078]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            No hay coincidencias en el catálogo.
          </p>
        </div>
      )}
    </div>
  )
}

function TransportistaAutocomplete({
  value,
  onChange,
  proveedores,
}: {
  value: string
  onChange: (v: string) => void
  proveedores: Proveedor[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const logistica = proveedores.filter((p) => p.tipo === "logistica")
  const filtered = query.trim()
    ? logistica.filter(
        (p) =>
          p.nombre.toLowerCase().includes(query.toLowerCase()) ||
          p.contacto.toLowerCase().includes(query.toLowerCase()),
      )
    : logistica

  function select(p: Proveedor) {
    const display = `${p.contacto} — ${p.nombre}`
    setQuery(display)
    onChange(display)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar transportista registrado…"
        className="border border-[#dce4e7] rounded-[10px] px-3 py-2 text-[14px] text-[#172126] w-full outline-none focus:border-[#3276a8] transition-colors bg-white"
        style={{ fontFamily: "'Inter', sans-serif" }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#dce4e7] rounded-[12px] shadow-[0px_8px_24px_rgba(22,52,63,0.12)] overflow-hidden max-h-[200px] overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              onMouseDown={() => select(p)}
              className="flex items-center justify-between w-full px-4 py-[10px] hover:bg-[#f4f8fc] transition-colors text-left border-b border-[#f0f4f5] last:border-0"
            >
              <div>
                <p
                  className="text-[13px] font-semibold text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.contacto}
                </p>
                <p
                  className="text-[11px] text-[#607078]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.nombre}
                </p>
              </div>
              {p.telefono && (
                <p
                  className="text-[11px] text-[#607078] shrink-0 ml-3"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.telefono}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#dce4e7] rounded-[12px] shadow-[0px_8px_24px_rgba(22,52,63,0.12)] px-4 py-3">
          <p
            className="text-[13px] text-[#607078]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Sin coincidencias. Agrega transportistas en Configuración → Prov.
            Logística.
          </p>
        </div>
      )}
    </div>
  )
}

function Btn({
  children,
  onClick,
  variant = "primary",
  small = false,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "danger" | "ghost"
  small?: boolean
  disabled?: boolean
  className?: string
}) {
  const base = `rounded-[10px] font-bold transition-colors cursor-pointer flex items-center gap-2 ${
    small ? "px-3 py-[6px] text-[12px]" : "px-4 py-[10px] text-[13px]"
  }`
  const styles: Record<string, string> = {
    primary: "bg-[#16343f] text-white hover:bg-[#1e4655]",
    secondary:
      "bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f4f7f8]",
    danger:
      "bg-[#fdecea] text-[#c0392b] hover:bg-[#fbd5d1] border border-[#f5c6c2]",
    ghost: "bg-transparent text-[#607078] hover:bg-[#f4f7f8]",
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]} ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${className}`}
      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
    >
      {children}
    </button>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ paso }: { paso: Paso }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {([1, 2, 3] as Paso[]).map((n, i) => {
        const done = paso > n
        const active = paso === n
        return (
          <div key={n} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="size-7 rounded-full flex items-center justify-center text-[12px] font-bold"
                style={{
                  background: done ? "#16343f" : active ? "#f2b84b" : "#dce4e7",
                  color:
                    done || active ? (done ? "white" : "#16343f") : "#607078",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {done ? "✓" : n}
              </div>
              <span
                className="text-[12px] font-semibold hidden sm:block"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: active ? "#172126" : "#607078",
                }}
              >
                {n === 1 ? "Preparación" : n === 2 ? "Carga QR" : "Evidencia"}
              </span>
            </div>
            {i < 2 && (
              <div
                className="flex-1 h-[2px]"
                style={{ background: done ? "#16343f" : "#dce4e7" }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

export function Paso1({
  embarque,
  onChange,
  onNext,
  catalogoProductos,
  catalogoConversiones,
  conversionSource,
}: {
  embarque: Embarque
  onChange: (e: Embarque) => void
  onNext: () => void
  catalogoProductos: CatalogoProducto[]
  catalogoConversiones: EmbarqueConversion[]
  conversionSource: "loading" | "firestore" | "fallback"
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { runOcr, loading, result, error, clear } = useOcr()

  function updateField(field: keyof Embarque, val: string) {
    onChange({ ...embarque, [field]: val })
  }

  function updateProducto(
    idx: number,
    field: keyof Producto,
    val: string | number,
  ) {
    const ps = embarque.productos.map((p, i) => {
      if (i !== idx) return p
      const updated = { ...p, [field]: val }
      if (field === "cantidad" || field === "precioUnitario") {
        return updated
      }
      return updated
    })
    onChange({ ...embarque, productos: ps })
  }

  function addProducto() {
    onChange({ ...embarque, productos: [...embarque.productos, newProducto()] })
  }

  function removeProducto(idx: number) {
    onChange({
      ...embarque,
      productos: embarque.productos.filter((_, i) => i !== idx),
    })
  }

  const canContinue =
    embarque.folio.trim() &&
    embarque.cliente.trim() &&
    normalizeShipmentProducts(embarque.productos, catalogoProductos) !== null

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await runOcr(file, "cfdi")
    } catch {
      // error handled by hook
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar paso={1} />

      {/* Invoice upload */}
      <SectionCard>
        <p
          className="font-bold text-[#172126] text-[18px] mb-1"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          Cargar factura
        </p>
        <p
          className="text-[#607078] text-[13px] mb-4"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {loading
            ? "Procesando OCR..."
            : result
              ? "OCR completado — revisa los datos"
              : "Sube una factura (JPG/PNG) para extraer datos automáticamente"}
        </p>
        {error && (
          <div
            className="bg-[#fce9e7] border border-[#f5c6c2] rounded-[10px] px-3 py-2 mb-3 text-[12px] text-[#c0392b]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Error: {error}
          </div>
        )}
        {result && (
          <div
            className="bg-[#e8f2f7] border border-[#b6d4e7] rounded-[10px] px-3 py-2 mb-3 text-[12px] text-[#3276a8]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <strong>OCR detectado:</strong> {result.parsed.folio || "Sin folio"}{" "}
            · Total: {result.parsed.total || "—"} · RFC: {"—"}
            <button onClick={clear} className="ml-2 underline text-[11px]">
              Limpiar
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-3 border-2 border-dashed border-[#dce4e7] rounded-[14px] px-5 py-4 w-full hover:border-[#3276a8] hover:bg-[#f4f8fc] transition-colors opacity-75"
        >
          <div className="bg-[#edf4fa] rounded-[10px] p-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3276a8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="text-left">
            <p
              className="font-bold text-[#172126] text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              {loading ? "Procesando OCR..." : "Seleccionar factura (JPG/PNG)"}
            </p>
            <p
              className="text-[#607078] text-[11px]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Factura o remisión · Imagen JPG/PNG
            </p>
          </div>
        </button>
      </SectionCard>

      {/* Header fields */}
      <SectionCard>
        <p
          className="font-bold text-[#172126] text-[16px] mb-4"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          Datos del embarque
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>No. Folio / Factura</Label>
            <Input
              value={embarque.folio}
              onChange={(v) => updateField("folio", v)}
              placeholder="FAC-2024-0001"
            />
          </div>
          <div>
            <Label>Cliente</Label>
            <Input
              value={embarque.cliente}
              onChange={(v) => updateField("cliente", v)}
              placeholder="Nombre del cliente"
            />
          </div>
          <div>
            <Label>Bodega de salida</Label>
            <select
              value={embarque.bodega}
              onChange={(e) => updateField("bodega", e.target.value)}
              className="border border-[#dce4e7] rounded-[10px] px-3 py-2 text-[14px] text-[#172126] w-full outline-none focus:border-[#3276a8] bg-white"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              <option>Tehuacan-1</option>
              <option>Tehuacan-2</option>
            </select>
          </div>
          <div>
            <Label>Fecha programada (opcional)</Label>
            <Input
              value={embarque.fechaProgramada ?? ""}
              onChange={(v) => updateField("fechaProgramada", v)}
              type="date"
            />
          </div>
        </div>
      </SectionCard>

      {/* Products */}
      <SectionCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <p
            className="font-bold text-[#172126] text-[16px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            Productos
          </p>
          <Btn variant="secondary" small onClick={addProducto}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar producto
          </Btn>
        </div>

        <div className="flex flex-col gap-4">
          {embarque.productos.map((p, idx) => {
            const total = calcTotal(p)
            const tarimasAuto = calcTarimasAuto(p, catalogoConversiones)
            return (
              <div
                key={p.id}
                className="border border-[#dce4e7] rounded-[14px] p-4 flex flex-col gap-3 relative"
              >
                <div className="flex items-center justify-between mb-1">
                  <p
                    className="font-bold text-[#172126] text-[13px]"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Producto {idx + 1}
                  </p>
                  {idx > 0 && (
                    <button
                      onClick={() => removeProducto(idx)}
                      className="text-[#c0392b] hover:opacity-70 transition-opacity"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <Label>Nombre del producto</Label>
                    <ProductoAutocomplete
                      value={p.nombre}
                      catalogo={catalogoProductos}
                      onChange={(nombre, cat) => {
                        const conversion = catalogoConversiones.find(
                          (item) =>
                            item.producto.trim().toLocaleLowerCase() ===
                            nombre.trim().toLocaleLowerCase(),
                        )
                        const ps = embarque.productos.map((prod, i) => {
                          if (i !== idx) return prod
                          return {
                            ...prod,
                            ...(cat
                              ? { id: cat.id, productId: cat.id }
                              : { productId: undefined }),
                            nombre,
                            ...(cat
                              ? {
                                  unidad:
                                    cat.unidad === "kg" ? "piezas" : cat.unidad,
                                }
                              : {}),
                            ...(conversion
                              ? {
                                  piezasPorCaja: String(
                                    conversion.piezasPorCaja,
                                  ),
                                  cajasPorTarima: String(
                                    conversion.cajasPorTarima,
                                  ),
                                }
                              : {}),
                          }
                        })
                        onChange({ ...embarque, productos: ps })
                      }}
                    />
                  </div>
                  <div>
                    <Label>Cantidad</Label>
                    <Input
                      value={p.cantidad || ""}
                      onChange={(v) =>
                        updateProducto(idx, "cantidad", Number(v))
                      }
                      type="number"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Unidad</Label>
                    <select
                      value={p.unidad}
                      onChange={(e) =>
                        updateProducto(idx, "unidad", e.target.value)
                      }
                      className="border border-[#dce4e7] rounded-[10px] px-3 py-2 text-[14px] text-[#172126] w-full outline-none focus:border-[#3276a8] bg-white"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      <option value="cajas">Cajas</option>
                      <option value="piezas">Piezas</option>
                    </select>
                  </div>
                  <div>
                    <Label>Precio unitario ($)</Label>
                    <Input
                      value={p.precioUnitario || ""}
                      onChange={(v) =>
                        updateProducto(idx, "precioUnitario", Number(v))
                      }
                      type="number"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Precio total</Label>
                    <div
                      className="border border-[#dce4e7] rounded-[10px] px-3 py-2 text-[14px] font-bold text-[#16343f] bg-[#f8fafb]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      $
                      {total.toLocaleString("es-MX", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>

                {/* Conversion */}
                <div className="border-t border-dashed border-[#dce4e7] pt-3 mt-1">
                  <p
                    className="text-[11px] font-bold text-[#607078] uppercase mb-2"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Conversión a tarimas
                    <span className="ml-2 normal-case font-normal text-[#3276a8]">
                      {conversionSource === "loading"
                        ? "(consultando catálogo)"
                        : conversionSource === "firestore"
                          ? "(catálogo Firestore)"
                          : "(respaldo local; Firestore no disponible)"}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Piezas por caja</Label>
                      <Input
                        value={p.piezasPorCaja}
                        onChange={(v) =>
                          updateProducto(idx, "piezasPorCaja", v)
                        }
                        placeholder="24"
                      />
                    </div>
                    <div>
                      <Label>Cajas por tarima</Label>
                      <Input
                        value={p.cajasPorTarima}
                        onChange={(v) =>
                          updateProducto(idx, "cajasPorTarima", v)
                        }
                        placeholder="60"
                      />
                    </div>
                    <div>
                      <Label>Tarimas a enviar</Label>
                      {tarimasAuto !== null ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="border border-[#16343f] rounded-[10px] px-3 py-2 text-[14px] font-bold text-[#16343f] bg-[#e8f2f7] flex-1"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                          >
                            {tarimasAuto} tarima{tarimasAuto !== 1 ? "s" : ""}
                          </div>
                        </div>
                      ) : (
                        <Input
                          value={p.tarimasDeclaradas || ""}
                          onChange={(v) =>
                            updateProducto(idx, "tarimasDeclaradas", Number(v))
                          }
                          type="number"
                          placeholder="—"
                        />
                      )}
                    </div>
                  </div>
                  {tarimasAuto !== null &&
                    p.tarimasDeclaradas !== tarimasAuto && (
                      <button
                        className="text-[11px] text-[#3276a8] underline mt-1"
                        onClick={() =>
                          updateProducto(idx, "tarimasDeclaradas", tarimasAuto)
                        }
                        style={{ fontFamily: "'Inter', sans-serif" }}
                      >
                        Usar valor calculado ({tarimasAuto})
                      </button>
                    )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Grand total */}
        {embarque.productos.length > 0 && (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-5 pt-4 border-t border-[#dce4e7]">
            <div>
              <p
                className="text-[12px] text-[#607078]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Total de tarimas declaradas
              </p>
              <p
                className="text-[28px] font-black text-[#16343f]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900 }}
              >
                {totalTarimas(embarque.productos)}{" "}
                <span className="text-[16px] font-normal text-[#607078]">
                  tarimas
                </span>
              </p>
            </div>
            <div className="text-right md:text-right w-full md:w-auto">
              <p
                className="text-[12px] text-[#607078]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Importe total
              </p>
              <p
                className="text-[22px] font-bold text-[#16343f]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                $
                {embarque.productos
                  .reduce((s, p) => s + calcTotal(p), 0)
                  .toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="flex justify-end gap-3">
        <Btn
          variant="primary"
          onClick={() => {
            const withTarimas = {
              ...embarque,
              productos: embarque.productos.map((p) => {
                const auto = calcTarimasAuto(p, catalogoConversiones)
                return auto !== null && p.tarimasDeclaradas === 0
                  ? { ...p, tarimasDeclaradas: auto }
                  : p
              }),
            }
            onChange(withTarimas)
            onNext()
          }}
          disabled={!canContinue}
        >
          Continuar a carga de mercancía
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Btn>
      </div>
    </div>
  )
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function Paso2({
  embarque,
  onChange,
  onNext,
  useFirestore,
  fsServices,
}: {
  embarque: Embarque
  onChange: (e: Embarque) => void
  onNext: () => void
  useFirestore: boolean
  fsServices: any
}) {
  const [qrInput, setQrInput] = useState("")
  const [caducidadAlert, setCaducidadAlert] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCerrar, setShowCerrar] = useState(false)
  const [scanning, setScanning] = useState(false)

  const tarimasTotales = totalTarimas(embarque.productos)

  function findProductoByTarima(tarId: string): Producto | null {
    // In a real system this would cross-reference warehouse DB.
    // Simulate: assign to first product with remaining capacity.
    const scanned = embarque.tarimasEscaneadas
    for (const p of embarque.productos) {
      const used = scanned.filter((t) => t.productoNombre === p.nombre).length
      if (used < p.tarimasDeclaradas) return p
    }
    return null
  }

  async function checkCaducidades(producto: Producto) {
    // Alerts must come from the persisted lot catalog. In local-only mode there
    // is no authoritative source, so intentionally show no alert.
    if (!useFirestore || !fsServices?.lotesCaducidades) return

    try {
      const lots = await fsServices.lotesCaducidades.getByProduct(
        WAREHOUSE_IDS.NORTH,
        producto.id,
      )
      setCaducidadAlert(buildUpcomingExpiryAlert(lots))
    } catch (err) {
      // A scan should still succeed if the optional alert query is unavailable.
      console.warn("No se pudieron consultar caducidades para el producto", err)
    }
  }

  async function handleScan() {
    const id = qrInput.trim().toUpperCase()
    if (!id) return
    setError(null)
    setCaducidadAlert(null)
    setScanning(true)

    if (embarque.tarimasEscaneadas.find((t) => t.id === id)) {
      setError(`La tarima ${id} ya fue escaneada.`)
      setQrInput("")
      setScanning(false)
      return
    }

    if (embarque.tarimasEscaneadas.length >= tarimasTotales) {
      setError(
        "Ya se alcanzó el número de tarimas declaradas. No se pueden agregar más.",
      )
      setQrInput("")
      setScanning(false)
      return
    }

    const producto = findProductoByTarima(id)
    if (!producto) {
      setError("No hay capacidad declarada para más tarimas en este embarque.")
      setQrInput("")
      setScanning(false)
      return
    }

    // If using Firestore, use scanPallet method
    if (useFirestore && fsServices) {
      try {
        await fsServices.shipments.scanPallet(
          embarque.id,
          id,
          producto.id, // Use local product ID as Firestore productId
          "user",
          "op-" + Date.now(),
        )
        // Refresh will happen via updateActive, just update local state for immediate feedback
        const nueva: TarimaEscaneada = {
          id,
          productoNombre: producto.nombre,
          timestamp: new Date().toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }
        const updated = {
          ...embarque,
          tarimasEscaneadas: [...embarque.tarimasEscaneadas, nueva],
        }
        onChange(updated)
        await checkCaducidades(producto)
      } catch (err: any) {
        setError(err.message || "Error al escanear tarima")
      } finally {
        setScanning(false)
        setQrInput("")
      }
      return
    }

    // Local-only logic
    const nueva: TarimaEscaneada = {
      id,
      productoNombre: producto.nombre,
      timestamp: new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }
    const updated = {
      ...embarque,
      tarimasEscaneadas: [...embarque.tarimasEscaneadas, nueva],
    }
    onChange(updated)
    await checkCaducidades(producto)

    const total = updated.tarimasEscaneadas.length
    setShowCerrar(total >= tarimasTotales)
    setQrInput("")
    setScanning(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleScan()
  }

  // per-product progress
  const productoProgress = embarque.productos.map((p) => ({
    ...p,
    scanned: embarque.tarimasEscaneadas.filter(
      (t) => t.productoNombre === p.nombre,
    ).length,
  }))

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar paso={2} />

      {/* QR Scanner */}
      <SectionCard>
        <p
          className="font-bold text-[#172126] text-[18px] mb-1"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          Carga dinámica de mercancía
        </p>
        <p
          className="text-[#607078] text-[13px] mb-4"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          Escanea el código QR de cada tarima o ingresa el ID manualmente. Solo
          se aceptarán tarimas del embarque declarado.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#607078"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="5" y="5" width="3" height="3" fill="#607078" />
              <rect x="16" y="5" width="3" height="3" fill="#607078" />
              <rect x="16" y="16" width="3" height="3" fill="#607078" />
              <rect x="5" y="16" width="3" height="3" fill="#607078" />
            </svg>
            <input
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escanear QR o ingresar ID de tarima…"
              autoFocus
              className="border border-[#dce4e7] rounded-[10px] pl-9 pr-3 py-[10px] text-[14px] text-[#172126] w-full outline-none focus:border-[#3276a8] transition-colors"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
          </div>
          <Btn onClick={handleScan} className="w-full sm:w-auto">
            Validar
          </Btn>
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-3 bg-[#fdecea] border border-[#f5c6c2] rounded-[10px] px-3 py-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c0392b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-[1px]"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p
              className="text-[12px] text-[#c0392b]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {error}
            </p>
          </div>
        )}

        {caducidadAlert && (
          <div className="flex items-start gap-2 mt-3 bg-[#fff8e6] border border-[#f2b84b] rounded-[10px] px-3 py-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#b7860b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-[1px]"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p
              className="text-[12px] text-[#7a5c00]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {caducidadAlert}
            </p>
          </div>
        )}
      </SectionCard>

      {/* Per-product progress */}
      <SectionCard>
        <p
          className="font-bold text-[#172126] text-[14px] mb-4"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
        >
          Avance por producto
        </p>
        <div className="flex flex-col gap-3">
          {productoProgress.map((p) => {
            const pct = p.tarimasDeclaradas
              ? Math.min(100, (p.scanned / p.tarimasDeclaradas) * 100)
              : 0
            return (
              <div key={p.id}>
                <div className="flex justify-between mb-1">
                  <p
                    className="text-[13px] text-[#172126]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {p.nombre}
                  </p>
                  <p
                    className="text-[12px] font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {p.scanned} / {p.tarimasDeclaradas} tarimas
                  </p>
                </div>
                <div className="bg-[#dce4e7] h-[6px] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 100 ? "#16845b" : "#f2b84b",
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#dce4e7]">
          <p
            className="text-[13px] text-[#607078]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Total escaneado:{" "}
            <strong className="text-[#172126]">
              {embarque.tarimasEscaneadas.length}
            </strong>{" "}
            / {tarimasTotales} tarimas
          </p>
          {showCerrar && (
            <Btn onClick={onNext}>
              Cerrar carga del embarque
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Btn>
          )}
        </div>
      </SectionCard>

      {/* Scanned log */}
      {embarque.tarimasEscaneadas.length > 0 && (
        <SectionCard>
          <p
            className="font-bold text-[#172126] text-[14px] mb-3"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            Tarimas registradas
          </p>
          <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
            {[...embarque.tarimasEscaneadas].reverse().map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-[#f0f4f5] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-[#e2f5ec] size-7 rounded-full flex items-center justify-center shrink-0">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#16845b"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <p
                      className="text-[13px] font-bold text-[#172126]"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      {t.id}
                    </p>
                    <p
                      className="text-[11px] text-[#607078]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      {t.productoNombre}
                    </p>
                  </div>
                </div>
                <p
                  className="text-[11px] text-[#607078]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {t.timestamp}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {!showCerrar && embarque.tarimasEscaneadas.length > 0 && (
        <div className="flex justify-end">
          <Btn variant="secondary" onClick={onNext}>
            Cerrar igualmente
          </Btn>
        </div>
      )}
    </div>
  )
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

function PhotoSlot({
  label,
  icon,
  value,
  onChange,
}: {
  label: string
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const borderColor = value ? "#16845b" : "#dce4e7"
  const bgColor = value ? "#e2f5ec" : "transparent"
  const iconBgColor = value ? "#16845b" : "#edf1f3"
  const textColor = value ? "#16845b" : "#607078"
  const hoverBorder = value ? borderColor : "#3276a8"
  const hoverBg = value ? bgColor : "#f4f8fc"

  return (
    <div className="w-full">
      <Label>{label}</Label>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChange(URL.createObjectURL(f))
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="w-full rounded-[12px] border-2 transition-colors flex items-center gap-3 px-4 py-3"
        style={{ borderColor, backgroundColor: bgColor }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = hoverBorder
          e.currentTarget.style.backgroundColor = hoverBg
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = borderColor
          e.currentTarget.style.backgroundColor = bgColor
        }}
      >
        <div
          className="rounded-[8px] p-1.5 shrink-0"
          style={{ backgroundColor: iconBgColor }}
        >
          {value ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            icon
          )}
        </div>
        <p
          className="text-[13px] font-semibold truncate"
          style={{ fontFamily: "'Inter', sans-serif", color: textColor }}
        >
          {value ? "Foto capturada" : "Tomar foto"}
        </p>
        {value && (
          <img
            src={value}
            alt=""
            className="ml-auto size-10 rounded-[6px] object-cover"
          />
        )}
      </button>
    </div>
  )
}

const camIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#607078"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

function Paso3({
  embarque,
  onChange,
  onFinish,
  proveedores,
}: {
  embarque: Embarque
  onChange: (e: Embarque) => void
  onFinish: () => void
  proveedores: Proveedor[]
}) {
  const ev = embarque.evidencia

  function set(field: keyof Evidencia, val: string) {
    onChange({ ...embarque, evidencia: { ...ev, [field]: val } })
  }

  const canFinish =
    ev.fotoCaja &&
    ev.transportista &&
    ev.fotoSelloInterno &&
    ev.fotoSelloCaja &&
    ev.fotoDocumento

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar paso={3} />

      <SectionCard>
        <p
          className="font-bold text-[#172126] text-[18px] mb-1"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          Evidencia del embarque
        </p>
        <p
          className="text-[#607078] text-[13px] mb-4"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          Capture la evidencia requerida para cerrar el embarque correctamente.
        </p>

        <div className="flex flex-col gap-4">
          {/* Fotos embarque cargado */}
          <div className="w-full">
            <Label>Fotos del embarque cargado en la caja del tráiler</Label>
            <div className="flex gap-2 flex-wrap">
              {(ev.fotosEmbarque ?? []).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="size-16 rounded-[8px] object-cover border border-[#dce4e7]"
                />
              ))}
              <label className="size-16 rounded-[8px] border-2 border-dashed border-[#dce4e7] flex items-center justify-center cursor-pointer hover:border-[#3276a8] hover:bg-[#f4f8fc] transition-colors shrink-0">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#607078"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      const prev = ev.fotosEmbarque ?? []
                      onChange({
                        ...embarque,
                        evidencia: {
                          ...ev,
                          fotosEmbarque: [...prev, URL.createObjectURL(f)],
                        },
                      })
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <PhotoSlot
            label="Foto del número de caja del tráiler"
            icon={camIcon}
            value={ev.fotoCaja ?? ""}
            onChange={(v) => set("fotoCaja", v)}
          />

          <div className="w-full">
            <Label>Transportista</Label>
            <TransportistaAutocomplete
              value={ev.transportista ?? ""}
              onChange={(v) => set("transportista", v)}
              proveedores={proveedores}
            />
          </div>

          <PhotoSlot
            label="Foto del sello interno"
            icon={camIcon}
            value={ev.fotoSelloInterno ?? ""}
            onChange={(v) => set("fotoSelloInterno", v)}
          />
          <PhotoSlot
            label="Foto del sello puesto en la caja del tráiler"
            icon={camIcon}
            value={ev.fotoSelloCaja ?? ""}
            onChange={(v) => set("fotoSelloCaja", v)}
          />
          <PhotoSlot
            label="Foto del documento firmado por el operador"
            icon={camIcon}
            value={ev.fotoDocumento ?? ""}
            onChange={(v) => set("fotoDocumento", v)}
          />
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <Btn variant="primary" onClick={onFinish} disabled={!canFinish}>
          Cerrar embarque
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Btn>
      </div>
    </div>
  )
}

// ─── Historial card ────────────────────────────────────────────────────────────

function EmbarqueCard({
  em,
  onVer,
  onContinuar,
  onEliminar,
  onImprimir,
  onEscanear,
}: {
  em: Embarque
  onVer: () => void
  onContinuar?: () => void
  onEliminar: () => void
  onImprimir?: () => void
  onEscanear?: () => void
}) {
  const c = statusColor(em.status)
  const total = em.productos.reduce((s, p) => s + calcTotal(p), 0)
  return (
    <div className="bg-white rounded-[18px] shadow-[0px_4px_12px_rgba(22,52,63,0.07)] p-4 md:p-5 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p
              className="font-black text-[#172126] text-[15px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900 }}
            >
              {em.folio}
            </p>
            <Pill label={statusLabel(em.status)} s={em.status} />
          </div>
          <p
            className="text-[13px] text-[#607078]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {em.cliente}
          </p>
        </div>
        <p
          className="text-[13px] font-bold text-[#3276a8]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
        >
          ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
        </p>
      </div>

      <div
        className="flex flex-wrap gap-4 text-[12px] text-[#607078]"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <span>
          📦 {em.productos.length} producto
          {em.productos.length !== 1 ? "s" : ""}
        </span>
        <span>🏭 {em.bodega}</span>
        <span>📅 {em.fechaCreacion}</span>
        {em.fechaProgramada && <span>🗓 Programado: {em.fechaProgramada}</span>}
      </div>

      {em.status === "en-proceso" && (
        <div className="bg-[#f4f7f8] rounded-[10px] px-3 py-2">
          <div className="flex justify-between mb-1">
            <p
              className="text-[11px] text-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Carga en proceso
            </p>
            <p
              className="text-[11px] font-bold text-[#172126]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {em.tarimasEscaneadas.length} / {totalTarimas(em.productos)}{" "}
              tarimas
            </p>
          </div>
          <div className="bg-[#dce4e7] h-[5px] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#f2b84b] rounded-full"
              style={{
                width: `${
                  totalTarimas(em.productos)
                    ? Math.min(
                        100,
                        (em.tarimasEscaneadas.length /
                          totalTarimas(em.productos)) *
                          100,
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Btn variant="secondary" small onClick={onVer}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Ver
        </Btn>
        {em.status === "en-proceso" && onContinuar && (
          <Btn variant="primary" small onClick={onContinuar}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Continuar
          </Btn>
        )}
        {onImprimir && (
          <Btn variant="secondary" small onClick={onImprimir}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5" />
              <path d="M18 18h2a2 2 0 0 0 2-2v-5" />
              <line x1="6" y1="14" x2="18" y2="14" />
            </svg>
            Imprimir
          </Btn>
        )}
        {onEscanear && (
          <Btn variant="primary" small onClick={onEscanear}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="12" y1="7" x2="12" y2="17" />
            </svg>
            Escanear
          </Btn>
        )}
        <Btn variant="danger" small onClick={onEliminar}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
          </svg>
          Eliminar
        </Btn>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

type View = "historial" | "crear" | "ver"

export default function Embarques({
  catalogoProductos,
  catalogoProveedores,
  catalogoConversiones,
  onReducirInventario,
}: {
  catalogoProductos: CatalogoProducto[]
  catalogoProveedores: Proveedor[]
  catalogoConversiones: EmbarqueConversion[]
  onReducirInventario?: (
    almacenId: string,
    productos: { productoId: string cajas: number }[],
  ) => void
}) {
  const { canQuery } = useAuthorization()
  // Feature flag
  const useFirestore =
    isFeatureEnabled("USE_FIRESTORE_EMBARQUES") && !!db && canQuery

  // Firestore services
  const [fsServices] = useState(() =>
    db ? createFirestoreServices(db, ORG_ID) : null,
  )

  const [effectiveConversiones, setEffectiveConversiones] =
    useState<EmbarqueConversion[]>(catalogoConversiones)
  const [conversionSource, setConversionSource] =
    useState<"loading" | "firestore" | "fallback">(db ? "loading" : "fallback")

  // Local state (fallback)
  const [embarques, setEmbarques] = useState<Embarque[]>(EMBARQUES_INICIALES)
  const [view, setView] = useState<View>("historial")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<EmbarqueStatus | "todos">(
    "todos",
  )
  const [loadingFs, setLoadingFs] = useState(false)
  const [errorFs, setErrorFs] = useState<string | null>(null)
  // Imprimir etiquetas modal
  const [imprimirEmbarqueId, setImprimirEmbarqueId] = useState<string | null>(
    null,
  )
  // Scanner tarimas modal
  const [scannerEmbarqueId, setScannerEmbarqueId] = useState<string | null>(
    null,
  )

  const activeEmbarque = embarques.find((e) => e.id === activeId) ?? null

  // Conversiones de Firestore son la fuente de verdad. El catálogo recibido
  // por props se conserva como respaldo explícito si Firestore no responde.
  useEffect(() => {
    if (!canQuery || !fsServices) {
      setConversionSource("fallback")
      return
    }

    let active = true
    fsServices.conversions
      .getAll({ orderBy: ["productName", "asc"], limit: 100 })
      .then(({ data }) => {
        if (!active) return
        const merged = mergeCanonicalConversions(catalogoConversiones, data)
        setEffectiveConversiones(merged)
        setConversionSource(data.length > 0 ? "firestore" : "fallback")
      })
      .catch((error: unknown) => {
        if (!active) return
        if (isPermissionDenied(error)) {
          setConversionSource("fallback")
          console.warn("No autorizado para leer el catálogo de conversiones")
          return
        }
        console.warn("No se pudo cargar el catálogo de conversiones:", error)
        setEffectiveConversiones(catalogoConversiones)
        setConversionSource("fallback")
      })

    return () => {
      active = false
    }
  }, [canQuery, fsServices, catalogoConversiones])

  // Load Firestore data when feature flag is enabled
  useEffect(() => {
    if (!useFirestore || !fsServices) return

    setLoadingFs(true)
    setErrorFs(null)

    fsServices.shipments
      .getByWarehouse(WAREHOUSE_IDS.NORTH)
      .then((shipments: any[]) => {
        const converted = shipments.map((s: any) =>
          fromFirestoreShipment(s, catalogoProductos),
        )
        setEmbarques(converted)
        setLoadingFs(false)
      })
      .catch((err: Error) => {
        console.error("Error loading shipments:", err)
        setErrorFs(
          isPermissionDenied(err)
            ? "No tenés permisos para consultar los embarques de este almacén."
            : err.message,
        )
        setLoadingFs(false)
      })
  }, [useFirestore, fsServices, catalogoProductos])

  function createNew(programado = false) {
    const id = `EMB-${String(embarques.length + 1).padStart(3, "0")}`
    const nuevo: Embarque = {
      id,
      folio: "",
      cliente: "",
      bodega: "Tehuacan-1",
      productos: [newProducto()],
      tarimasEscaneadas: [],
      evidencia: {},
      status: programado ? "programado" : "en-proceso",
      paso: 1,
      fechaCreacion: new Date().toISOString().slice(0, 10),
    }

    // If using Firestore, create there too
    if (useFirestore && fsServices) {
      const lines = toShipmentLines(nuevo.productos)
      fsServices.shipments
        .createShipment(
          {
            warehouseId: WAREHOUSE_IDS.NORTH,
            lines,
            folio: "",
            cliente: "",
            bodega: "Tehuacan-1",
            tarimasEscaneadas: [],
            evidencia: {},
            paso: 1,
            fechaCreacion: nuevo.fechaCreacion,
          } as any,
          "user",
          "op-" + Date.now(),
        )
        .then((created: any) => {
          // Update local state with Firestore ID
          // Keep the editor selection aligned with the persisted document.
          // Otherwise activeEmbarque becomes null as soon as the temporary
          // client ID is replaced, leaving the create view blank.
          setActiveId(created.id)
          setEmbarques((prev) =>
            prev.map((e) => (e.id === id ? { ...e, id: created.id } : e)),
          )
        })
        .catch((err: Error) => {
          console.error("Error creating shipment:", err)
          setErrorFs(err.message)
        })
    }

    setEmbarques((prev) => [nuevo, ...prev])
    setActiveId(id)
    setView("crear")
  }

  function updateActive(updated: Embarque) {
    setEmbarques((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))

    // Dual-write to Firestore
    if (useFirestore && fsServices) {
      const lines = toShipmentLines(updated.productos)
      // Preserve existing scanned pallets
      const existing = embarques.find((e) => e.id === updated.id)
      if (existing) {
        lines.forEach((line, i) => {
          const existingLine = existing.productos[i]
          if (existingLine) {
            const scanned = existing.tarimasEscaneadas.filter(
              (t) => t.productoNombre === existingLine.nombre,
            )
            line.palletsScanned = scanned.map((t) => t.id)
          }
        })
      }

      fsServices.shipments
        .update(
          updated.id,
          {
            lines,
            folio: updated.folio,
            cliente: updated.cliente,
            bodega: updated.bodega,
            tarimasEscaneadas: updated.tarimasEscaneadas,
            evidencia: updated.evidencia,
            paso: updated.paso,
            fechaProgramada: updated.fechaProgramada,
          } as any,
          "user",
          "op-" + Date.now(),
        )
        .catch((err: Error) => {
          console.error("Error updating shipment:", err)
          setErrorFs(err.message)
        })
    }
  }

  function goNextPaso() {
    if (!activeEmbarque) return
    const nextPaso = (activeEmbarque.paso + 1) as Paso
    const updated = { ...activeEmbarque, paso: nextPaso }
    updateActive(updated)
  }

  function finishEmbarque() {
    if (!activeEmbarque) return

    // If using Firestore, complete the shipment with atomic transaction
    if (useFirestore && fsServices) {
      httpsCallable(
        getFunctions(),
        "confirm_shipment",
      )({
        shipmentId: activeEmbarque.id,
        operationId: `web-${activeEmbarque.id}-${Date.now()}`,
      })
        .then((completed: any) => {
          // Update local state
          const updated = {
            ...activeEmbarque,
            status: "completado" as EmbarqueStatus,
          }
          updateActive(updated)
          setView("historial")
          setActiveId(null)
        })
        .catch((err: Error) => {
          console.error("Error completing shipment:", err)
          setErrorFs(err.message)
        })
      return
    }

    // Local-only logic (fallback)
    // Reducir inventario del almacén de origen al completar embarque
    if (onReducirInventario && activeEmbarque.bodega) {
      // Buscar el almacén por nombre para obtener su ID
      // En producción esto vendría de un catálogo real
      const almacenId =
        activeEmbarque.bodega === "Tehuacan-1"
          ? WAREHOUSE_IDS.NORTH
          : WAREHOUSE_IDS.SOUTH

      const productosParaInventario = activeEmbarque.productos
        .map((p) => ({
          productoId: `PRD-${String(catalogoProductos.findIndex((cp) => cp.nombre === p.nombre) + 1).padStart(3, "0")}`,
          cajas: p.cantidad,
        }))
        .filter((p) => p.cajas > 0)

      if (productosParaInventario.length > 0) {
        onReducirInventario(almacenId, productosParaInventario)
      }
    }

    const updated = {
      ...activeEmbarque,
      status: "completado" as EmbarqueStatus,
    }
    updateActive(updated)
    setView("historial")
    setActiveId(null)
  }

  function eliminar(id: string) {
    setEmbarques((prev) => prev.filter((e) => e.id !== id))

    // Also delete from Firestore
    if (useFirestore && fsServices) {
      fsServices.shipments
        .delete(id, "user", "op-" + Date.now())
        .catch((err: Error) => {
          console.error("Error deleting shipment:", err)
          setErrorFs(err.message)
        })
    }
  }

  function goBack() {
    if (activeEmbarque && activeEmbarque.status === "en-proceso") {
      const updated = { ...activeEmbarque }
      updateActive(updated)
    }
    setView("historial")
    setActiveId(null)
  }

  // ─── Planificar + Imprimir ─────────────────────────────────────────────────
  const [planificando, setPlanificando] = useState(false)

  async function handlePlanificarEImprimir() {
    if (!activeEmbarque) return

    setPlanificando(true)
    try {
      // Convertir embarque local a DocumentoCargado
      const documento: DocumentoCargado = {
        id: activeEmbarque.folio || `PED-${activeEmbarque.id}`,
        proveedorId: activeEmbarque.cliente,
        proveedorNombre: activeEmbarque.cliente,
        fecha: new Date(activeEmbarque.fechaCreacion),
        almacenDestinoId: WAREHOUSE_IDS.NORTH,
        items: activeEmbarque.productos.map((p) => ({
          productoId: p.id,
          productoNombre: p.nombre,
          cantidad: p.cantidad,
          unidad: p.unidad,
        })),
      }

      const embarque = await planificarEmbarque(documento, getStockDisponible)

      if (embarque) {
        // Abrir modal de impresión
        setImprimirEmbarqueId(embarque.id)

        // Actualizar lista local con el nuevo embarque planificado
        setEmbarques((prev) => [embarque as any, ...prev])
      }
    } catch (err) {
      console.error("Error planificando:", err)
      alert(err instanceof Error ? err.message : "Error al planificar embarque")
    } finally {
      setPlanificando(false)
    }
  }

  function abrirImprimir(embarqueId: string) {
    setImprimirEmbarqueId(embarqueId)
  }

  function cerrarImprimir() {
    setImprimirEmbarqueId(null)
  }

  function abrirScanner(embarqueId: string) {
    setScannerEmbarqueId(embarqueId)
  }

  function cerrarScanner() {
    setScannerEmbarqueId(null)
  }

  function handleTarimaEscaneada(tarima: any) {
    console.log("Tarima escaneada:", tarima)
    // Actualizar estado local si es necesario
  }

  function handleEmbarqueCompletado() {
    console.log("Embarque completado")
    cerrarScanner()
    setView("historial")
    setActiveId(null)
  }

  const filtered =
    filterStatus === "todos"
      ? embarques
      : embarques.filter((e) => e.status === filterStatus)
  const counts = {
    todos: embarques.length,
    completado: embarques.filter((e) => e.status === "completado").length,
    "en-proceso": embarques.filter((e) => e.status === "en-proceso").length,
    programado: embarques.filter((e) => e.status === "programado").length,
  }

  // ── Historial ──
  if (view === "historial") {
    return (
      <div className="flex flex-col gap-5 p-7">
        {/* Header: acciones primarias arriba, filtros secundarios abajo */}
        <div className="flex flex-col gap-4 w-full">
          {/* Acciones principales PRIMERO: Nuevo embarque y Programar embarque */}
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Btn
              onClick={() => createNew(false)}
              className="w-full sm:w-auto flex-1 sm:flex-none"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo embarque
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => createNew(true)}
              className="w-full sm:w-auto flex-1 sm:flex-none"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Programar embarque
            </Btn>
            {/* Nuevo: Planificar + Imprimir etiquetas */}
            <Btn
              variant="secondary"
              onClick={handlePlanificarEImprimir}
              disabled={planificando || !activeEmbarque}
              className="w-full sm:w-auto flex-1 sm:flex-none"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5" />
                <path d="M18 18h2a2 2 0 0 0 2-2v-5" />
                <line x1="6" y1="14" x2="18" y2="14" />
              </svg>
              {planificando ? "Planificando..." : "Planificar + Imprimir"}
            </Btn>
          </div>

          {/* Filtros de visualización — chips secundarios debajo */}
          <div className="flex flex-wrap items-center gap-2 w-full">
            {(["todos", "en-proceso", "programado", "completado"] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className="px-3 py-[6px] rounded-[8px] text-[11px] font-bold transition-colors whitespace-nowrap shrink-0"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    background: filterStatus === f ? "#16343f" : "white",
                    color: filterStatus === f ? "white" : "#607078",
                    border: "1px solid",
                    borderColor: filterStatus === f ? "#16343f" : "#dce4e7",
                  }}
                >
                  {f === "todos"
                    ? "Todos"
                    : f === "en-proceso"
                      ? "En proceso"
                      : f === "programado"
                        ? "Programados"
                        : "Completados"}
                  <span className="ml-1 opacity-60">{counts[f]}</span>
                </button>
              ),
            )}
          </div>
        </div>

        {/* Count badge with Firestore indicator */}
        <div className="bg-[#16343f] text-white rounded-[10px] px-4 py-[6px] flex items-center gap-2 self-start">
          <span
            className="text-[13px] font-bold"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {filtered.length}
          </span>
          <span
            className="text-[13px] font-medium"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            embarques
          </span>
          {useFirestore && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-medium">
              Firestore
            </span>
          )}
        </div>

        {/* Stats row */}
        {useFirestore && loadingFs && (
          <div
            className="flex items-center gap-2 text-[13px] text-[#3276a8]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            Cargando embarques desde Firestore...
          </div>
        )}
        {useFirestore && errorFs && (
          <div
            className="flex items-center gap-2 text-[12px] text-[#c0392b] bg-[#fdecea] border border-[#f5c6c2] rounded-[10px] px-3 py-2"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Error: {errorFs}
            <button
              onClick={() => {
                setLoadingFs(true)
                setErrorFs(null)
                fsServices?.shipments
                  .getByWarehouse(WAREHOUSE_IDS.NORTH)
                  .then((s: any[]) => {
                    setEmbarques(
                      s.map((sh: any) =>
                        fromFirestoreShipment(sh, catalogoProductos),
                      ),
                    )
                    setLoadingFs(false)
                  })
                  .catch((e: Error) => {
                    setErrorFs(e.message)
                    setLoadingFs(false)
                  })
              }}
              className="ml-2 underline text-[11px]"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total embarques", value: counts.todos, color: "#16343f" },
            {
              label: "En proceso",
              value: counts["en-proceso"],
              color: "#856404",
            },
            {
              label: "Programados",
              value: counts.programado,
              color: "#3276a8",
            },
            {
              label: "Completados",
              value: counts.completado,
              color: "#16845b",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-[16px] shadow-[0px_4px_12px_rgba(22,52,63,0.07)] px-5 py-4"
            >
              <p
                className="text-[11px] font-bold uppercase text-[#607078] mb-1"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {s.label}
              </p>
              <p
                className="text-[32px] font-black"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 900,
                  color: s.color,
                }}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-[20px] p-12 flex flex-col items-center gap-3 shadow-[0px_4px_12px_rgba(22,52,63,0.07)]">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dce4e7"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1" y="3" width="15" height="13" rx="1" />
              <path d="M16 8h4l3 4v4h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            <p
              className="text-[15px] font-bold text-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              No hay embarques en esta categoría
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((em) => (
              <EmbarqueCard
                key={em.id}
                em={em}
                onVer={() => {
                  setActiveId(em.id)
                  setView("ver")
                }}
                onContinuar={
                  em.status === "en-proceso"
                    ? () => {
                        setActiveId(em.id)
                        setView("crear")
                      }
                    : undefined
                }
                onEliminar={() => eliminar(em.id)}
                onImprimir={
                  em.status === "programado" || em.status === "en-proceso"
                    ? () => abrirImprimir(em.id)
                    : undefined
                }
                onEscanear={
                  em.status === "programado" || em.status === "en-proceso"
                    ? () => abrirScanner(em.id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Ver detalle (solo lectura) ──
  if (view === "ver" && activeEmbarque) {
    const total = activeEmbarque.productos.reduce((s, p) => s + calcTotal(p), 0)
    return (
      <div className="flex flex-col gap-5 p-7">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={goBack}
            className="flex items-center justify-center size-9 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors"
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
          <div>
            <p
              className="font-black text-[#172126] text-[22px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900 }}
            >
              {activeEmbarque.folio}
            </p>
            <p
              className="text-[13px] text-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {activeEmbarque.cliente} · {activeEmbarque.bodega}
            </p>
          </div>
          <Pill
            label={statusLabel(activeEmbarque.status)}
            s={activeEmbarque.status}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SectionCard>
            <p
              className="font-bold text-[#172126] text-[14px] mb-3"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Productos
            </p>
            {activeEmbarque.productos.map((p) => (
              <div
                key={p.id}
                className="flex justify-between py-2 border-b border-[#f0f4f5] last:border-0"
              >
                <div>
                  <p
                    className="text-[13px] text-[#172126]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {p.nombre}
                  </p>
                  <p
                    className="text-[11px] text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {p.cantidad} {p.unidad} · {p.tarimasDeclaradas} tarimas
                  </p>
                </div>
                <p
                  className="text-[13px] font-bold text-[#16343f]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  $
                  {calcTotal(p).toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            ))}
            <div className="flex justify-between pt-3 border-t border-[#dce4e7] mt-2">
              <p
                className="font-bold text-[#172126] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Total
              </p>
              <p
                className="font-black text-[#16343f] text-[15px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900 }}
              >
                ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </SectionCard>

          <SectionCard>
            <p
              className="font-bold text-[#172126] text-[14px] mb-3"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Tarimas escaneadas ({activeEmbarque.tarimasEscaneadas.length})
            </p>
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
              {activeEmbarque.tarimasEscaneadas.length === 0 ? (
                <p
                  className="text-[13px] text-[#607078]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  Sin tarimas escaneadas.
                </p>
              ) : (
                activeEmbarque.tarimasEscaneadas.map((t, i) => (
                  <div
                    key={i}
                    className="flex justify-between py-1 border-b border-[#f0f4f5] last:border-0"
                  >
                    <p
                      className="text-[12px] font-bold text-[#172126]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      {t.id}
                    </p>
                    <p
                      className="text-[11px] text-[#607078]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      {t.productoNombre}
                    </p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        {activeEmbarque.evidencia.transportista && (
          <SectionCard>
            <p
              className="font-bold text-[#172126] text-[14px] mb-2"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Evidencia
            </p>
            <p
              className="text-[13px] text-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Transportista:{" "}
              <strong className="text-[#172126]">
                {activeEmbarque.evidencia.transportista}
              </strong>
            </p>
          </SectionCard>
        )}
      </div>
    )
  }

  // ── Crear / editar ──
  if (!activeEmbarque) return null

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Sub-header */}
      <div className="bg-white border-b border-[#dce4e7] px-7 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={goBack}
          className="flex items-center justify-center size-8 rounded-[8px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors"
        >
          <svg
            width="13"
            height="13"
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
        <p
          className="text-[13px] font-bold text-[#607078]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {activeEmbarque.id} ·{" "}
          {activeEmbarque.status === "programado"
            ? "Embarque programado"
            : "Embarque en proceso"}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-7">
        {activeEmbarque.paso === 1 && (
          <Paso1
            embarque={activeEmbarque}
            onChange={updateActive}
            catalogoProductos={catalogoProductos}
            catalogoConversiones={effectiveConversiones}
            conversionSource={conversionSource}
            onNext={() => {
              const withTarimas = {
                ...activeEmbarque,
                productos: (
                  normalizeShipmentProducts(
                    activeEmbarque.productos,
                    catalogoProductos,
                  ) ?? activeEmbarque.productos
                ).map((p) => {
                  const auto = calcTarimasAuto(p, effectiveConversiones)
                  return auto !== null && p.tarimasDeclaradas === 0
                    ? { ...p, tarimasDeclaradas: auto }
                    : p
                }),
              }
              updateActive(withTarimas)
              goNextPaso()
            }}
          />
        )}
        {activeEmbarque.paso === 2 && (
          <Paso2
            embarque={activeEmbarque}
            onChange={updateActive}
            onNext={goNextPaso}
            useFirestore={useFirestore}
            fsServices={fsServices}
          />
        )}
        {activeEmbarque.paso === 3 && (
          <Paso3
            embarque={activeEmbarque}
            onChange={updateActive}
            onFinish={finishEmbarque}
            proveedores={catalogoProveedores}
          />
        )}
      </div>
    </div>
  )

  // ─── Modal Imprimir Etiquetas ──────────────────────────────────────────────
  if (imprimirEmbarqueId) {
    if (!activeEmbarque) return null
    return (
      <>
        <div className="flex flex-col gap-0 h-full">
          {/* Sub-header */}
          <div className="bg-white border-b border-[#dce4e7] px-7 py-3 flex items-center gap-3 shrink-0">
            <button
              onClick={goBack}
              className="flex items-center justify-center size-8 rounded-[8px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors"
            >
              <svg
                width="13"
                height="13"
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
            <p
              className="text-[13px] font-bold text-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {activeEmbarque!.id} ·{" "}
              {activeEmbarque!.status === "programado"
                ? "Embarque programado"
                : "Embarque en proceso"}
            </p>
          </div>

          <div className="flex-1 overflow-auto p-7">
            {activeEmbarque!.paso === 1 && (
              <Paso1
                embarque={activeEmbarque!}
                onChange={updateActive}
                catalogoProductos={catalogoProductos}
                catalogoConversiones={effectiveConversiones}
                conversionSource={conversionSource}
                onNext={() => {
                  const withTarimas = {
                    ...activeEmbarque!,
                    productos: (
                      normalizeShipmentProducts(
                        activeEmbarque!.productos,
                        catalogoProductos,
                      ) ?? activeEmbarque!.productos
                    ).map((p) => {
                      const auto = calcTarimasAuto(p, effectiveConversiones)
                      return auto !== null && p.tarimasDeclaradas === 0
                        ? { ...p, tarimasDeclaradas: auto }
                        : p
                    }),
                  }
                  updateActive(withTarimas)
                  goNextPaso()
                }}
              />
            )}
            {activeEmbarque!.paso === 2 && (
              <Paso2
                embarque={activeEmbarque!}
                onChange={updateActive}
                onNext={goNextPaso}
                useFirestore={useFirestore}
                fsServices={fsServices}
              />
            )}
            {activeEmbarque!.paso === 3 && (
              <Paso3
                embarque={activeEmbarque!}
                onChange={updateActive}
                onFinish={finishEmbarque}
                proveedores={catalogoProveedores}
              />
            )}
          </div>
        </div>

        <ImprimirEtiquetas
          embarqueId={imprimirEmbarqueId!}
          onClose={cerrarImprimir}
          onPrintComplete={cerrarImprimir}
        />

        {scannerEmbarqueId && (
          <ScannerTarimas
            embarqueId={scannerEmbarqueId!}
            onClose={cerrarScanner}
            onTarimaEscaneada={handleTarimaEscaneada}
            onEmbarqueCompletado={handleEmbarqueCompletado}
          />
        )}
      </>
    )
  }
}
