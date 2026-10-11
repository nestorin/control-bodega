import { useState, useEffect, useCallback, useRef } from "react"
import { isFeatureEnabled } from "@/config/featureFlags"
import { db } from "@/lib/firebase"
import { createFirestoreServices } from "@/services/firestore"
import { useAuthorization, isPermissionDenied } from "@/hooks/useAuthorization"
import type { LotCaducidadDoc } from "@/services/firestore/types"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import {
  buildInventoryImportRows,
  parseInventoryImport,
  type InventoryImportPreview,
} from "@/services/inventoryImport"

const ORG_ID = "org_exepa_001"

type MesKey = string // "Dec-26"
type SortField = "productName" | "lot" | "expiryDate" | "cajas" | "monthKey"
type SortDir = "asc" | "desc"

interface LoteRow extends LotCaducidadDoc {
  diasParaCaducar: number
  status: "ok" | "proximo" | "vencido"
}

const MESES_LABELS: Record<number, string> = {
  0: "Ene",
  1: "Feb",
  2: "Mar",
  3: "Abr",
  4: "May",
  5: "Jun",
  6: "Jul",
  7: "Ago",
  8: "Sep",
  9: "Oct",
  10: "Nov",
  11: "Dic",
}

function formatMonthKey(ts: any): MesKey {
  if (!ts) return ""
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return `${MESES_LABELS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`
}

function parseMonthKey(key: MesKey): Date | null {
  const [mes, year] = key.split("-")
  const mesNum = Object.entries(MESES_LABELS).find(([, v]) => v === mes)?.[0]
  if (!mesNum) return null
  return new Date(2000 + parseInt(year), parseInt(mesNum), 1)
}

