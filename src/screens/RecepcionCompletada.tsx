import { useState, useEffect } from "react"
import { isFeatureEnabled } from "@/config/featureFlags"
import { useDocument, useCollection } from "@/hooks/useFirestore"
import { db } from "@/lib/firebase"
import { createFirestoreServices } from "@/services/firestore"
import { useOfflineQueue } from "@/hooks/useFirestore"
import { useAuthorization } from "@/hooks/useAuthorization"

const assetPathPrefix = "/assets"
const imgWarehouse = `${assetPathPrefix}/8c4fa.svg`
const imgIndicador = `${assetPathPrefix}/08d70.svg`
const imgQrCode = `${assetPathPrefix}/60da5.svg`
const imgQrCodeBtn = `${assetPathPrefix}/41680.svg`
const imgPrinter = `${assetPathPrefix}/f1a67.svg`
const imgEye = `${assetPathPrefix}/13d24.svg`

const ORG_ID = "org_exepa_001"

interface Props {
  onHome: () => void
  onPrint: () => void
  currentReception: {
    ocFolio: string
    tarimas: number
    proveedor: string
    proveedorLogistico: string
    receptionId?: string
  } | null
}

export default function RecepcionCompletada({
  onHome,
  onPrint,
  currentReception,
}: Props) {
  const { canQuery } = useAuthorization()
  const useFirestore =
    isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery
  const [tarimasCount, setTarimasCount] = useState(
    currentReception?.tarimas ?? 20,
  )
  const [incidencias, setIncidencias] = useState(0)
  const [fsServices, setFsServices] =
    useState<ReturnType<typeof createFirestoreServices> | null>(null)
  const [firestoreReady, setFirestoreReady] = useState(false)

  // Offline queue
  const { enqueue, isOnline } = useOfflineQueue(db, ORG_ID)

  // Initialize Firestore services
  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID)
      setFsServices(services)
      setFirestoreReady(true)
    }
  }, [useFirestore])

  // Load reception from Firestore if enabled
  const receptionId = currentReception?.receptionId
  const docPath = receptionId
    ? `organizations/${ORG_ID}/receptions/${receptionId}`
    : null

  const { data: receptionDoc, loading } = useDocument(db, docPath || "", {
    enabled: useFirestore && !!receptionId,
    mapFn: (snap) => snap.data(),
  })

  // Load pallets count
  const { data: pallets, loading: palletsLoading } = useCollection<any>(
    db,
    receptionId
      ? `organizations/${ORG_ID}/receptions/${receptionId}/pallets`
      : "",
    { enabled: useFirestore && !!receptionId },
  )

  useEffect(() => {
    setTarimasCount(pallets.length || currentReception?.tarimas || 20)
    setIncidencias(pallets.filter((p) => p.status === "BLOCKED").length)
  }, [pallets, currentReception?.tarimas])

  // Fallback data
  const ocFolio = currentReception?.ocFolio ?? "OC-24891"
  const tarimasTotal = currentReception?.tarimas ?? 20
  const proveedor = currentReception?.proveedor ?? "Distribuidora del Norte"
  const proveedorLogistico =
    currentReception?.proveedorLogistico ?? "Logística Veloz"
  const fecha = "19 Sep 2026 · 09:42"
  const evidencia = `orden_${ocFolio}.pdf`

  if (loading) {
    return (
      <div className="flex flex-col gap-5 p-4 md:p-7 size-full items-center justify-center">
        <div className="bg-[#fff5dd] flex flex-col gap-2 items-center justify-center rounded-[28px] w-full max-w-[190px] py-5">
          <p
            className="font-extrabold text-[#8e592e] text-[11px] whitespace-nowrap"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            Cargando...
          </p>
        </div>
      </div>
    )
  }

  // If reception is IN_PROGRESS but not yet CONFIRMED, allow confirming from here
  const canConfirm =
    useFirestore &&
    firestoreReady &&
    fsServices &&
    receptionId &&
    receptionDoc?.status === "IN_PROGRESS"

  async function handleConfirm() {
    if (!canConfirm || !fsServices || !receptionId) return
    try {
      await fsServices.receptions.confirmReception(
        receptionId,
        "user",
        `op-${Date.now()}-confirm`,
      )
      // Refresh will happen via useDocument
    } catch (e) {
      console.error("Firestore confirm reception failed:", e)
      // Queue for offline sync if not online
      if (!isOnline) {
        enqueue({
          type: "update",
          collectionPath: `organizations/{orgId}/receptions`,
          docId: receptionId,
          data: { status: "CONFIRMED", receivedAt: Date.now() },
          operationId: `op-${Date.now()}-confirm`,
        })
      }
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 md:p-7 size-full">
      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col items-center p-4 md:p-5 rounded-[20px] w-full">
        <div className="flex flex-col gap-[14px] items-center w-full">
          <div className="bg-[#fff5dd] flex flex-col gap-2 items-center justify-center rounded-[28px] w-full max-w-[190px] py-5">
            <img
              alt=""
              style={{ width: "125.4px", height: "110.2px" }}
              src={imgWarehouse}
            />
            <p
              className="font-extrabold text-[#8e592e] text-[11px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              {tarimasTotal} TARIMAS ✓
            </p>
          </div>
          <p
            className="font-extrabold text-[#172126] text-[26px] whitespace-nowrap text-center"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            {tarimasTotal} tarimas registradas
          </p>
          <div className="bg-[#e2f5ec] flex gap-[7px] items-center px-[11px] py-[7px] rounded-full">
            <img alt="" className="size-[7px]" src={imgIndicador} />
            <p
              className="font-bold text-[#16845b] text-[13px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Recepción completada
            </p>
          </div>
          <div className="bg-white border border-[#172126] flex flex-col gap-[6px] items-center p-[10px] rounded-lg w-full max-w-[138px]">
            <img alt="" className="size-[86px]" src={imgQrCode} />
            <p
              className="font-extrabold text-[#172126] text-[9px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              {ocFolio} · {tarimasTotal} TARIMAS
            </p>
            <p
              className="text-[#607078] text-[8px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              ETIQUETA IMPRIMIBLE
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full">
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] p-4 md:p-5 rounded-[20px] w-full">
          <p
            className="font-extrabold text-[#172126] text-lg whitespace-nowrap"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            Resumen
          </p>
          {[
            { label: "Proveedor", value: proveedor },
            { label: "Proveedor logístico", value: proveedorLogistico },
            { label: "Recepción", value: fecha },
            { label: "Evidencia documental", value: evidencia },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 w-full"
            >
              <p
                className="text-[#607078] text-[13px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                {label}
              </p>
              <p
                className="font-bold text-[#172126] text-[13px] whitespace-nowrap text-right md:text-left"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                {value}
              </p>
            </div>
          ))}
          {incidencias > 0 && (
            <div className="bg-[#fce9e7] flex flex-col md:flex-row items-start md:items-center justify-between gap-2 p-3 rounded-[10px] w-full">
              <p
                className="font-bold text-[#c54b45] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                {incidencias} incidencia{incidencias !== 1 ? "s" : ""}
              </p>
              <p
                className="text-[#c54b45] text-[13px] text-right md:text-left"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                Ver detalle en tarimas
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full">
          {canConfirm && (
            <button
              onClick={handleConfirm}
              className="bg-[#f2b84b] border border-[#f2b84b] flex gap-2 h-12 md:h-[52px] items-center justify-center px-5 rounded-[14px] cursor-pointer hover:bg-[#e0a842] transition-colors w-full touch-target"
            >
              <img alt="" className="size-[18px]" src={imgQrCodeBtn} />
              <p
                className="font-bold text-[#16343f] text-[15px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Confirmar recepción
              </p>
            </button>
          )}
          <button className="bg-[#16343f] border border-[#16343f] flex gap-2 h-12 md:h-[52px] items-center justify-center px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors w-full touch-target">
            <img alt="" className="size-[18px]" src={imgQrCodeBtn} />
            <p
              className="font-bold text-white text-[15px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Generar QR
            </p>
          </button>
          <button
            onClick={onPrint}
            className="bg-white border border-[#dce4e7] flex gap-2 h-12 md:h-[52px] items-center justify-center px-5 rounded-[14px] cursor-pointer hover:bg-[#f8fafb] transition-colors w-full touch-target"
          >
            <img alt="" className="size-[18px]" src={imgPrinter} />
            <p
              className="font-bold text-[#16343f] text-[15px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Imprimir etiquetas
            </p>
          </button>
          <button
            onClick={onHome}
            className="bg-[#e7f0f2] border border-[#e7f0f2] flex gap-2 h-12 md:h-[52px] items-center justify-center px-5 rounded-[14px] cursor-pointer hover:bg-[#d6e5ea] transition-colors w-full touch-target"
          >
            <img alt="" className="size-[18px]" src={imgEye} />
            <p
              className="font-bold text-[#16343f] text-[15px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Ver recepción
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
