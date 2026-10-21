import { useState, useRef, useEffect } from "react"
import { isFeatureEnabled } from "@/config/featureFlags"
import { createFirestoreServices } from "@/services/firestore"
import { db, storage } from "@/lib/firebase"
import { uploadInvoicePreview } from "@/services/invoiceEvidence"
import { useAuthorization } from "@/hooks/useAuthorization"

const imgArrowRight = "/assets/55de6.svg"
const ORG_ID = "org_exepa_001"

interface PhotoSlot {
  label: string
  hint: string
  file: string | null
}

interface EvidenceForm {
  proveedor: string
  item: string
  tarimas: string
  caducidad: string
  lote: string
}

interface Props {
  onBack: () => void
  receptionId?: string
  currentReception?: {
    proveedor?: string
    productos?: Array<{ nombre?: string }>
    tarimas?: number
    caducidad?: string
    lote?: string
  } | null
  onContinue: (evidence: {
    photos: [string | null, string | null]
    form: EvidenceForm
  }) => void
}

function TrailerIcon({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* trailer box */}
      <rect
        x="4"
        y="16"
        width="44"
        height="26"
        rx="3"
        fill="#d4e8ed"
        stroke="#3276a8"
        strokeWidth="2"
      />
      {/* cab */}
      <rect
        x="48"
        y="22"
        width="12"
        height="20"
        rx="2"
        fill="#b9d9e4"
        stroke="#3276a8"
        strokeWidth="2"
      />
      {/* windshield */}
      <rect
        x="50"
        y="24"
        width="8"
        height="8"
        rx="1"
        fill="#e7f0f2"
        stroke="#3276a8"
        strokeWidth="1.2"
      />
      {/* hitch */}
      <rect x="44" y="34" width="6" height="3" rx="1" fill="#607078" />
      {/* wheels */}
      <circle
        cx="14"
        cy="44"
        r="5"
        fill="#16343f"
        stroke="#3276a8"
        strokeWidth="1.5"
      />
      <circle cx="14" cy="44" r="2" fill="#b9d9e4" />
      <circle
        cx="34"
        cy="44"
        r="5"
        fill="#16343f"
        stroke="#3276a8"
        strokeWidth="1.5"
      />
      <circle cx="34" cy="44" r="2" fill="#b9d9e4" />
      <circle
        cx="54"
        cy="44"
        r="4"
        fill="#16343f"
        stroke="#3276a8"
        strokeWidth="1.5"
      />
      <circle cx="54" cy="44" r="1.6" fill="#b9d9e4" />
      {/* doors line */}
      <line
        x1="26"
        y1="16"
        x2="26"
        y2="42"
        stroke="#3276a8"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
    </svg>
  )
}

