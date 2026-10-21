import { useState, useRef, useEffect } from "react"
import { Select, type Proveedor, type Producto } from "./Configuracion"
import { useOcr } from "../hooks/useOcr"
import { isFeatureEnabled } from "@/config/featureFlags"
import { createFirestoreServices } from "@/services/firestore"
import { db, storage } from "@/lib/firebase"
import { uploadInvoicePreviewWithMetadata } from "@/services/invoiceEvidence"
import {
  getReceptionOcrDocumentType,
  mapOcrProductsToReceptionForm,
  mapReceptionFormToPersistence,
} from "@/services/receptionMappers"
import { useAuthorization } from "@/hooks/useAuthorization"
import { WAREHOUSE_IDS } from "@/config/warehouses"
import {
  ReceptionSubmission,
  type ReceptionSubmissionStatus,
} from "@/domains/reception/receptionSubmission"
import { Panel, TouchTarget } from "@/components/ui"

const assetPathPrefix = "/assets"
const imgFileUp = `${assetPathPrefix}/928ba.svg`
const imgArrowRight = `${assetPathPrefix}/55de6.svg`

const ORG_ID = "org_exepa_001"

const catalogoConversiones = [
  { producto: "AGUA MINERAL 600 ML", piezasPorCaja: 24, cajasPorTarima: 10 },
  { producto: "COCA COLA 600ML C/24", piezasPorCaja: 24, cajasPorTarima: 10 },
  {
    producto: "SABRITAS CLÁSICAS 45G C/30",
    piezasPorCaja: 30,
    cajasPorTarima: 12,
  },
  { producto: "LALA LECHE 1L C/12", piezasPorCaja: 12, cajasPorTarima: 8 },
  { producto: "BIMBO PAN BLANCO 680G", piezasPorCaja: 10, cajasPorTarima: 15 },
  {
    producto: "GAMESA GALLETAS SALADAS 90G C/20",
    piezasPorCaja: 20,
    cajasPorTarima: 10,
  },
  { producto: "PEPSI 2L C/6", piezasPorCaja: 6, cajasPorTarima: 20 },
]

const conversionProps = catalogoConversiones

interface Props {
  onBack: () => void
  onContinue: (formData: {
    hasOC: boolean
    ocFolio: string
    tarimas: string
    proveedor: string
    proveedorLogistico: string
    receptionId?: string
    productos?: Array<{
      productId: string | null
      codigo: string | null
      nombre: string
      unidad: string | null
      cantidad: number
      importe: number
      estadoMatch: "confirmado" | "sugerido" | "manual"
    }>
    conversionesTabla?: Array<{
      producto: string
      productId: string | null
      codigo: string
      unidades: number
      unidad: string
      piezasPorCaja: number
      cajasPorTarima: number
      cajas: number
      tarimas: number
      stickers: number
    }>
  }) => void
  initialData?: {
    hasOC: boolean
    ocFolio: string
    tarimas: string
    proveedor: string
    proveedorLogistico: string
    receptionId?: string
    conversionesTabla?: Array<{
      producto: string
      productId?: string | null
      codigo: string
      unidades: number
      unidad: string
      piezasPorCaja: number
      cajasPorTarima: number
      cajas: number
      tarimas: number
      stickers: number
    }>
    productos?: Array<{
      productId: string | null
      codigo: string | null
      nombre: string
      unidad: string | null
      cantidad: number
      importe: number
      estadoMatch: "confirmado" | "sugerido" | "manual"
    }>
  }
  catalogos: { proveedores: Proveedor[]; productos: Producto[] }
  catalogosStatus?: { loading: boolean; error: Error | null }
  conversiones?: Array<{
    producto: string
    piezasPorCaja: number
    cajasPorTarima: number
  }>
}
type ReceptionFormData = Parameters<Props["onContinue"]>[0]