function getStatus(expiryDate: any): "ok" | "proximo" | "vencido" {
  if (!expiryDate) return "ok"
  const exp = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const diff = Math.ceil(
    (exp.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diff < 0) return "vencido"
  if (diff <= 30) return "proximo"
  return "ok"
}

function getDiasParaCaducar(expiryDate: any): number {
  if (!expiryDate) return 9999
  const exp = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

const assetPathPrefix = "/assets"
const imgWarehouse = `${assetPathPrefix}/66fcc.svg`
const imgAlert = `${assetPathPrefix}/c542a.svg`
const imgCalendar = `${assetPathPrefix}/ba9e1.svg`
const imgDownload = `${assetPathPrefix}/8a4b5.svg`
const imgFilter = `${assetPathPrefix}/7f3a2.svg`

export default function LotesCaducidades() {
  const { user, canQuery } = useAuthorization()
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] =
    useState<"all" | "ok" | "proximo" | "vencido">("all")
  const [filterMonth, setFilterMonth] = useState<MesKey>("all")
  const [sortField, setSortField] = useState<SortField>("expiryDate")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCajas, setEditCajas] = useState("")
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importPreview, setImportPreview] =
    useState<InventoryImportPreview | null>(null)
  const [importFileName, setImportFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const useFirestore =
    isFeatureEnabled("USE_FIRESTORE_LOTES") && !!db && canQuery
  const [fsServices, setFsServices] =
    useState<ReturnType<typeof createFirestoreServices> | null>(null)

  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID)
      setFsServices(services)
    }
  }, [useFirestore, db])

  const loadLotes = useCallback(async () => {
    if (!fsServices) {
      setLotes([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fsServices.lotesCaducidades.getByWarehouse(
        WAREHOUSE_IDS.NORTH,
      )
      const mapped: LoteRow[] = res.map((l) => ({
        ...l,
        diasParaCaducar: getDiasParaCaducar(l.expiryDate),
        status: getStatus(l.expiryDate),
      }))
      setLotes(mapped)
      setLastSync(new Date())
    } catch (err) {
      setError(
        isPermissionDenied(err)
          ? "No tenés permisos para consultar lotes de este almacén."
          : err instanceof Error
            ? err.message
            : "Error al cargar lotes",
      )
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [fsServices])

  useEffect(() => {
    loadLotes()
  }, [loadLotes])

  const filteredLotes = lotes
    .filter((l) => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false
      if (filterMonth !== "all" && l.monthKey !== filterMonth) return false
      if (search) {
        const s = search.toLowerCase()
        if (
          !l.productName.toLowerCase().includes(s) &&
          !l.lot.toLowerCase().includes(s) &&
          !l.monthKey.toLowerCase().includes(s)
        )
          return false
      }
      return true
    })
    .sort((a, b) => {
      let av: any = a[sortField]
      let bv: any = b[sortField]
      if (sortField === "expiryDate") {
        av = av?.toDate?.()?.getTime?.() ?? 0
        bv = bv?.toDate?.()?.getTime?.() ?? 0
      }
      if (typeof av === "string") av = av.toLowerCase()
      if (typeof bv === "string") bv = bv.toLowerCase()
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })

  const monthsAvailable = Array.from(
    new Set(lotes.map((l) => l.monthKey)),
  ).sort((a, b) => {
    const da = parseMonthKey(a)?.getTime() ?? 0
    const db = parseMonthKey(b)?.getTime() ?? 0
    return da - db
  })

  const handleEdit = (lote: LoteRow) => {
    setEditingId(lote.id)
    setEditCajas(String(lote.cajas))
  }

  const handleSave = async (lote: LoteRow) => {
    if (!fsServices || !user) return
    const nuevasCajas = parseInt(editCajas, 10)
    if (isNaN(nuevasCajas) || nuevasCajas < 0) return
    setSyncing(true)
    try {
      await fsServices.lotesCaducidades.update(
        lote.id,
        { cajas: nuevasCajas },
        user.uid,
        `edit-${Date.now()}`,
      )
      setLotes((prev) =>
        prev.map((l) => (l.id === lote.id ? { ...l, cajas: nuevasCajas } : l)),
      )
      setEditingId(null)
      setEditCajas("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setSyncing(false)
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditCajas("")
  }

  const handleSync = async () => {
    await loadLotes()
  }

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setImportError(null)
    setImportFileName(file.name)
    try {
      setImportPreview(
        parseInventoryImport(await file.arrayBuffer(), file.name),
      )
    } catch {
      setImportPreview(null)
      setImportError("No se pudo leer el archivo. Usa XLS, XLSX o CSV.")
    }
  }

  const handleImportAction = async (mode: "REPLACE" | "ADD" | "DISCARD") => {
    if (mode === "DISCARD") {
      setImportPreview(null)
      setImportFileName("")
      return
    }
    if (!importPreview || !fsServices || !user) return
    const rows = buildInventoryImportRows(importPreview)
    if (!rows.length) return
    setImporting(true)
    setImportError(null)
    try {
      await fsServices.inventory.importInventory(
        rows,
        mode,
        `inventory-import-${crypto.randomUUID()}`,
      )
      setImportPreview(null)
      setImportFileName("")
      await loadLotes()
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "No se pudo importar el inventario.",
      )
    } finally {
      setImporting(false)
    }
  }

  const exportCSV = () => {
    const headers = [
      "Producto",
      "Lote",
      "Caducidad",
      "Mes",
      "Cajas",
      "Estado",
      "Días",
    ]
    const rows = filteredLotes.map((l) => [
      l.productName,
      l.lot,
      l.expiryDate?.toDate?.().toLocaleDateString("es-MX") ?? "",
      l.monthKey,
      String(l.cajas),
      l.status === "vencido"
        ? "VENCIDO"
        : l.status === "proximo"
          ? "PRÓXIMO"
          : "OK",
      String(l.diasParaCaducar),
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `lotes-caducidades-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStatusBadge = (status: LoteRow["status"]) => {
    switch (status) {
      case "vencido":
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#fee2e2] text-[#b91c1c] text-[11px] font-bold"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            VENCIDO
          </span>
        )
      case "proximo":
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#fef3c7] text-[#92400e] text-[11px] font-bold"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            PRÓXIMO
          </span>
        )
      default:
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#dcfce7] text-[#166534] text-[11px] font-bold"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            OK
          </span>
        )
    }
  }

  const getStatusColor = (status: LoteRow["status"]) => {
    switch (status) {
      case "vencido":
        return "bg-[#fee2e2] text-[#b91c1c]"
      case "proximo":
        return "bg-[#fef3c7] text-[#92400e]"
      default:
        return "bg-[#dcfce7] text-[#166534]"
    }
  }

  return (
    <div className="flex flex-col size-full overflow-hidden bg-[#edf1f3]">
      {/* Header */}
      <header className="bg-white border-b border-[#dce4e7] px-4 md:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <img src={imgWarehouse} alt="" className="size-8" />
          <div>
            <h1
              className="font-extrabold text-[#16343f] text-xl md:text-2xl"
              style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800 }}
            >
              Lotes y Caducidades
            </h1>
            <p
              className="text-[12px] text-[#607078]"
              style={{ fontFamily: "'Inter',sans-serif" }}
            >
              Control de inventario por lote · Tehuacan-1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={importInputRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={handleImportFile}
            className="hidden"
            aria-label="Archivo de inventario"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={!fsServices || importing}
            className="bg-[#f2b84b] hover:bg-[#e0a83f] disabled:opacity-50 text-[#16343f] font-bold h-10 px-4 rounded-[10px] transition-colors"
          >
            Importar inventario
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="bg-[#16343f] hover:bg-[#1e4456] disabled:opacity-50 text-white font-bold h-10 px-4 rounded-[10px] transition-colors flex items-center gap-2"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={syncing ? "animate-spin" : ""}
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </button>
          <button
            onClick={exportCSV}
            className="bg-white border border-[#dce4e7] hover:bg-[#f4f7f8] text-[#16343f] font-bold h-10 px-4 rounded-[10px] transition-colors flex items-center gap-2"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
          >
            <img src={imgDownload} alt="" className="size-4" />
            Exportar CSV
          </button>
        </div>
      </header>

      {importPreview && (
        <section
          className="bg-white border-b border-[#dce4e7] px-4 md:px-6 py-4 space-y-3"
          aria-label="Vista previa de importación"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-[#16343f]">
                Vista previa: {importFileName}
              </h2>
              <p className="text-sm text-[#607078]">
                {importPreview.validRows.length} filas válidas ·{" "}
                {importPreview.errors.length} con error
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={importing}
                onClick={() => handleImportAction("REPLACE")}
                className="px-3 py-2 rounded bg-[#16343f] text-white font-bold"
              >
                Sustituir
              </button>
              <button
                disabled={importing}
                onClick={() => handleImportAction("ADD")}
                className="px-3 py-2 rounded bg-[#16845b] text-white font-bold"
              >
                Sumar
              </button>
              <button
                disabled={importing}
                onClick={() => handleImportAction("DISCARD")}
                className="px-3 py-2 rounded border border-[#dce4e7] font-bold"
              >
                Descartar
              </button>
            </div>
          </div>
          {importError && (
            <p role="alert" className="text-sm text-[#b91c1c]">
              {importError}
            </p>
          )}
          {importPreview.errors.length > 0 && (
            <ul className="text-sm text-[#b91c1c] max-h-24 overflow-auto">
              {importPreview.errors.slice(0, 20).map((error) => (
                <li key={error.rowNumber}>
                  Fila {error.rowNumber}: {error.message}
                </li>
              ))}
            </ul>
          )}
          <div className="overflow-auto max-h-48">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Fila</th>
                  <th className="text-left">Almacén</th>
                  <th className="text-left">Producto</th>
                  <th className="text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.validRows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.warehouseId}</td>
                    <td>{row.productId}</td>
                    <td className="text-right">{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Toolbar */}
      <div className="bg-white border-b border-[#dce4e7] px-4 md:px-6 py-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#607078]"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Buscar producto, lote, mes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#f4f7f8] border border-[#dce4e7] rounded-[10px] text-[13px] placeholder:text-[#99aab5] focus:border-[#f2b84b] focus:outline-none focus:ring-1 focus:ring-[#f2b84b]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 bg-[#f4f7f8] border border-[#dce4e7] rounded-[10px] text-[12px] focus:border-[#f2b84b] focus:outline-none focus:ring-1 focus:ring-[#f2b84b]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            <option value="all">Todos los estados</option>
            <option value="ok">✓ OK</option>
            <option value="proximo">⚠ Próximo (≤30d)</option>
            <option value="vencido">✗ Vencido</option>
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 bg-[#f4f7f8] border border-[#dce4e7] rounded-[10px] text-[12px] focus:border-[#f2b84b] focus:outline-none focus:ring-1 focus:ring-[#f2b84b]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            <option value="all">Todos los meses</option>
            {monthsAvailable.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats bar */}
      <div
        className="bg-white border-b border-[#dce4e7] px-4 md:px-6 py-2 flex flex-wrap gap-4 text-[12px]"
        style={{ fontFamily: "'Inter',sans-serif" }}
      >
        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#dcfce7] text-[#166534]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#166534]"></span> OK:{" "}
          {lotes.filter((l) => l.status === "ok").length}
        </span>
        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#fef3c7] text-[#92400e]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#92400e]"></span>{" "}
          Próximos: {lotes.filter((l) => l.status === "proximo").length}
        </span>
        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#fee2e2] text-[#b91c1c]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#b91c1c]"></span>{" "}
          Vencidos: {lotes.filter((l) => l.status === "vencido").length}
        </span>
        <span className="text-[#607078]">Total: {lotes.length} lotes</span>
        {lastSync && (
          <span className="text-[#99aab5] ml-auto">
            Última sync: {lastSync.toLocaleTimeString("es-MX")}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-[#607078]">
            <svg
              className="animate-spin h-8 w-8 text-[#16343f]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
            </svg>
            <span className="ml-3">Cargando lotes...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <img src={imgAlert} alt="" className="size-12 opacity-50" />
            <p className="text-[#c54b45] font-bold">{error}</p>
            <button
              onClick={loadLotes}
              className="bg-[#16343f] text-white px-4 py-2 rounded-[10px] font-bold"
              style={{ fontFamily: "'Inter',sans-serif" }}
            >
              Reintentar
            </button>
          </div>
        ) : filteredLotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3 text-[#607078]">
            <img src={imgCalendar} alt="" className="size-16 opacity-30" />
            <p className="font-medium">No hay lotes que coincidan</p>
            <p className="text-[13px]">
              Ajusta los filtros o busca otro término
            </p>
          </div>
        ) : (
          <div className="rounded-[16px] bg-white shadow-[0px_4px_12px_rgba(22,52,63,0.07)] overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full text-left"
                style={{ fontFamily: "'Inter',sans-serif" }}
              >
                <thead className="bg-[#f8fafb] border-b border-[#dce4e7]">
                  <tr>
                    {[
                      { key: "productName", label: "Producto" },
                      { key: "lot", label: "Lote" },
                      { key: "expiryDate", label: "Caducidad" },
                      { key: "monthKey", label: "Mes" },
                      { key: "cajas", label: "Cajas", align: "right" },
                      { key: "status", label: "Estado" },
                      { key: "diasParaCaducar", label: "Días", align: "right" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => {
                          if (sortField === col.key)
                            setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                          else {
                            setSortField(col.key as SortField)
                            setSortDir("asc")
                          }
                        }}
                        className={`px-4 py-3 text-[11px] font-bold uppercase text-[#607078] cursor-pointer select-none hover:bg-[#edf1f3] ${
                          col.align === "right" ? "text-right" : ""
                        }`}
                        style={{
                          fontFamily: "'Inter',sans-serif",
                          fontWeight: 700,
                        }}
                      >
                        <div className="flex items-center gap-1 justify-center">
                          {col.label}
                          {sortField === col.key && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              {sortDir === "asc" ? (
                                <path d="M18 15l-6-6-6 6" />
                              ) : (
                                <path d="M6 9l6 6 6-6" />
                              )}
                            </svg>
                          )}
                        </div>
                      </th>
                    ))}
                    <th
                      className="px-4 py-3 text-[11px] font-bold uppercase text-[#607078]"
                      style={{
                        fontFamily: "'Inter',sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLotes.map((lote) => (
                    <tr
                      key={lote.id}
                      className={`border-b border-[#edf1f3] hover:bg-[#f8fafb] transition-colors ${
                        lote.status === "vencido"
                          ? "bg-[#fffaf9]"
                          : lote.status === "proximo"
                            ? "bg-[#fffdf5]"
                            : ""
                      }`}
                    >
                      <td
                        className="px-4 py-3 text-[13px] text-[#16343f] font-medium"
                        style={{
                          fontFamily: "'Inter',sans-serif",
                          fontWeight: 500,
                        }}
                      >
                        {lote.productName}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#36434a] font-mono">
                        {lote.lot}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#36434a]">
                        {lote.expiryDate
                          ?.toDate?.()
                          .toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#36434a] font-medium">
                        {lote.monthKey}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingId === lote.id ? (
                          <input
                            type="number"
                            min="0"
                            value={editCajas}
                            onChange={(e) => setEditCajas(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleSave(lote)
                            }
                            onBlur={() => handleCancel()}
                            autoFocus
                            className="w-20 px-2 py-1 border border-[#f2b84b] rounded-[6px] text-[13px] text-right focus:outline-none focus:ring-1 focus:ring-[#f2b84b]"
                            style={{ fontFamily: "'Inter',sans-serif" }}
                          />
                        ) : (
                          <span
                            className="font-medium text-[#16343f]"
                            style={{
                              fontFamily: "'Inter',sans-serif",
                              fontWeight: 600,
                            }}
                          >
                            {lote.cajas.toLocaleString("es-MX")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(lote.status)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono text-[13px] font-bold ${getStatusColor(lote.status)}`}
                        >
                          {lote.diasParaCaducar >= 0
                            ? lote.diasParaCaducar
                            : Math.abs(lote.diasParaCaducar)}
                        </span>
                        <span className="ml-1 text-[11px] text-[#99aab5]">
                          {lote.diasParaCaducar >= 0 ? "días" : "vencido"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {editingId === lote.id ? (
                            <>
                              <button
                                onClick={() => handleSave(lote)}
                                disabled={syncing}
                                className="p-1.5 text-[#16845b] hover:bg-[#dcfce7] rounded-[6px] transition-colors"
                                title="Guardar"
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </button>
                              <button
                                onClick={handleCancel}
                                className="p-1.5 text-[#607078] hover:bg-[#edf1f3] rounded-[6px] transition-colors"
                                title="Cancelar"
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleEdit(lote)}
                              className="p-1.5 text-[#16343f] hover:bg-[#edf1f3] rounded-[6px] transition-colors"
                              title="Editar cajas"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLotes.length > 50 && (
              <div
                className="px-4 py-3 border-t border-[#dce4e7] text-[12px] text-[#607078]"
                style={{ fontFamily: "'Inter',sans-serif" }}
              >
                Mostrando {filteredLotes.length} de {lotes.length} lotes
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
