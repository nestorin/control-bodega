import { useState, useEffect } from "react"
import { isFeatureEnabled } from "@/config/featureFlags"
import { createFirestoreServices } from "@/services/firestore"
import { db } from "@/lib/firebase"
import { useAuthorization, isPermissionDenied } from "@/hooks/useAuthorization"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import {
  CANONICAL_SUPPLIER_LOCAL,
  mergeSupplierCatalog,
  normalizeSupplierType,
} from "@/config/supplierCatalog"
import type {
  ProductDoc,
  SupplierDoc,
  WarehouseDoc,
  ConversionDoc,
} from "@/services/firestore/types"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Almacen {
  id: string
  nombre: string
  ubicacion: string
  responsable: string
  activo: boolean
  creadoEn: string
}

export interface Conversion {
  id: string
  producto: string
  piezasPorCaja: number
  cajasPorTarima: number
  pesoKgCaja: string
}

export interface Proveedor {
  id: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  tipo: "mercancia" | "logistica"
}

export interface Producto {
  id: string
  nombre: string
  sku: string
  categoria: string
  unidad: "cajas" | "piezas" | "kg"
  activo: boolean
  /** Codes printed by suppliers on invoices; normalized to uppercase. */
  codigosProveedor?: string[]
}

export { Select }

// ─── Seed data ────────────────────────────────────────────────────────────────

export const ALMACENES_INIT: Almacen[] = [
  {
    id: WAREHOUSE_IDS.NORTH,
    nombre: "Tehuacan-1",
    ubicacion: "Av. Industrial 450, Monterrey",
    responsable: "Mariana Ruiz",
    activo: true,
    creadoEn: "2024-01-15",
  },
  {
    id: WAREHOUSE_IDS.SOUTH,
    nombre: "Tehuacan-2",
    ubicacion: "Blvd. Sur 1200, Guadalajara",
    responsable: "Carlos Pérez",
    activo: false,
    creadoEn: "2024-06-01",
  },
]

export const CONVERSIONES_INIT: Conversion[] = [
  {
    id: "C-001",
    producto: "Coca Cola regular 235ml",
    piezasPorCaja: 24,
    cajasPorTarima: 60,
    pesoKgCaja: "5.4",
  },
  {
    id: "C-002",
    producto: "AGUA MINERAL 355 ML C/24 PZS S",
    piezasPorCaja: 24,
    cajasPorTarima: 60,
    pesoKgCaja: "8.9",
  },
  {
    id: "C-003",
    producto: "BEBIDA SABOR COLA 3L C/6 PZS S",
    piezasPorCaja: 6,
    cajasPorTarima: 39,
    pesoKgCaja: "18.5",
  },
  {
    id: "C-004",
    producto: "Lala Leche entera 1l c/12",
    piezasPorCaja: 12,
    cajasPorTarima: 56,
    pesoKgCaja: "12.0",
  },
  {
    id: "C-005",
    producto: "Lechera 375grs c/48",
    piezasPorCaja: 48,
    cajasPorTarima: 72,
    pesoKgCaja: "19.2",
  },
  {
    id: "C-006",
    producto: "Aceite 1lt",
    piezasPorCaja: 12,
    cajasPorTarima: 50,
    pesoKgCaja: "10.8",
  },
]

// Firestore is authoritative in production. Keep local fixtures only for the
// explicit mock-auth flow so nonexistent logistics providers are not shown.
export const PROVEEDORES_INIT: Proveedor[] =
  import.meta.env.VITE_USE_MOCK_AUTH === "true" ? CANONICAL_SUPPLIER_LOCAL : []

export const PRODUCTOS_INIT: Producto[] = [
  {
    id: "CB0301",
    nombre: "BEBIDA SABOR COLA 235ML C/24 PZS S",
    sku: "CB0301",
    categoria: "Bebidas",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "CB0302",
    nombre: "BEBIDA SABOR COLA 3L C/6 PZS S",
    sku: "CB0302",
    categoria: "Bebidas",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "CB0401",
    nombre: "AGUA MINERAL 355 ML C/24 PZS S",
    sku: "CB0401",
    categoria: "Bebidas",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "CL0101",
    nombre: "LECHE EVAPORADA 360 GRS C/48 PZS S",
    sku: "CL0101",
    categoria: "Lácteos",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "CL0201",
    nombre: "LECHE CONDENSADA 375 GRS C/48 PZS S",
    sku: "CL0201",
    categoria: "Lácteos",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "CL0301",
    nombre: "CREMA DE MESA 225 GRS C/24 PZS S",
    sku: "CL0301",
    categoria: "Lácteos",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "CM0001",
    nombre: "Mayonesa 12pz S",
    sku: "CM0001",
    categoria: "Abarrotes",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "NDE0101",
    nombre: "DETERGENTE LIQUIDO ACE 8.5 LTS 1 PZA S",
    sku: "NDE0101",
    categoria: "Limpieza",
    unidad: "piezas",
    activo: true,
  },
  {
    id: "NDE0105",
    nombre: "DETERGENTE LIQUIDO ACE 4.85 L C/2 PZS S",
    sku: "NDE0105",
    categoria: "Limpieza",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "NDE0108",
    nombre: "DETERGENTE LIQUIDO ACE 2.8 L C/4 PZS S",
    sku: "NDE0108",
    categoria: "Limpieza",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "NSU0201",
    nombre: "SUAVIZANTE SUAVITEL 8.5 LTS C/2 PZS S",
    sku: "NSU0201",
    categoria: "Limpieza",
    unidad: "cajas",
    activo: true,
  },
  /*
    The local catalog intentionally mirrors Firestore.  It is retained only
    as an offline fallback while the authoritative catalog is loading.
  */
  /*
  {
    id: "PRD-003",
    nombre: "BEBIDA SABOR COLA 3L C/6 PZS S",
    sku: "CB0302",
    categoria: "Bebidas",
    unidad: "cajas",
    activo: true,
    codigosProveedor: ["CB0302"],
  },
  {
    id: "PRD-004",
    nombre: "Lala Leche entera 1l c/12",
    sku: "LL-1L-12",
    categoria: "Lácteos",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "PRD-005",
    nombre: "Lechera 375grs c/48",
    sku: "LC-375-48",
    categoria: "Lácteos",
    unidad: "cajas",
    activo: true,
  },
  {
    id: "PRD-006",
    nombre: "Aceite 1lt",
    sku: "AC-1L",
    categoria: "Abarrotes",
    unidad: "cajas",
    activo: true,
  },
  */
]