export default function NuevaRecepcionStep1({
  ...props
}: Props) {
  if (props.catalogosStatus?.loading) {
    return (
      <div
        className="flex flex-col gap-4 p-6"
        style={{ fontFamily: "'Inter',sans-serif" }}
      >
        <div
          className="flex items-center gap-3 text-[#607078]"
          style={{ fontFamily: "'Inter',sans-serif" }}
        >
          <div className="size-6 border-2 border-[#3276a8] border-t-transparent rounded-full animate-spin" />
          <span className="text-base font-medium">Cargando catálogos…</span>
        </div>
      </div>
    )
  }

  return <NuevaRecepcionStep1Form {...props} />
}

function NuevaRecepcionStep1Form({
  onContinue,
  onBack,
  initialData,
  catalogos,
  catalogosStatus,
  conversiones,
}: Props) {
  const [hasOC, setHasOC] = useState<boolean | null>(initialData?.hasOC ?? true)
  const [showNoOCNotice, setShowNoOCNotice] = useState(false)
  const [ocFolio, setOcFolio] = useState(initialData?.ocFolio ?? "OC-24891")
  const [tarimas, setTarimas] = useState(initialData?.tarimas ?? "20")
  const [proveedor, setProveedor] = useState(
    initialData?.proveedor ??
      catalogos.proveedores.find((p) => p.tipo === "mercancia")?.nombre ??
      "Distribuidora del Norte",
  )
  const [proveedorLogistico, setProveedorLogistico] = useState(
    initialData?.proveedorLogistico ?? "",
  )

  const { runOcr, loading, result, error, clear, previewDataUrl } = useOcr()
  const fileRef = useRef<HTMLInputElement>(null)

  const { user, canQuery } = useAuthorization()
  const useFirestore =
    isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery
  const [fsServices, setFsServices] =
    useState<ReturnType<typeof createFirestoreServices> | null>(null)
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [creating, setCreating] = useState(false)
  const [submissionStatus, setSubmissionStatus] =
    useState<ReceptionSubmissionStatus>("idle")
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const operationIdRef = useRef<string | null>(null)
  const submissionRef = useRef<ReceptionSubmission<{ id: string }> | null>(null)
  const submissionFormRef = useRef<ReceptionFormData | null>(null)
  const continuedRef = useRef(false)

  function continueOnce(data: ReceptionFormData) {
    if (continuedRef.current) return
    continuedRef.current = true
    onContinue(data)
  }

  function getOperationId() {
    if (!operationIdRef.current) {
      const randomPart = Array.from(
        crypto.getRandomValues(new Uint8Array(16)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("")
      operationIdRef.current = `REC-${Date.now()}-${randomPart}`
    }
    return operationIdRef.current
  }

  // NUEVO: Tabla de conversiones y stickers calculados
  const [conversionesTabla, setConversionesTabla] = useState<Array<{
    producto: string
    productId?: string | null
    codigo: string
    unidades: number
    unidad: string
    piezasPorCaja: number
    cajasPorTarima: number
    cajas: number
    tarimas: number
    stickers: number // 4 stickers por tarima (2 caras × 2 copias)
  }>>((initialData?.conversionesTabla ?? []).map((conversion) => ({
    ...conversion,
    productId: conversion.productId ?? null,
  })))

  function matchProducts() {
    const ocrProducts = result?.parsed.productos
    if (!ocrProducts?.length && initialData?.productos) {
      return initialData.productos
    }
    return mapOcrProductsToReceptionForm(ocrProducts ?? [], catalogos.productos)
  }

  function calcularConversionesYStickers() {
    const matchedProducts = matchProducts()
    const tabla = matchedProducts
      .filter((p) => p.estadoMatch === "confirmado" && p.productId)
      .map((p) => {
        // Buscar conversión para este producto
        const conversion = conversionProps.find(
          (c) =>
            c.producto.trim().toUpperCase() === p.nombre.trim().toUpperCase(),
        )

        const piezasPorCaja = conversion?.piezasPorCaja || 24
        const cajasPorTarima = conversion?.cajasPorTarima || 10

        let cajas = p.cantidad
        if (p.unidad?.toLowerCase().includes("pieza")) {
          cajas = Math.ceil(p.cantidad / piezasPorCaja)
        }

        const tarimas = Math.ceil(cajas / cajasPorTarima)
        const stickers = tarimas * 4 // 4 stickers por tarima (2 caras × 2 copias)

        return {
          producto: p.nombre,
          productId: p.productId,
          codigo: p.codigo || "—",
          unidades: p.cantidad,
          unidad: p.unidad || "unidades",
          piezasPorCaja,
          cajasPorTarima,
          cajas,
          tarimas,
          stickers,
        }
      })

    setConversionesTabla(tabla)
    return tabla
  }

  // Initialize Firestore services
  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID)
      setFsServices(services)
      setFirestoreReady(true)
    }
  }, [useFirestore])

  const proveedoresMercancia = catalogos.proveedores
    .filter((p) => p.tipo === "mercancia")
    .map((p) => ({ value: p.nombre, label: p.nombre }))
  const proveedoresLogistica = catalogos.proveedores
    .filter((p) => p.tipo === "logistica")
    .map((p) => ({ value: p.nombre, label: p.nombre }))

  function selectHasOC(value: boolean) {
    setHasOC(value)
    if (!value) {
      setShowNoOCNotice(true)
      setTimeout(() => setShowNoOCNotice(false), 4000)
    } else {
      setShowNoOCNotice(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await runOcr(file, getReceptionOcrDocumentType(hasOC ?? true))
      // Calcular conversiones y stickers después del OCR
      setTimeout(() => calcularConversionesYStickers(), 100)
    } catch {
      // error handled by hook
    }
  }

  async function handleContinue() {
    const matchedProducts = matchProducts()
    // Calcular conversiones y stickers antes de continuar
    const tablaConversiones = calcularConversionesYStickers()

    // Calcular total de tarimas basado en conversiones
    const totalTarimasCalculado = tablaConversiones.reduce(
      (a, b) => a + b.tarimas,
      0,
    )
    const tarimasFinal =
      totalTarimasCalculado > 0 ? totalTarimasCalculado.toString() : tarimas

    const formData = {
      hasOC: hasOC ?? true,
      ocFolio,
      tarimas: tarimasFinal,
      proveedor,
      proveedorLogistico,
      productos: matchedProducts,
      conversionesTabla: tablaConversiones,
    }

    // A reception already created by the prior Step 1 mount must never be
    // created again when returning from Step 2.
    if (initialData?.receptionId) {
      continueOnce({ ...formData, receptionId: initialData.receptionId })
      return
    }

    // If Firestore enabled, create reception in Firestore first
    if (useFirestore && firestoreReady && fsServices) {
      setCreating(true)
      setSubmissionError(null)
      const operationId = getOperationId()
      const supplierId =
        catalogos.proveedores.find((p) => p.nombre === proveedor)?.id ||
        "prov_norte"
      const warehouseId = WAREHOUSE_IDS.NORTH
      try {
        if (!user) {
          throw new Error("Authenticated user required to create a reception")
        }

        if (!submissionRef.current) {
          const persistence = mapReceptionFormToPersistence({
            products: matchedProducts,
            warehouseId,
            supplierId,
            actorUserId: user.uid,
            operationId,
          })
          submissionFormRef.current = formData
          submissionRef.current = new ReceptionSubmission(operationId, setSubmissionStatus)
          const createAttempt = (stableOperationId: string) =>
            fsServices.receptions.createReception(
              persistence.reception,
              persistence.lines,
              user.uid,
              stableOperationId,
            )
          const evidenceStorage = storage
          const evidenceDataUrl = previewDataUrl
          const evidenceAttempt =
            evidenceDataUrl
              ? async (reception: { id: string }, evidenceOperationId: string) => {
                  if (!evidenceStorage) {
                    throw new Error("Firebase Storage is unavailable")
                  }
                  await uploadInvoicePreviewWithMetadata(
                    evidenceStorage,
                    reception.id,
                    evidenceDataUrl,
                    (evidence) =>
                      fsServices.receptions.updateReception(
                        reception.id,
                        {
                          invoicePreviewPath: evidence.path,
                          invoicePreviewUrl: evidence.url,
                        },
                        user.uid,
                        `${evidenceOperationId}:metadata`,
                      ),
                  )
                }
              : undefined

          const { reception } = await submissionRef.current.submit(
            createAttempt,
            evidenceAttempt,
          )
          continueOnce({ ...formData, receptionId: reception.id })
          return
        }

        const { reception } = await submissionRef.current.submit(
          () => Promise.reject(new Error("Reception submission is unavailable")),
        )
        continueOnce({ ...submissionFormRef.current!, receptionId: reception.id })
        return
      } catch (e) {
        console.error("Firestore reception submission failed:", e)
        setSubmissionError(
          submissionRef.current?.receptionId
            ? "La recepción ya se creó, pero no se pudo guardar la evidencia. Reintentá la evidencia o continuá sin ella."
            : "No se pudo confirmar la creación de la recepción. Reintentá; se conservará la misma clave para evitar duplicados.",
        )
        return
      } finally {
        setCreating(false)
      }
    }

    continueOnce(formData)
  }

  return (
    <div className="flex flex-col gap-4 md:gap-[18px] p-4 md:p-7 size-full overflow-auto">
      {catalogosStatus?.loading && (
        <p className="text-[#3276a8] text-xs" role="status">
          Actualizando catálogos…
        </p>
      )}
      {catalogosStatus?.error && (
        <p className="text-[#8e592e] text-xs" role="status">
          No se pudo actualizar un catálogo. Se mantiene el catálogo local
          disponible.
        </p>
      )}
      <div className="bg-[#dce4e7] flex flex-col h-2 items-start overflow-hidden rounded-full w-full">
        <div
          className="bg-[#f2b84b] h-2 rounded-full"
          style={{ width: "33%" }}
        />
      </div>

      <fieldset
        disabled={Boolean(initialData?.receptionId) || submissionRef.current !== null}
        className="contents"
      >
      <Panel className="flex flex-col gap-4 md:gap-[14px] p-4 md:p-5 w-full">
        <p
          className="font-extrabold text-[#172126] text-2xl md:text-[28px]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          ¿Tienes una orden de compra?
        </p>
        <p
          className="text-[#607078] text-base md:text-[15px]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
        >
          La usaremos para relacionar las tarimas y su evidencia.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <TouchTarget
            type="button"
            onClick={() => selectHasOC(true)}
            className={`flex flex-col items-center overflow-hidden p-4 rounded-[14px] flex-1 min-w-0 cursor-pointer transition-colors touch-target ${
              hasOC === true
                ? "bg-[#16343f]"
                : "bg-white border border-[#dce4e7] hover:bg-[#f8fafb]"
            }`}
          >
            <p
              className={`text-base md:text-lg whitespace-nowrap ${
                hasOC === true ? "text-white" : "font-bold text-[#16343f]"
              }`}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: hasOC === true ? 400 : 700,
              }}
            >
              {hasOC === true ? "✓ Sí, tengo OC" : "Sí, tengo OC"}
            </p>
          </TouchTarget>

          <TouchTarget
            type="button"
            onClick={() => selectHasOC(false)}
            className={`flex flex-col items-center overflow-hidden p-4 rounded-[14px] flex-1 min-w-0 cursor-pointer transition-colors touch-target ${
              hasOC === false
                ? "bg-[#16343f]"
                : "bg-white border border-[#dce4e7] hover:bg-[#f8fafb]"
            }`}
          >
            <p
              className={`text-base md:text-lg whitespace-nowrap ${
                hasOC === false ? "text-white" : "font-bold text-[#16343f]"
              }`}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: hasOC === false ? 400 : 700,
              }}
            >
              {hasOC === false ? "✓ No tengo OC" : "No tengo OC"}
            </p>
          </TouchTarget>
        </div>

        {showNoOCNotice && (
          <div className="bg-[#fff8e6] border border-[#f2b84b] flex gap-3 items-start p-[14px] rounded-[12px] w-full">
            <span className="text-[#f2b84b] text-[18px] shrink-0">⚠</span>
            <p
              className="text-[#7a5c00] text-sm md:text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
            >
              Sin OC, la recepción se registrará sin folio. Podrás asignarlo
              después.
            </p>
          </div>
        )}

        {hasOC === true && (
          <div className="flex flex-col gap-3 md:gap-[7px] items-start w-full">
            <p
              className="font-bold text-[#607078] text-sm md:text-[13px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Folio de orden de compra
            </p>
            <div className="bg-white border border-[#dce4e7] flex flex-col items-start min-h-12 px-3 md:px-[14px] py-3 rounded-lg w-full">
              <p
                className="font-semibold text-[#172126] text-base md:text-[15px] w-full truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
              >
                {ocFolio}
              </p>
            </div>
            <p
              className="text-[#607078] text-xs md:text-[11px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              Captura manual
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:gap-4 w-full">
          <div className="flex flex-col gap-2 md:gap-3 w-full">
            <label
              htmlFor="reception-supplier"
              className="font-bold text-[#607078] text-sm md:text-base"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Proveedor de mercancía
            </label>
            <Select
              value={proveedor}
              onChange={setProveedor}
              options={proveedoresMercancia}
              placeholder="Seleccionar proveedor"
              id="reception-supplier"
              name="supplier"
            />
          </div>
          <div className="flex flex-col gap-2 md:gap-3 w-full">
            <label
              htmlFor="reception-logistics-supplier"
              className="font-bold text-[#607078] text-sm md:text-base"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Proveedor logístico
            </label>
            <Select
              value={proveedorLogistico}
              onChange={setProveedorLogistico}
              options={proveedoresLogistica}
              placeholder="Seleccionar transportista"
              id="reception-logistics-supplier"
              name="logisticsSupplier"
            />
          </div>
        </div>

        <div className="bg-[#e7f0f2] border border-[#3276a8] flex gap-3 md:gap-[14px] items-center p-3 md:p-[18px] rounded-[14px] w-full">
          <img
            alt=""
            className="size-7 md:size-[30px] shrink-0"
            src={imgFileUp}
          />
          <div className="flex flex-col gap-1 md:gap-[3px] items-start min-w-0">
            <p
              className="font-bold text-[#172126] text-base md:text-[15px] truncate"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Subir evidencia PDF o JPEG
            </p>
            <p
              className="text-[#607078] text-sm md:text-[13px] truncate"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              orden_OC-24891.pdf · 1.8 MB
            </p>
          </div>
        </div>

        {/* OCR Upload & Result */}
        <div className="bg-[#f4f8fc] border border-[#b6d4e7] flex flex-col gap-3 p-3 md:p-4 rounded-[14px] w-full">
          <p
            className="font-bold text-[#172126] text-[13px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            OCR Automático (Factura/OC)
          </p>
          <p
            className="text-[#607078] text-[11px]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Sube PDF, JPG o PNG. Se extraerán todas las líneas de productos y se
            generará una copia ligera para visualizar e imprimir.
          </p>

          <input
            ref={fileRef}
            type="file"
            id="reception-evidence-file"
            name="evidenceFile"
            aria-label="Cargar evidencia PDF o imagen"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={handleFileUpload}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading || creating}
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
                {loading
                  ? "Procesando documento..."
                  : creating
                    ? "Creando recepción..."
                    : "Seleccionar factura (PDF/JPG/PNG)"}
              </p>
              <p
                className="text-[#607078] text-[11px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Factura u OC · Se genera copia comprimida
              </p>
            </div>
          </button>

          {error && (
            <div
              className="bg-[#fce9e7] border border-[#f5c6c2] rounded-[10px] px-3 py-2 w-full text-[12px] text-[#c0392b]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Error: {error}
            </div>
          )}

          {result && (
            <div
              className="bg-[#e8f2f7] border border-[#b6d4e7] rounded-[10px] px-3 py-2 w-full text-[12px] text-[#3276a8]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              <strong>OCR detectado:</strong>
              {result.parsed.folio && (
                <span> Folio: {result.parsed.folio}</span>
              )}
              {result.parsed.fecha && (
                <span> Fecha: {result.parsed.fecha}</span>
              )}
              {result.parsed.proveedor && (
                <span> Proveedor: {result.parsed.proveedor}</span>
              )}
              {result.parsed.total && (
                <span> Total: ${result.parsed.total}</span>
              )}
              {result.parsed.productos && (
                <span> Productos: {result.parsed.productos.length}</span>
              )}
              <button onClick={clear} className="ml-2 underline text-[11px]">
                Limpiar
              </button>
            </div>
          )}

          {result?.preview?.dataUrl && (
            <div className="bg-white border border-[#dce4e7] rounded-[10px] p-2 w-full">
              <p className="text-[#607078] text-[11px] mb-2">
                Copia ligera lista para visualizar e imprimir
              </p>
              <img
                src={result.preview.dataUrl}
                alt="Vista previa comprimida de la factura"
                className="max-h-64 w-full object-contain rounded"
              />
            </div>
          )}

          {!!result?.parsed?.productos?.length && (
            <div className="bg-white border border-[#dce4e7] rounded-[10px] overflow-auto w-full">
              <table className="w-full text-[11px]">
                <thead className="bg-[#f4f8fc] text-left text-[#607078]">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Código</th>
                    <th className="p-2">Producto relacionado</th>
                    <th className="p-2">U.med.</th>
                    <th className="p-2">Unidades</th>
                    <th className="p-2">Precio</th>
                    <th className="p-2">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {result.parsed.productos.map((line) => {
                    const matched = matchProducts().find(
                      (item) =>
                        item.codigo === (line.codigo?.toUpperCase() || null) &&
                        item.cantidad === line.cantidad,
                    )
                    return (
                      <tr
                        key={line.linea}
                        className="border-t border-[#eef2f4]"
                      >
                        <td className="p-2">{line.linea}</td>
                        <td className="p-2">{line.codigo || "—"}</td>
                        <td className="p-2">
                          {matched?.estadoMatch === "confirmado"
                            ? `✓ ${matched.nombre}`
                            : `⚠ ${line.nombre}`}
                        </td>
                        <td className="p-2">{line.unidad || "—"}</td>
                        <td className="p-2">{line.cantidad}</td>
                        <td className="p-2">${line.precio.toFixed(2)}</td>
                        <td className="p-2">${line.importe.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {result?.parsed?.folio && (
            <div className="bg-[#e2f5ec] border border-[#16845b] rounded-[10px] px-3 py-2 w-full">
              <p
                className="text-[#16845b] text-[12px] font-bold"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                ✓ Folio detectado: {result.parsed.folio} — ¿Usar este folio?
              </p>
              <button
                onClick={() => setOcFolio(result.parsed.folio!)}
                className="mt-1 bg-[#16845b] text-white text-[11px] font-bold px-3 py-1 rounded-[8px] touch-target"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Usar folio detectado
              </button>
            </div>
          )}

          {/* NUEVO: Tabla de conversiones y stickers calculados */}
          {conversionesTabla.length > 0 && (
            <div className="bg-[#f0f5fa] border border-[#b6d4e7] rounded-[14px] p-4 w-full">
              <p
                className="font-extrabold text-[#172126] text-[14px] mb-3"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                📊 Conversiones y Stickers Calculados
              </p>
              <div className="overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[#e7f0f2] text-left text-[#607078]">
                    <tr>
                      <th className="p-2">Producto</th>
                      <th className="p-2">Código</th>
                      <th className="p-2">Unidades</th>
                      <th className="p-2">U. Medida</th>
                      <th className="p-2">Pz/Caja</th>
                      <th className="p-2">Cajas/Tarima</th>
                      <th className="p-2">Cajas</th>
                      <th className="p-2">Tarimas</th>
                      <th className="p-2">Stickers (4×tarima)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversionesTabla.map((row, i) => (
                      <tr key={i} className="border-t border-[#eef2f4]">
                        <td className="p-2 font-bold text-[#172126]">
                          {row.producto}
                        </td>
                        <td className="p-2 text-[#607078]">{row.codigo}</td>
                        <td className="p-2 text-[#607078]">
                          {row.unidades} {row.unidad}
                        </td>
                        <td className="p-2 text-[#607078]">{row.unidad}</td>
                        <td className="p-2 text-[#3276a8] font-bold">
                          {row.piezasPorCaja}
                        </td>
                        <td className="p-2 text-[#3276a8] font-bold">
                          {row.cajasPorTarima}
                        </td>
                        <td className="p-2 font-bold text-[#172126]">
                          {row.cajas}
                        </td>
                        <td className="p-2 font-bold text-[#f2b84b]">
                          {row.tarimas}
                        </td>
                        <td className="p-2 font-extrabold text-[#c54b45]">
                          {row.stickers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#e7f0f2]">
                      <td className="p-2 font-bold text-[#172126]">TOTAL</td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2 font-bold">
                        {conversionesTabla.reduce((a, b) => a + b.cajas, 0)}
                      </td>
                      <td className="p-2 font-bold text-[#f2b84b]">
                        {conversionesTabla.reduce((a, b) => a + b.tarimas, 0)}
                      </td>
                      <td className="p-2 font-extrabold text-[#c54b45]">
                        {conversionesTabla.reduce((a, b) => a + b.stickers, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p
                className="text-[#3276a8] text-[11px] mt-2"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                💡 Los stickers incluyen: 2 caras × 2 copias = 4 stickers por
                tarima
              </p>
            </div>
          )}
        </div>
      </Panel>

      </fieldset>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-0 w-full">
        <div className="flex flex-col gap-1 md:gap-[3px] items-start w-full sm:w-auto">
          <p
            className="font-bold text-[#607078] text-xs md:text-[11px] uppercase"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            FECHA Y HORA AUTOMÁTICAS
          </p>
          <p
            className="font-bold text-[#172126] text-base md:text-[15px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            19 Sep 2026 · 09:42
          </p>
        </div>
        {submissionError && (
          <p role="alert" className="text-sm text-red-700">
            {submissionError}
          </p>
        )}
        <button
          onClick={handleContinue}
          disabled={creating}
          className="bg-[#16343f] border border-[#16343f] flex gap-2 h-11 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target w-full sm:w-auto"
        >
          <img alt="" className="size-5 md:size-[18px]" src={imgArrowRight} />
          <p
            className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            {creating
              ? submissionStatus === "uploading_evidence"
                ? "Guardando evidencia..."
                : "Creando recepción..."
              : submissionStatus === "evidence_failed"
                ? "Reintentar evidencia"
                : submissionStatus === "create_failed"
                  ? "Reintentar creación"
                : "Continuar"}
          </p>
        </button>
        {submissionStatus === "evidence_failed" && submissionRef.current && (
          <button
            type="button"
            disabled={creating}
            className="text-sm underline"
            onClick={() =>
              continueOnce({
                ...submissionFormRef.current!,
                receptionId: submissionRef.current!.receptionId!,
              })
            }
          >
            Continuar sin evidencia
          </button>
        )}
      </div>
    </div>
  )
}