function PhotoUploadBox({
  slot,
  onFile,
}: {
  slot: PhotoSlot
  onFile: (url: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFile(URL.createObjectURL(f))
  }

  return (
    <div
      onClick={() => ref.current?.click()}
      className="relative flex flex-col items-center justify-center gap-2 rounded-[16px] cursor-pointer overflow-hidden transition-all"
      style={{
        width: "100%",
        height: 160,
        background: slot.file ? "transparent" : "#e7f0f2",
        border: slot.file ? "none" : "2px dashed #3276a8",
      }}
    >
      {slot.file ? (
        <>
          <img
            src={slot.file}
            alt={slot.label}
            className="size-full object-cover rounded-[16px]"
          />
          <div className="absolute inset-0 bg-[rgba(22,52,63,0.4)] flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity rounded-[16px]">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span
              className="text-white text-[11px] font-bold"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Cambiar foto
            </span>
          </div>
        </>
      ) : (
        <>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3276a8"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p
            className="font-bold text-[#3276a8] text-[13px] text-center px-4"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            {slot.label}
          </p>
          <p
            className="text-[#607078] text-[11px] text-center px-4"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            {slot.hint}
          </p>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}

export default function CapturaEvidencia({
  onContinue,
  currentReception,
  receptionId,
}: Props) {
  const [photos, setPhotos] = useState<[string | null, string | null]>([
    null,
    null,
  ])
  const [form, setForm] = useState<EvidenceForm>({
    proveedor: currentReception?.proveedor || "",
    item: currentReception?.productos?.[0]?.nombre || "",
    tarimas: currentReception?.tarimas ? String(currentReception.tarimas) : "",
    caducidad: currentReception?.caducidad || "",
    lote: currentReception?.lote || "",
  })
  const [notices, setNotices] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [saveNotice, setSaveNotice] = useState(false)

  // TEST-ONLY: Load test data from localStorage for legacy mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('test') === 'legacy-captura-evidencia') {
      try {
        const saved = localStorage.getItem('test-evidencia-form')
        if (saved) {
          const data = JSON.parse(saved)
          setForm({
            proveedor: data.proveedor || "",
            item: data.item || "",
            tarimas: data.tarimas || "",
            caducidad: data.caducidad || "",
            lote: data.lote || "",
          })
        }
      } catch (e) {
        console.warn('[TEST] No se pudo leer test-evidencia-form:', e)
      }
    }
  }, [])

  // Firestore integration
  const { canQuery, user } = useAuthorization()
  
  // TEST-ONLY: Disable Firestore in test mode to avoid emulator connection issues
  const isTestMode = new URLSearchParams(window.location.search).get('test') === 'legacy-captura-evidencia'
  const useFirestore = !isTestMode && isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery
  
  const [fsServices, setFsServices] =
    useState<ReturnType<typeof createFirestoreServices> | null>(null)
  const [firestoreReady, setFirestoreReady] = useState(false)

  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID)
      setFsServices(services)
      setFirestoreReady(true)
    }
  }, [useFirestore])

  function buildWhatsAppMessage() {
    return [
      "🏭 *RECEPCIÓN DE MERCANCÍA — BODEGA Exapa*",
      "━━━━━━━━━━━━━━━━━━━━",
      `📅 Fecha: 19 Sep 2026 · 09:42`,
      "",
      "📋 *Información de la mercancía*",
      `• Proveedor: ${form.proveedor || "_(sin capturar)_"}`,
      `• Ítem a recibir: ${form.item || "_(sin capturar)_"}`,
      `• Tarimas a recibir: ${form.tarimas || "_(sin capturar)_"}`,
      `• Caducidad del producto: ${form.caducidad || "_(sin capturar)_"}`,
      `• Lote: ${form.lote || "_(sin capturar)_"}`,
      "",
      `📷 Fotos adjuntas: ${[photos[0], photos[1]].filter(Boolean).length} / 2`,
      `  ${photos[0] ? "✅" : "⬜"} Mercancía dentro del tráiler`,
      `  ${photos[1] ? "✅" : "⬜"} Producto y caducidad`,
      "━━━━━━━━━━━━━━━━━━━━",
      "_Enviado desde TarimaQR_",
    ].join("\n")
  }

  async function saveEvidenceToFirestore(): Promise<boolean> {
    if (!useFirestore || !firestoreReady || !fsServices) return true

    try {
      if (receptionId && user) {
        // Convert blob URLs to base64 for storage (in production use Storage)
        await fsServices.receptions.saveEvidence(
          receptionId,
          { trailer: photos[0] || undefined, product: photos[1] || undefined },
          `op-evidence-${Date.now()}`,
        )
        return true
      }
    } catch (e) {
      console.error("Failed to save evidence to Firestore:", e)
      return false
    }
    return false
  }

  async function handleSave(): Promise<boolean> {
    setSaveNotice(true)
    setTimeout(() => setSaveNotice(false), 3000)

    // Dual-write: save to Firestore if enabled
    if (useFirestore) {
      const persisted = await saveEvidenceToFirestore()
      if (!persisted) {
        setNotices([
          "No se pudo guardar la evidencia. Verificá tus permisos y conexión.",
        ])
        return false
      }
    }

    setSaved(true)
    return true
  }

  const slots: Omit<PhotoSlot, "file">[] = [
    {
      label: "Foto de la mercancía dentro del tráiler",
      hint: "Toma o sube foto con puertas abiertas",
    },
    {
      label: "Foto del producto y su caducidad",
      hint: "Asegúrate que la fecha de caducidad sea visible",
    },
  ]

  async function handleContinue() {
    const missing: string[] = []
    if (!photos[0]) missing.push("Foto del tráiler")
    if (!photos[1]) missing.push("Foto del producto y caducidad")
    if (!form.proveedor.trim()) missing.push("Nombre del proveedor")
    if (!form.item.trim()) missing.push("Ítem a recibir")
    if (!form.tarimas.trim()) missing.push("Cantidad de tarimas")
    if (!form.caducidad.trim()) missing.push("Caducidad del producto")

    if (missing.length > 0) {
      setNotices(missing)
      setTimeout(() => setNotices([]), 5000)
      return
    }
    if (!(await handleSave())) return
    // Pass evidence data to parent
    onContinue({ photos, form })
  }

  return (
    <div className="flex flex-col gap-[18px] items-start p-7 size-full overflow-y-auto">
      {/* Progress */}
      <div className="bg-[#dce4e7] flex flex-col h-2 items-start overflow-hidden rounded-full w-full shrink-0">
        <div
          className="bg-[#f2b84b] h-2 rounded-full"
          style={{ width: "16%" }}
        />
      </div>

      {/* Header card */}
      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-5 rounded-[20px] w-full">
        {/* Title + trailer icon */}
        <div className="flex items-center gap-4 w-full">
          <div
            className="bg-[#e7f0f2] flex items-center justify-center rounded-[18px] shrink-0"
            style={{ width: 72, height: 72 }}
          >
            <TrailerIcon size={52} />
          </div>
          <div className="flex flex-col gap-1">
            <p
              className="font-extrabold text-[#172126] text-[24px] leading-tight"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              Capturar evidencia de
              <br />
              Mercancía Entrante
            </p>
            <p
              className="text-[#607078] text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              Paso 1 · Protocolo de recepción BODEGA Exapa
            </p>
          </div>
        </div>

        {/* Photo slots */}
        <div className="flex gap-3 w-full">
          {slots.map((slot, i) => (
            <div key={i} className="flex-1 flex flex-col gap-2">
              <PhotoUploadBox
                slot={{ ...slot, file: photos[i] }}
                onFile={(url) =>
                  setPhotos((prev) => {
                    const next: [string | null, string | null] = [
                      ...prev,
                    ] as [string | null, string | null]
                    next[i] = url
                    return next
                  })
                }
              />
              <div className="flex items-center gap-1">
                <div
                  className={`size-2 rounded-full shrink-0 ${
                    photos[i] ? "bg-[#16845b]" : "bg-[#dce4e7]"
                  }`}
                />
                <p
                  className="text-[11px]"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    color: photos[i] ? "#16845b" : "#607078",
                  }}
                >
                  {photos[i] ? "Foto capturada" : "Pendiente"}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-[#dce4e7] w-full" />

        {/* Form */}
        <p
          className="font-bold text-[#172126] text-[15px]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
        >
          Información de la mercancía
        </p>

        <div className="flex flex-col gap-3 w-full">
          {[
            {
              key: "proveedor",
              label: "Nombre del proveedor",
              placeholder: "Ej. Distribuidora del Norte",
            },
            {
              key: "item",
              label: "Nombre del ítem a recibir",
              placeholder: "Ej. Agua mineral 600 ml",
            },
            {
              key: "tarimas",
              label: "Cantidad de tarimas a recibir",
              placeholder: "Ej. 20",
              type: "number",
            },
            {
              key: "caducidad",
              label: "Caducidad del producto",
              placeholder: "DD/MM/AAAA",
              type: "date",
            },
            {
              key: "lote",
              label: "Lote del producto (opcional)",
              placeholder: "Ej. L-2026-001",
            },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key} className="flex flex-col gap-[6px]">
              <label
                htmlFor={`evidence-${key}`}
                className="font-bold text-[#607078] text-[12px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                {label}
              </label>
              <input
                id={`evidence-${key}`}
                name={key}
                aria-label={label}
                type={type ?? "text"}
                placeholder={placeholder}
                value={form[(key as keyof EvidenceForm)]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
                className="bg-white border border-[#dce4e7] h-11 px-[14px] rounded-lg w-full text-[#172126] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              />
            </div>
          ))}
        </div>

        {/* Notices */}
        {notices.length > 0 && (
          <div className="bg-[#fff8e6] border border-[#f2b84b] flex gap-3 items-start p-[14px] rounded-[12px] w-full">
            <span className="text-[#f2b84b] text-[16px] shrink-0 mt-[1px]">
              ⚠
            </span>
            <div className="flex flex-col gap-1">
              <p
                className="font-bold text-[#7a5c00] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Datos incompletos — se registrará sin ellos:
              </p>
              <ul className="flex flex-col gap-[2px]">
                {notices.map((n) => (
                  <li
                    key={n}
                    className="text-[#7a5c00] text-[12px]"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    · {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 w-full shrink-0">
        {saveNotice && (
          <div className="bg-[#e2f5ec] border border-[#16845b] flex gap-3 items-center px-4 py-3 rounded-[12px] w-full">
            <span className="text-[#16845b] text-[16px]">✅</span>
            <p
              className="text-[#16845b] text-[13px] font-bold"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Evidencia guardada — ahora puedes enviarla por WhatsApp
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <div className="flex flex-col gap-[3px] items-start w-full sm:w-auto">
            <p
              className="font-bold text-[#607078] text-[11px] uppercase"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              FECHA Y HORA AUTOMÁTICAS
            </p>
            <p
              className="font-bold text-[#172126] text-[15px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              19 Sep 2026 · 09:42
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            {/* Save */}
            <button
              onClick={handleSave}
              className="flex gap-2 h-11 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer transition-colors border touch-target w-full sm:w-auto"
              style={{
                background: saved ? "#e2f5ec" : "white",
                borderColor: saved ? "#16845b" : "#dce4e7",
              }}
            >
              {saved ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16845b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#172126"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              )}
              <p
                className="font-bold text-sm md:text-[15px] whitespace-nowrap"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  color: saved ? "#16845b" : "#172126",
                }}
              >
                {saved ? "Guardado" : "Guardar evidencia"}
              </p>
            </button>

            {/* WhatsApp — enabled only after saving */}
            <button
              onClick={() =>
                saved &&
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(buildWhatsAppMessage())}`,
                  "_blank",
                )
              }
              className="flex gap-2 h-11 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] transition-colors border touch-target w-full sm:w-auto"
              style={{
                background: saved ? "#25D366" : "#b9d9e4",
                borderColor: saved ? "#25D366" : "#b9d9e4",
                cursor: saved ? "pointer" : "not-allowed",
                opacity: saved ? 1 : 0.6,
              }}
              title={
                saved ? "Enviar por WhatsApp" : "Guarda la evidencia primero"
              }
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="white"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12.004 2C6.484 2 2 6.484 2 12.004c0 1.868.516 3.614 1.41 5.112L2 22l4.984-1.387A9.945 9.945 0 0 0 12.004 22C17.523 22 22 17.516 22 12.004 22 6.484 17.523 2 12.004 2zm0 18.122a8.094 8.094 0 0 1-4.122-1.126l-.296-.176-3.073.855.855-3.073-.196-.306A8.094 8.094 0 0 1 3.878 12c0-4.478 3.644-8.122 8.122-8.122S20.122 7.522 20.122 12c0 4.479-3.644 8.122-8.118 8.122z" />
              </svg>
              <p
                className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                WhatsApp
              </p>
            </button>

            <button
              onClick={handleContinue}
              className="bg-[#16343f] border border-[#16343f] flex gap-2 h-11 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target w-full sm:w-auto"
            >
              <img
                alt=""
                className="size-5 md:size-[18px]"
                src={imgArrowRight}
              />
              <p
                className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Continuar
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