// ─── Helpers / shared UI ──────────────────────────────────────────────────────

type Tab = "almacenes" | "conversiones" | "mercancias" | "logistica" | "productos"

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white rounded-[20px] shadow-[0px_4px_12px_rgba(22,52,63,0.07)] ${className}`}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-bold uppercase text-[#607078] mb-1"
      style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
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
}: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border border-[#dce4e7] rounded-[10px] px-3 py-[8px] text-[13px] text-[#172126] w-full outline-none focus:border-[#3276a8] transition-colors bg-white"
      style={{ fontFamily: "'Inter',sans-serif" }}
    />
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
  const sz = small ? "px-3 py-[5px] text-[11px]" : "px-4 py-[9px] text-[13px]"
  const styles: Record<string, string> = {
    primary: "bg-[#16343f] text-white hover:bg-[#1e4655]",
    secondary:
      "bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f4f7f8]",
    danger:
      "bg-[#fdecea] text-[#c0392b] border border-[#f5c6c2] hover:bg-[#fbd5d1]",
    ghost: "bg-transparent text-[#607078] hover:bg-[#f4f7f8]",
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[9px] font-bold flex items-center gap-2 transition-colors cursor-pointer ${sz} ${styles[variant]} ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${className}`}
      style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
    >
      {children}
    </button>
  )
}

function Badge({
  label,
  color,
  className = "",
}: {
  label: string
  color: string
  className?: string
}) {
  const map: Record<string, { bg: string text: string }> = {
    green: { bg: "#e2f5ec", text: "#16845b" },
    gray: { bg: "#f0f4f5", text: "#607078" },
    blue: { bg: "#e8eef6", text: "#3276a8" },
    amber: { bg: "#fff3cd", text: "#856404" },
  }
  const c = map[color] ?? map.gray
  return (
    <span
      className={`text-[11px] font-bold px-[9px] py-[3px] rounded-full ${className}`}
      style={{
        background: c.bg,
        color: c.text,
        fontFamily: "'Inter',sans-serif",
      }}
    >
      {label}
    </span>
  )
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  id,
  name,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string label: string }[]
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  "aria-label"?: string
}) {
  return (
    <select
      id={id}
      name={name}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white border border-[#dce4e7] h-11 md:min-h-12 px-3 md:px-4 rounded-lg w-full font-semibold text-[#172126] text-base md:text-lg outline-none focus:border-[#3276a8] transition-colors touch-target appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23607078%22%20stroke-width%3d%222%22%20stroke-linecap%3d%22round%22%20stroke-linejoin%3d%22round%22%3e%3cpolyline%20points%3d%226%209%2012%2015%2018%209%22%2f%3e%3c%2fsvg%3e')] bg-[right_12px_center] bg-no-repeat pr-10"
      style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600 }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function PlusIcon() {
  return (
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
  )
}

function TrashIcon() {
  return (
    <svg
      width="13"
      height="13"
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
  )
}

function EditIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22,52,63,0.35)" }}
    >
      <div className="bg-white rounded-[20px] shadow-[0px_20px_60px_rgba(22,52,63,0.25)] w-full max-w-[480px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 lg:px-6 py-4 border-b border-[#dce4e7] shrink-0">
          <p
            className="font-black text-[#172126] text-[16px] lg:text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            {title}
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-9 lg:size-8 rounded-[8px] hover:bg-[#f4f7f8] transition-colors text-[#607078] touch-target"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 lg:px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Almacenes tab ────────────────────────────────────────────────────────────

function TabAlmacenes({
  almacenes,
  setAlmacenes,
  onActivarAlmacen,
  onCreate,
  onUpdate,
  onDelete,
  firestoreReady,
}: {
  almacenes: Almacen[]
  setAlmacenes: React.Dispatch<React.SetStateAction<Almacen[]>>
  onActivarAlmacen: (id: string) => void
  onCreate: (form: {
    nombre: string
    ubicacion: string
    responsable: string
  }) => Promise<void>
  onUpdate: (
    editing: Almacen,
    form: { nombre: string ubicacion: string responsable: string },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
  firestoreReady: boolean
}) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Almacen | null>(null)
  const [form, setForm] = useState({
    nombre: "",
    ubicacion: "",
    responsable: "",
  })
  const [deleteTarget, setDeleteTarget] = useState<Almacen | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  function openNew() {
    setEditing(null)
    setForm({ nombre: "", ubicacion: "", responsable: "" })
    setModal(true)
  }

  function openEdit(a: Almacen) {
    setEditing(a)
    setForm({
      nombre: a.nombre,
      ubicacion: a.ubicacion,
      responsable: a.responsable,
    })
    setModal(true)
  }

  async function save() {
    if (editing) {
      await onUpdate(editing, form)
    } else {
      await onCreate(form)
    }
    setForm({ nombre: "", ubicacion: "", responsable: "" })
    setModal(false)
    setEditing(null)
  }

  function toggleActivo(id: string) {
    setAlmacenes((prev) => prev.map((a) => ({ ...a, activo: a.id === id })))
    onActivarAlmacen(id)
  }

  function openDelete(a: Almacen) {
    setDeleteTarget(a)
    setDeleteConfirmation("")
  }

  function confirmDelete() {
    if (deleteConfirmation.trim() !== deleteTarget?.nombre) {
      return
    }
    onDelete(deleteTarget!.id)
    setDeleteTarget(null)
  }

  const canSave =
    form.nombre.trim() && form.ubicacion.trim() && form.responsable.trim()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <p
            className="font-black text-[#172126] text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            Almacenes
          </p>
          <p
            className="text-[13px] text-[#607078] mt-[2px]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            El almacén activo es el destino de todas las operaciones de
            inventario.
          </p>
        </div>
        <Btn onClick={openNew}>
          <PlusIcon /> Nuevo almacén
        </Btn>
      </div>

      <div className="flex flex-col gap-3">
        {almacenes.map((a) => (
          <div
            key={a.id}
            className="bg-white rounded-[16px] border border-[#dce4e7] px-4 lg:px-5 py-4 shadow-[0px_2px_8px_rgba(22,52,63,0.05)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
          >
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <div
                className={`size-10 rounded-[12px] flex items-center justify-center shrink-0 ${
                  a.activo ? "bg-[#16343f]" : "bg-[#f0f4f5]"
                }`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={a.activo ? "white" : "#607078"}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className="font-bold text-[#172126] text-[13px] lg:text-[14px] truncate"
                    style={{
                      fontFamily: "'Inter',sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {a.nombre}
                  </p>
                  {a.activo && (
                    <Badge label="Activo" color="green" className="shrink-0" />
                  )}
                  {!a.activo && (
                    <Badge label="Inactivo" color="gray" className="shrink-0" />
                  )}
                </div>
                <p
                  className="text-[11px] lg:text-[12px] text-[#607078] mt-[2px] truncate"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  {a.ubicacion} · {a.responsable}
                </p>
                <p
                  className="text-[10px] lg:text-[11px] text-[#aab8be] mt-[1px] truncate"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  {a.id} · Alta: {a.creadoEn}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              {a.activo ? (
                <span
                  className="text-[10px] lg:text-[11px] font-bold text-[#16845b] px-3 py-[5px] bg-[#e2f5ec] rounded-full w-full sm:w-auto text-center"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  En uso
                </span>
              ) : (
                <Btn
                  variant="secondary"
                  small
                  onClick={() => toggleActivo(a.id)}
                  className="w-full sm:w-auto"
                >
                  Activar
                </Btn>
              )}
              <Btn
                variant="ghost"
                small
                onClick={() => openEdit(a)}
                className="w-full sm:w-auto touch-target"
              >
                <EditIcon />
              </Btn>
              <Btn
                variant="danger"
                small
                onClick={() => openDelete(a)}
                className="w-full sm:w-auto touch-target"
              >
                <TrashIcon />
              </Btn>
            </div>
          </div>
        ))}
      </div>

      {/* Nuevo almacén modal */}
      {modal && (
        <Modal
          title={editing ? "Editar almacén" : "Nuevo almacén"}
          onClose={() => {
            setModal(false)
            setEditing(null)
          }}
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label>Nombre del almacén</Label>
              <Input
                value={form.nombre}
                onChange={(v) => setForm((f) => ({ ...f, nombre: v }))}
                placeholder="Bodega Oriente"
              />
            </div>
            <div>
              <Label>Ubicación / Dirección</Label>
              <Input
                value={form.ubicacion}
                onChange={(v) => setForm((f) => ({ ...f, ubicacion: v }))}
                placeholder="Calle, Colonia, Ciudad"
              />
            </div>
            <div>
              <Label>Responsable</Label>
              <Input
                value={form.responsable}
                onChange={(v) => setForm((f) => ({ ...f, responsable: v }))}
                placeholder="Nombre completo"
              />
            </div>
            <div className="bg-[#e8f2f7] rounded-[10px] px-4 py-3 flex items-start gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3276a8"
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
                className="text-[12px] text-[#3276a8]"
                style={{ fontFamily: "'Inter',sans-serif" }}
              >
                Al dar de alta este almacén se creará un inventario
                independiente para él. Para activarlo, selecciónalo después en
                la lista.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn
                variant="secondary"
                onClick={() => {
                  setModal(false)
                  setEditing(null)
                }}
              >
                Cancelar
              </Btn>
              <Btn onClick={save} disabled={!canSave}>
                {editing ? "Guardar cambios" : "Crear almacén"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Eliminar con confirmation text; authorization is enforced by Firestore rules. */}
      {deleteTarget && (
        <Modal title="Eliminar almacén" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col gap-4">
            <div className="bg-[#fdecea] border border-[#f5c6c2] rounded-[12px] px-4 py-3 flex items-start gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#c0392b"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 mt-[1px]"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <p
                  className="text-[13px] font-bold text-[#c0392b]"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  Estás por eliminar: {deleteTarget.nombre}
                </p>
                <p
                  className="text-[12px] text-[#c0392b] mt-[2px]"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  Esta acción eliminará el almacén y su inventario asociado de
                  forma permanente.
                </p>
              </div>
            </div>
            <div>
              <Label>Escribe el nombre del almacén para confirmar</Label>
              <input
                type="password"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={deleteTarget.nombre}
                className="border rounded-[10px] px-3 py-[8px] text-[13px] text-[#172126] w-full outline-none transition-colors bg-white border-[#dce4e7] focus:border-[#3276a8]"
                style={{ fontFamily: "'Inter',sans-serif" }}
                onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Btn>
              <Btn
                variant="danger"
                onClick={confirmDelete}
                disabled={deleteConfirmation.trim() !== deleteTarget.nombre}
              >
                <TrashIcon /> Eliminar almacén
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Conversiones tab ─────────────────────────────────────────────────────────

function TabConversiones({
  conversiones,
  setConversiones,
  onCreate,
  onUpdate,
  onDelete,
}: {
  conversiones: Conversion[]
  setConversiones: React.Dispatch<React.SetStateAction<Conversion[]>>
  onCreate: (form: {
    producto: string
    piezasPorCaja: string
    cajasPorTarima: string
    pesoKgCaja: string
  }) => Promise<void>
  onUpdate: (
    editing: Conversion,
    form: {
      producto: string
      piezasPorCaja: string
      cajasPorTarima: string
      pesoKgCaja: string
    },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Conversion | null>(null)
  const [form, setForm] = useState({
    producto: "",
    piezasPorCaja: "",
    cajasPorTarima: "",
    pesoKgCaja: "",
  })
  const [search, setSearch] = useState("")

  function openNew() {
    setEditing(null)
    setForm({
      producto: "",
      piezasPorCaja: "",
      cajasPorTarima: "",
      pesoKgCaja: "",
    })
    setModal(true)
  }

  function openEdit(c: Conversion) {
    setEditing(c)
    setForm({
      producto: c.producto,
      piezasPorCaja: String(c.piezasPorCaja),
      cajasPorTarima: String(c.cajasPorTarima),
      pesoKgCaja: c.pesoKgCaja,
    })
    setModal(true)
  }

  async function save() {
    if (editing) {
      await onUpdate(editing, form)
    } else {
      await onCreate(form)
    }
    setModal(false)
  }

  async function eliminar(id: string) {
    await onDelete(id)
  }

  const filtered = conversiones.filter((c) =>
    c.producto.toLowerCase().includes(search.toLowerCase()),
  )
  const canSave =
    form.producto.trim() && form.piezasPorCaja && form.cajasPorTarima

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <p
            className="font-black text-[#172126] text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            Tabla de conversiones
          </p>
          <p
            className="text-[13px] text-[#607078] mt-[2px]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Estas equivalencias se usan en Embarques para calcular tarimas
            automáticamente.
          </p>
        </div>
        <Btn onClick={openNew}>
          <PlusIcon /> Nueva conversión
        </Btn>
      </div>

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#607078"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          className="border border-[#dce4e7] rounded-[10px] pl-9 pr-3 py-[8px] text-[13px] w-full outline-none focus:border-[#3276a8]"
          style={{ fontFamily: "'Inter',sans-serif" }}
        />
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full text-left responsive-table">
            <thead>
              <tr className="border-b border-[#dce4e7]">
                {[
                  "Producto",
                  "Piezas / caja",
                  "Cajas / tarima",
                  "Peso kg/caja",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[11px] font-bold uppercase text-[#607078]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-b border-[#f0f4f5] last:border-0 ${
                    i % 2 === 0 ? "" : "bg-[#fafbfc]"
                  }`}
                >
                  <td
                    className="px-4 py-3 text-[13px] font-semibold text-[#172126]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                    data-label="Producto"
                  >
                    {c.producto}
                  </td>
                  <td
                    className="px-4 py-3 text-[13px] text-[#172126] font-mono"
                    data-label="Piezas / caja"
                  >
                    {c.piezasPorCaja}
                  </td>
                  <td
                    className="px-4 py-3 text-[13px] text-[#172126] font-mono"
                    data-label="Cajas / tarima"
                  >
                    {c.cajasPorTarima}
                  </td>
                  <td
                    className="px-4 py-3 text-[13px] text-[#607078]"
                    data-label="Peso kg/caja"
                  >
                    {c.pesoKgCaja ? `${c.pesoKgCaja} kg` : "—"}
                  </td>
                  <td className="px-4 py-3" data-label="Acciones">
                    <div className="flex gap-2 justify-end">
                      <Btn variant="ghost" small onClick={() => openEdit(c)}>
                        <EditIcon />
                      </Btn>
                      <Btn
                        variant="danger"
                        small
                        onClick={() => eliminar(c.id)}
                      >
                        <TrashIcon />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[13px] text-[#607078]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {modal && (
        <Modal
          title={editing ? "Editar conversión" : "Nueva conversión"}
          onClose={() => setModal(false)}
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label>Nombre del producto</Label>
              <Input
                value={form.producto}
                onChange={(v) => setForm((f) => ({ ...f, producto: v }))}
                placeholder="Ej. Coca Cola regular 235ml"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Piezas por caja</Label>
                <Input
                  value={form.piezasPorCaja}
                  onChange={(v) => setForm((f) => ({ ...f, piezasPorCaja: v }))}
                  type="number"
                  placeholder="24"
                />
              </div>
              <div>
                <Label>Cajas por tarima</Label>
                <Input
                  value={form.cajasPorTarima}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, cajasPorTarima: v }))
                  }
                  type="number"
                  placeholder="60"
                />
              </div>
            </div>
            <div>
              <Label>Peso por caja (kg, opcional)</Label>
              <Input
                value={form.pesoKgCaja}
                onChange={(v) => setForm((f) => ({ ...f, pesoKgCaja: v }))}
                placeholder="5.4"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(false)}>
                Cancelar
              </Btn>
              <Btn onClick={save} disabled={!canSave}>
                Guardar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Proveedores tab ──────────────────────────────────────────────────────────

function TabProveedores({
  tipo,
  proveedores,
  setProveedores,
  onCreate,
  onUpdate,
  onDelete,
}: {
  tipo: "mercancia" | "logistica"
  proveedores: Proveedor[]
  setProveedores: React.Dispatch<React.SetStateAction<Proveedor[]>>
  onCreate: (form: {
    nombre: string
    contacto: string
    telefono: string
    email: string
  }) => Promise<void>
  onUpdate: (
    editing: Proveedor,
    form: { nombre: string contacto: string telefono: string email: string },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [form, setForm] = useState({
    nombre: "",
    contacto: "",
    telefono: "",
    email: "",
  })

  const lista = proveedores.filter((p) => p.tipo === tipo)

  function openNew() {
    setEditing(null)
    setForm({ nombre: "", contacto: "", telefono: "", email: "" })
    setModal(true)
  }

  function openEdit(p: Proveedor) {
    setEditing(p)
    setForm({
      nombre: p.nombre,
      contacto: p.contacto,
      telefono: p.telefono,
      email: p.email,
    })
    setModal(true)
  }

  async function save() {
    if (editing) {
      await onUpdate(editing, form)
    } else {
      await onCreate(form)
    }
    setModal(false)
  }

  async function eliminar(id: string) {
    await onDelete(id)
  }

  const canSave = form.nombre.trim() && form.contacto.trim()

  const label =
    tipo === "mercancia"
      ? "Proveedores de mercancía"
      : "Proveedores de logística"
  const desc =
    tipo === "mercancia"
      ? "Empresas que suministran productos al almacén."
      : "Empresas de transporte y distribución que realizan los embarques."

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <p
            className="font-black text-[#172126] text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            {label}
          </p>
          <p
            className="text-[13px] text-[#607078] mt-[2px]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            {desc}
          </p>
        </div>
        <Btn onClick={openNew}>
          <PlusIcon /> Nuevo proveedor
        </Btn>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {lista.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-[#dce4e7] rounded-[16px] px-4 lg:px-5 py-4 shadow-[0px_2px_8px_rgba(22,52,63,0.05)]"
          >
            <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
              <div className="min-w-0">
                <p
                  className="font-bold text-[#172126] text-[13px] lg:text-[14px] truncate"
                  style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
                >
                  {p.nombre}
                </p>
                <p
                  className="text-[11px] lg:text-[12px] text-[#607078] truncate"
                  style={{ fontFamily: "'Inter',sans-serif" }}
                >
                  {p.contacto}
                </p>
              </div>
              <Badge label={p.id} color="gray" className="shrink-0" />
            </div>
            <div className="flex flex-col gap-[4px]">
              {p.telefono && (
                <div className="flex items-center gap-2">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#607078"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.18 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8a16 16 0 0 0 6 6l.27-.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16z" />
                  </svg>
                  <p
                    className="text-[11px] lg:text-[12px] text-[#607078] truncate"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {p.telefono}
                  </p>
                </div>
              )}
              {p.email && (
                <div className="flex items-center gap-2">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#607078"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <p
                    className="text-[11px] lg:text-[12px] text-[#607078] truncate"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {p.email}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-[#f0f4f5]">
              <Btn
                variant="secondary"
                small
                onClick={() => openEdit(p)}
                className="w-full sm:w-auto"
              >
                <EditIcon /> Editar
              </Btn>
              <Btn
                variant="danger"
                small
                onClick={() => eliminar(p.id)}
                className="w-full sm:w-auto"
              >
                <TrashIcon /> Eliminar
              </Btn>
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <div className="col-span-1 sm:col-span-2 bg-white rounded-[16px] border border-dashed border-[#dce4e7] px-6 py-10 flex flex-col items-center gap-2">
            <p
              className="text-[13px] lg:text-[14px] font-bold text-[#607078]"
              style={{ fontFamily: "'Inter',sans-serif" }}
            >
              Sin proveedores registrados
            </p>
            <Btn onClick={openNew}>
              <PlusIcon /> Agregar el primero
            </Btn>
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={editing ? "Editar proveedor" : "Nuevo proveedor"}
          onClose={() => setModal(false)}
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label>Nombre de la empresa</Label>
              <Input
                value={form.nombre}
                onChange={(v) => setForm((f) => ({ ...f, nombre: v }))}
                placeholder="Empresa S.A. de C.V."
              />
            </div>
            <div>
              <Label>Nombre del contacto</Label>
              <Input
                value={form.contacto}
                onChange={(v) => setForm((f) => ({ ...f, contacto: v }))}
                placeholder="Nombre completo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(v) => setForm((f) => ({ ...f, telefono: v }))}
                  placeholder="55-0000-0000"
                />
              </div>
              <div>
                <Label>Correo electrónico</Label>
                <Input
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="contacto@empresa.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(false)}>
                Cancelar
              </Btn>
              <Btn onClick={save} disabled={!canSave}>
                Guardar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Productos tab ────────────────────────────────────────────────────────────

function TabProductos({
  productos,
  setProductos,
  onCreate,
  onUpdate,
  onDelete,
  onToggleActivo,
}: {
  productos: Producto[]
  setProductos: React.Dispatch<React.SetStateAction<Producto[]>>
  onCreate: (form: {
    nombre: string
    sku: string
    categoria: string
    unidad: Producto["unidad"]
    codigosProveedor: string
  }) => Promise<void>
  onUpdate: (
    editing: Producto,
    form: {
      nombre: string
      sku: string
      categoria: string
      unidad: Producto["unidad"]
      codigosProveedor: string
    },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggleActivo: (id: string) => Promise<void>
}) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    categoria: "",
    unidad: "cajas" as Producto["unidad"],
    codigosProveedor: "",
  })
  const [search, setSearch] = useState("")

  function openNew() {
    setEditing(null)
    setForm({
      nombre: "",
      sku: "",
      categoria: "",
      unidad: "cajas",
      codigosProveedor: "",
    })
    setModal(true)
  }

  function openEdit(p: Producto) {
    setEditing(p)
    setForm({
      nombre: p.nombre,
      sku: p.sku,
      categoria: p.categoria,
      unidad: p.unidad,
      codigosProveedor: (p.codigosProveedor || []).join(", "),
    })
    setModal(true)
  }

  async function save() {
    if (editing) {
      await onUpdate(editing, form)
    } else {
      await onCreate(form)
    }
    setModal(false)
  }

  async function toggleActivo(id: string) {
    await onToggleActivo(id)
  }

  async function eliminar(id: string) {
    await onDelete(id)
  }

  const filtered = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.categoria.toLowerCase().includes(search.toLowerCase()),
  )
  const canSave = form.nombre.trim() && form.sku.trim()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <p
            className="font-black text-[#172126] text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            Alta de productos
          </p>
          <p
            className="text-[13px] text-[#607078] mt-[2px]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            Catálogo maestro de productos disponibles en el sistema.
          </p>
        </div>
        <Btn onClick={openNew}>
          <PlusIcon /> Nuevo producto
        </Btn>
      </div>

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#607078"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU o categoría…"
          className="border border-[#dce4e7] rounded-[10px] pl-9 pr-3 py-[8px] text-[13px] w-full outline-none focus:border-[#3276a8]"
          style={{ fontFamily: "'Inter',sans-serif" }}
        />
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full text-left responsive-table">
            <thead>
              <tr className="border-b border-[#dce4e7]">
                {[
                  "Producto",
                  "SKU",
                  "Código factura",
                  "Categoría",
                  "Unidad",
                  "Estado",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[11px] font-bold uppercase text-[#607078]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-[#f0f4f5] last:border-0 ${
                    i % 2 === 0 ? "" : "bg-[#fafbfc]"
                  }`}
                >
                  <td
                    className="px-4 py-3 text-[13px] font-semibold text-[#172126]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                    data-label="Producto"
                  >
                    {p.nombre}
                  </td>
                  <td
                    className="px-4 py-3 text-[12px] text-[#607078] font-mono"
                    data-label="SKU"
                  >
                    {p.sku}
                  </td>
                  <td
                    className="px-4 py-3 text-[12px] text-[#607078] font-mono"
                    data-label="Código factura"
                  >
                    {(p.codigosProveedor || []).join(", ") || "—"}
                  </td>
                  <td
                    className="px-4 py-3 text-[12px] text-[#607078]"
                    data-label="Categoría"
                  >
                    {p.categoria || "—"}
                  </td>
                  <td
                    className="px-4 py-3 text-[12px] text-[#607078] capitalize"
                    data-label="Unidad"
                  >
                    {p.unidad}
                  </td>
                  <td className="px-4 py-3" data-label="Estado">
                    <Badge
                      label={p.activo ? "Activo" : "Inactivo"}
                      color={p.activo ? "green" : "gray"}
                    />
                  </td>
                  <td className="px-4 py-3" data-label="Acciones">
                    <div className="flex gap-2 justify-end">
                      <Btn variant="ghost" small onClick={() => openEdit(p)}>
                        <EditIcon />
                      </Btn>
                      <Btn
                        variant="secondary"
                        small
                        onClick={() => toggleActivo(p.id)}
                      >
                        {p.activo ? "Desactivar" : "Activar"}
                      </Btn>
                      <Btn
                        variant="danger"
                        small
                        onClick={() => eliminar(p.id)}
                      >
                        <TrashIcon />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[13px] text-[#607078]"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {modal && (
        <Modal
          title={editing ? "Editar producto" : "Nuevo producto"}
          onClose={() => setModal(false)}
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label>Nombre del producto</Label>
              <Input
                value={form.nombre}
                onChange={(v) => setForm((f) => ({ ...f, nombre: v }))}
                placeholder="Nombre completo del producto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU / Clave</Label>
                <Input
                  value={form.sku}
                  onChange={(v) => setForm((f) => ({ ...f, sku: v }))}
                  placeholder="CC-235-R"
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <Input
                  value={form.categoria}
                  onChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
                  placeholder="Bebidas, Lácteos…"
                />
              </div>
            </div>
            <div>
              <Label>Códigos de factura del proveedor</Label>
              <Input
                value={form.codigosProveedor}
                onChange={(v) =>
                  setForm((f) => ({ ...f, codigosProveedor: v }))
                }
                placeholder="CB0401, CB0401-MX (separados por coma)"
              />
            </div>
            <div>
              <Label>Unidad de manejo</Label>
              <select
                value={form.unidad}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    unidad: e.target.value as Producto["unidad"],
                  }))
                }
                className="border border-[#dce4e7] rounded-[10px] px-3 py-[8px] text-[13px] text-[#172126] w-full outline-none focus:border-[#3276a8] bg-white"
                style={{ fontFamily: "'Inter',sans-serif" }}
              >
                <option value="cajas">Cajas</option>
                <option value="piezas">Piezas</option>
                <option value="kg">Kilogramos</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Btn variant="secondary" onClick={() => setModal(false)}>
                Cancelar
              </Btn>
              <Btn onClick={save} disabled={!canSave}>
                Guardar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab label: string icon: React.ReactNode }[] = [
  {
    id: "almacenes",
    label: "Almacenes",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: "conversiones",
    label: "Conversiones",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
  {
    id: "mercancias",
    label: "Prov. Mercancía",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    id: "logistica",
    label: "Prov. Logística",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 4v4h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    id: "productos",
    label: "Alta de productos",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
]

interface ConfiguracionProps {
  productos: Producto[]
  setProductos: React.Dispatch<React.SetStateAction<Producto[]>>
  proveedores: Proveedor[]
  setProveedores: React.Dispatch<React.SetStateAction<Proveedor[]>>
  conversiones: Conversion[]
  setConversiones: React.Dispatch<React.SetStateAction<Conversion[]>>
  almacenes: Almacen[]
  setAlmacenes: React.Dispatch<React.SetStateAction<Almacen[]>>
  onActivarAlmacen: (id: string) => void
}

const ORG_ID = "org_exepa_001"

export default function Configuracion({
  productos,
  setProductos,
  proveedores,
  setProveedores,
  conversiones,
  setConversiones,
  almacenes,
  setAlmacenes,
  onActivarAlmacen,
}: ConfiguracionProps) {
  const { canQuery } = useAuthorization()
  const [tab, setTab] = useState<Tab>("almacenes")
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [fsServices, setFsServices] =
    useState<ReturnType<typeof createFirestoreServices> | null>(null)

  // Initialize Firestore services when feature flag is enabled
  useEffect(() => {
    if (canQuery && isFeatureEnabled("USE_FIRESTORE_CATALOGOS") && db) {
      const services = createFirestoreServices(db, ORG_ID)
      setFsServices(services)
      setFirestoreReady(true)
    }
  }, [canQuery])

  // Sync local state with Firestore (read)
  useEffect(() => {
    if (!canQuery || !firestoreReady || !fsServices) return

    // Load almacenes
    fsServices.warehouses
      .getAll({ orderBy: ["code", "asc"] })
      .then(({ data }) => {
        setAlmacenes(
          data.map((w) => ({
            id: w.id,
            nombre: w.name,
            ubicacion: w.location || "",
            responsable: w.manager || "",
            activo: w.active ?? false,
            creadoEn:
              w.createdAt?.toDate?.()?.toISOString?.().slice(0, 10) ||
              new Date().toISOString().slice(0, 10),
          })),
        )
      })
      .catch((error: unknown) => {
        console.error(
          isPermissionDenied(error)
            ? "No autorizado para leer almacenes"
            : error,
        )
      })

    // Load productos
    fsServices.products
      .getAll({ orderBy: ["name", "asc"] })
      .then(({ data }) => {
        setProductos(
          data.map((p) => ({
            id: p.id,
            nombre: p.name,
            sku: p.sku,
            categoria: p.category || "",
            unidad: p.unit as Producto["unidad"],
            activo: true,
            codigosProveedor: p.supplierCodes || [],
          })),
        )
      })
      .catch((error: unknown) => {
        console.error(
          isPermissionDenied(error)
            ? "No autorizado para leer productos"
            : error,
        )
      })

    // Load proveedores
    fsServices.suppliers
      .getAll({ orderBy: ["code", "asc"] })
      .then(({ data }) => {
        setProveedores(
          mergeSupplierCatalog(
            data.map((p) => ({
              id: p.id,
              nombre: p.name,
              contacto: p.contact || "",
              telefono: p.phone || "",
              email: p.email || "",
              tipo: normalizeSupplierType(
                p.tipo,
                CANONICAL_SUPPLIER_LOCAL.find(
                  (supplier) => supplier.id === p.id,
                )?.tipo,
              ),
            })),
          ),
        )
      })
      .catch((error: unknown) => {
        console.error(
          isPermissionDenied(error)
            ? "No autorizado para leer proveedores"
            : error,
        )
      })

    // Load conversiones
    fsServices.conversions
      .getAll({ orderBy: ["productName", "asc"] })
      .then(({ data }) => {
        setConversiones(
          data.map((c) => ({
            id: c.id,
            producto: c.productName,
            piezasPorCaja: c.piecesPerBox,
            cajasPorTarima: c.boxesPerPallet,
            pesoKgCaja: c.weightKgPerBox || "",
          })),
        )
      })
      .catch((error: unknown) => {
        console.error(
          isPermissionDenied(error)
            ? "No autorizado para leer conversiones"
            : error,
        )
      })
  }, [canQuery, firestoreReady, fsServices])

  const almacenActivo = almacenes.find((a) => a.activo)

  // Dual-write handlers
  const handleCreateAlmacen = async (form: {
    nombre: string
    ubicacion: string
    responsable: string
  }) => {
    const nuevo: Almacen = {
      id: `ALM-${String(almacenes.length + 1).padStart(3, "0")}`,
      nombre: form.nombre,
      ubicacion: form.ubicacion,
      responsable: form.responsable,
      activo: false,
      creadoEn: new Date().toISOString().slice(0, 10),
    }
    setAlmacenes((prev) => [...prev, nuevo])

    if (firestoreReady && fsServices) {
      try {
        await fsServices.warehouses.create(
          {
            code: nuevo.id,
            name: nuevo.nombre,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore create almacén failed:", e)
      }
    }
  }

  const handleUpdateAlmacen = async (
    editing: Almacen,
    form: { nombre: string ubicacion: string responsable: string },
  ) => {
    setAlmacenes((prev) =>
      prev.map((a) => (a.id === editing.id ? { ...a, ...form } : a)),
    )

    if (firestoreReady && fsServices) {
      try {
        await fsServices.warehouses.update(
          editing.id,
          { name: form.nombre },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore update almacén failed:", e)
      }
    }
  }

  const handleDeleteAlmacen = async (id: string) => {
    setAlmacenes((prev) => prev.filter((a) => a.id !== id))

    if (firestoreReady && fsServices) {
      try {
        await fsServices.warehouses.delete(id, "user", `op-${Date.now()}`)
      } catch (e) {
        console.error("Firestore delete almacén failed:", e)
      }
    }
  }

  const handleCreateProducto = async (form: {
    nombre: string
    sku: string
    categoria: string
    unidad: Producto["unidad"]
    codigosProveedor: string
  }) => {
    const codigosProveedor = form.codigosProveedor
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)
    const nuevo: Producto = {
      id: `PRD-${String(productos.length + 1).padStart(3, "0")}`,
      nombre: form.nombre.trim().toUpperCase(),
      sku: form.sku.trim().toUpperCase(),
      categoria: form.categoria,
      unidad: form.unidad,
      activo: true,
      codigosProveedor,
    }
    setProductos((prev) => [...prev, nuevo])

    if (firestoreReady && fsServices) {
      try {
        await fsServices.products.create(
          {
            sku: form.sku.trim().toUpperCase(),
            name: form.nombre.trim().toUpperCase(),
            unit: form.unidad,
            lotControlled: false,
            expiryControlled: false,
            supplierCodes: codigosProveedor,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore create producto failed:", e)
      }
    }
  }

  const handleUpdateProducto = async (
    editing: Producto,
    form: {
      nombre: string
      sku: string
      categoria: string
      unidad: Producto["unidad"]
      codigosProveedor: string
    },
  ) => {
    const codigosProveedor = form.codigosProveedor
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)
    const normalized = {
      ...form,
      nombre: form.nombre.trim().toUpperCase(),
      sku: form.sku.trim().toUpperCase(),
      codigosProveedor,
    }
    setProductos((prev) =>
      prev.map((p) => (p.id === editing.id ? { ...p, ...normalized } : p)),
    )

    if (firestoreReady && fsServices) {
      try {
        await fsServices.products.update(
          editing.id,
          {
            name: normalized.nombre,
            sku: normalized.sku,
            supplierCodes: codigosProveedor,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore update producto failed:", e)
      }
    }
  }

  const handleDeleteProducto = async (id: string) => {
    setProductos((prev) => prev.filter((p) => p.id !== id))

    if (firestoreReady && fsServices) {
      try {
        await fsServices.products.delete(id, "user", `op-${Date.now()}`)
      } catch (e) {
        console.error("Firestore delete producto failed:", e)
      }
    }
  }

  const handleToggleProductoActivo = async (id: string) => {
    setProductos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, activo: !p.activo } : p)),
    )
  }

  const handleCreateProveedor = async (
    tipo: "mercancia" | "logistica",
    form: { nombre: string contacto: string telefono: string email: string },
  ) => {
    const nuevo: Proveedor = {
      id: `P-${String(proveedores.length + 1).padStart(3, "0")}`,
      tipo,
      nombre: form.nombre,
      contacto: form.contacto,
      telefono: form.telefono,
      email: form.email,
    }
    setProveedores((prev) => [...prev, nuevo])

    if (firestoreReady && fsServices) {
      try {
        await fsServices.suppliers.create(
          {
            code: nuevo.id,
            name: form.nombre,
            tipo,
            contact: form.contacto || undefined,
            phone: form.telefono || undefined,
            email: form.email || undefined,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore create proveedor failed:", e)
      }
    }
  }

  const handleUpdateProveedor = async (
    editing: Proveedor,
    form: { nombre: string contacto: string telefono: string email: string },
  ) => {
    setProveedores((prev) =>
      prev.map((p) => (p.id === editing.id ? { ...p, ...form } : p)),
    )

    if (firestoreReady && fsServices) {
      try {
        await fsServices.suppliers.update(
          editing.id,
          {
            name: form.nombre,
            tipo: editing.tipo,
            contact: form.contacto || undefined,
            phone: form.telefono || undefined,
            email: form.email || undefined,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore update proveedor failed:", e)
      }
    }
  }

  const handleDeleteProveedor = async (id: string) => {
    setProveedores((prev) => prev.filter((p) => p.id !== id))

    if (firestoreReady && fsServices) {
      try {
        await fsServices.suppliers.delete(id, "user", `op-${Date.now()}`)
      } catch (e) {
        console.error("Firestore delete proveedor failed:", e)
      }
    }
  }

  const handleCreateConversion = async (form: {
    producto: string
    piezasPorCaja: string
    cajasPorTarima: string
    pesoKgCaja: string
  }) => {
    const nuevo: Conversion = {
      id: `C-${String(conversiones.length + 1).padStart(3, "0")}`,
      producto: form.producto,
      piezasPorCaja: Number(form.piezasPorCaja),
      cajasPorTarima: Number(form.cajasPorTarima),
      pesoKgCaja: form.pesoKgCaja,
    }
    setConversiones((prev) => [...prev, nuevo])

    if (firestoreReady && fsServices) {
      try {
        await fsServices.conversions.create(
          {
            productName: form.producto,
            piecesPerBox: Number(form.piezasPorCaja),
            boxesPerPallet: Number(form.cajasPorTarima),
            weightKgPerBox: form.pesoKgCaja || undefined,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore create conversion failed:", e)
      }
    }
  }

  const handleUpdateConversion = async (
    editing: Conversion,
    form: {
      producto: string
      piezasPorCaja: string
      cajasPorTarima: string
      pesoKgCaja: string
    },
  ) => {
    setConversiones((prev) =>
      prev.map((c) =>
        c.id === editing.id
          ? {
              ...c,
              producto: form.producto,
              piezasPorCaja: Number(form.piezasPorCaja),
              cajasPorTarima: Number(form.cajasPorTarima),
              pesoKgCaja: form.pesoKgCaja,
            }
          : c,
      ),
    )

    if (firestoreReady && fsServices) {
      try {
        await fsServices.conversions.update(
          editing.id,
          {
            productName: form.producto,
            piecesPerBox: Number(form.piezasPorCaja),
            boxesPerPallet: Number(form.cajasPorTarima),
            weightKgPerBox: form.pesoKgCaja || undefined,
          },
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore update conversion failed:", e)
      }
    }
  }

  const handleDeleteConversion = async (id: string) => {
    setConversiones((prev) => prev.filter((c) => c.id !== id))

    if (firestoreReady && fsServices) {
      try {
        await fsServices.conversions.delete(id, "user", `op-${Date.now()}`)
      } catch (e) {
        console.error("Firestore delete conversion failed:", e)
      }
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top tabs bar */}
      <div
        className="bg-white border-b border-[#dce4e7] flex items-center gap-1 px-4 py-3 shrink-0 overflow-x-auto hide-scrollbar"
        role="tablist"
        aria-label="Módulos de configuración"
      >
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={active}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] whitespace-nowrap text-sm transition-colors"
              style={{
                background: active ? "#16343f" : "transparent",
                color: active ? "white" : "#607078",
                fontFamily: "'Inter',sans-serif",
                fontWeight: active ? 600 : 500,
                border: active ? "none" : "1px solid transparent",
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 lg:p-7 flex flex-col gap-5">
        {/* Active warehouse banner */}
        {almacenActivo && tab !== "almacenes" && (
          <div className="bg-[#e8f2f7] border border-[#b6d4e7] rounded-[12px] px-4 py-[10px] flex items-center gap-3">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3276a8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <p
              className="text-[12px] text-[#3276a8] font-semibold"
              style={{ fontFamily: "'Inter',sans-serif" }}
            >
              Almacén activo: <strong>{almacenActivo.nombre}</strong>
            </p>
          </div>
        )}

        {tab === "almacenes" && (
          <TabAlmacenes
            almacenes={almacenes}
            setAlmacenes={setAlmacenes}
            onActivarAlmacen={onActivarAlmacen}
            onCreate={handleCreateAlmacen}
            onUpdate={handleUpdateAlmacen}
            onDelete={handleDeleteAlmacen}
            firestoreReady={firestoreReady}
          />
        )}
        {tab === "conversiones" && (
          <TabConversiones
            conversiones={conversiones}
            setConversiones={setConversiones}
            onCreate={handleCreateConversion}
            onUpdate={handleUpdateConversion}
            onDelete={handleDeleteConversion}
          />
        )}
        {tab === "mercancias" && (
          <TabProveedores
            tipo="mercancia"
            proveedores={proveedores}
            setProveedores={setProveedores}
            onCreate={(form) => handleCreateProveedor("mercancia", form)}
            onUpdate={handleUpdateProveedor}
            onDelete={handleDeleteProveedor}
          />
        )}
        {tab === "logistica" && (
          <TabProveedores
            tipo="logistica"
            proveedores={proveedores}
            setProveedores={setProveedores}
            onCreate={(form) => handleCreateProveedor("logistica", form)}
            onUpdate={handleUpdateProveedor}
            onDelete={handleDeleteProveedor}
          />
        )}
        {tab === "productos" && (
          <TabProductos
            productos={productos}
            setProductos={setProductos}
            onCreate={handleCreateProducto}
            onUpdate={handleUpdateProducto}
            onDelete={handleDeleteProducto}
            onToggleActivo={handleToggleProductoActivo}
          />
        )}
      </div>
    </div>
  )
}
