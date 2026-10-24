import { useState, useRef, useEffect } from "react";
import { isFeatureEnabled } from "@/config/featureFlags";
import { db } from "@/lib/firebase";
import { createFirestoreServices } from "@/services/firestore";
import { WAREHOUSE_IDS } from "@/config/warehouses";
import { useAuthorization } from "@/hooks/useAuthorization";
import { generateEvidencePdf, type EvidencePalletRow } from "@/services/evidencePdf";
import { downloadBlob } from "@/services/pdfGenerator";

const imgIndicador = "/assets/08d70.svg";
const imgIndicadorRed = "/assets/9d6fd.svg";

const ORG_ID = "org_exepa_001";

// Fallback local data
export const evidenciasDataLocal = [
  {
    id: "EV-24891",
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
    estado: "Completa",
    color: "#16845b",
    bg: "#e2f5ec",
    img: imgIndicador,
  },
  {
    id: "EV-24850",
    fotoTrailer: null,
    fotoProducto: null,
    proveedor: "Comercial Preciado",
    proveedorLogistico: "Transportes Rápidos",
    item: "Refresco de cola 2L",
    tarimas: 12,
    caducidad: "02 Ene 2027",
    lote: "LT-0918-B",
    ocFolio: "OC-24850",
    fecha: "18 Sep 2026",
    hora: "11:15",
    estado: "Completa",
    color: "#16845b",
    bg: "#e2f5ec",
    img: imgIndicador,
  },
  {
    id: "EV-24830",
    fotoTrailer: null,
    fotoProducto: null,
    proveedor: "Logística Veloz",
    proveedorLogistico: "Fletes del Norte",
    item: "Leche entera 1L",
    tarimas: 8,
    caducidad: "28 Oct 2026",
    lote: "LT-0917-C",
    ocFolio: "OC-24830",
    fecha: "17 Sep 2026",
    hora: "08:30",
    estado: "Incompleta",
    color: "#c54b45",
    bg: "#fce9e7",
    img: imgIndicadorRed,
  },
  // ... rest of local data
];

// Export for use in EvidenciaDetalle
export type EvidenciaData = (typeof evidenciasDataLocal)[0] & {
  receptionId?: string;
  evidenceId?: string;
  purchaseOrderNumber?: string;
  pallets?: EvidencePalletRow[];
};

export function mapReceptionEvidence(reception: any): EvidenciaData {
  const planned = Array.isArray(reception.plannedPallets) ? reception.plannedPallets : [];
  const receivedPallets = planned.filter((pallet: any) =>
    ["ACTIVE", "RECEIVED"].includes(pallet.status),
  );
  const dateValue = reception.receivedAt?.toDate?.() || reception.createdAt?.toDate?.();
  const dateKey = (reception.scheduledDate || dateValue?.toISOString?.() || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  const evidenceId =
    reception.evidenceId ||
    "EV-" + (dateKey || "SINFECHA") + "-" + String(reception.id || "").slice(-6).toUpperCase();
  return {
    id: evidenceId,
    evidenceId,
    receptionId: reception.id,
    fotoTrailer: reception.evidencePhotos?.trailer || null,
    fotoProducto: reception.evidencePhotos?.product || null,
    proveedor: reception.supplierName || reception.supplierCode || "Sin proveedor",
    proveedorLogistico: reception.logisticsProvider || "Sin dato",
    item: reception.productName || "Sin producto",
    tarimas: planned.length ? receivedPallets.length : reception.palletCount || 0,
    caducidad: receivedPallets.map((pallet: any) => pallet.expiryDate).filter(Boolean).join(", "),
    lote: receivedPallets.map((pallet: any) => pallet.lot).filter(Boolean).join(", "),
    ocFolio: reception.purchaseOrderNumber || reception.folio || reception.purchaseOrderId || reception.id,
    purchaseOrderNumber: reception.purchaseOrderNumber || reception.folio || reception.purchaseOrderId || "Sin dato",
    fecha: dateValue?.toLocaleDateString?.("es-ES") || reception.scheduledDate || "",
    hora: dateValue?.toLocaleTimeString?.("es-ES") || "",
    estado: reception.evidencePhotos?.trailer && reception.evidencePhotos?.product ? "Completa" : "Incompleta",
    color: reception.evidencePhotos?.trailer && reception.evidencePhotos?.product ? "#16845b" : "#c54b45",
    bg: reception.evidencePhotos?.trailer && reception.evidencePhotos?.product ? "#e2f5ec" : "#fce9e7",
    img: reception.evidencePhotos?.trailer && reception.evidencePhotos?.product ? imgIndicador : imgIndicadorRed,
    pallets: receivedPallets.map((pallet: any) => ({
      palletNumber: pallet.palletNumber,
      qrIdentifier: pallet.qrIdentifier,
      lot: pallet.lot,
      expiryDate: pallet.expiryDate,
    })),
  };
}

function RowMenu({
  evId,
  onEdit,
  onDownload,
  onDelete,
}: {
  evId: string;
  onEdit: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center size-8 rounded-lg hover:bg-[#edf1f3] transition-colors text-[#607078]"
        title="Opciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 bg-white border border-[#dce4e7] rounded-[14px] shadow-[0px_12px_28px_rgba(22,52,63,0.14)] overflow-hidden min-w-[160px]">
          <button
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[#f4f7f8] transition-colors border-b border-[#edf1f3]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#172126"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span
              className="text-[13px]"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                color: "#172126",
              }}
            >
              Editar
            </span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDownload();
            }}
            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[#f4f7f8] transition-colors border-b border-[#edf1f3]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#172126" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m7 10 5 5 5-5M12 15V3" />
            </svg>
            <span className="text-[13px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#172126" }}>
              Descargar evidencia PDF
            </span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              alert(`Ver fotos de ${evId}`);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[#f4f7f8] transition-colors border-b border-[#edf1f3]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#172126"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span
              className="text-[13px]"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                color: "#172126",
              }}
            >
              Ver fotos
            </span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[#f4f7f8] transition-colors"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c54b45"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            <span
              className="text-[13px]"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                color: "#c54b45",
              }}
            >
              Borrar
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  onSelect?: (ev: EvidenciaData) => void;
}

export default function Evidencias({ onSelect }: Props) {
  const { canQuery } = useAuthorization();
  const useFirestore = isFeatureEnabled("USE_FIRESTORE_EVIDENCIAS") && !!db && canQuery;

  const [listaLocal, setListaLocal] = useState<EvidenciaData[]>(evidenciasDataLocal);
  const [fsServices, setFsServices] = useState<ReturnType<typeof createFirestoreServices> | null>(
    null,
  );
  const [loadingFs, setLoadingFs] = useState(false);
  const [errorFs, setErrorFs] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Estados de filtro
  const [searchText, setSearchText] = useState("");
  const [filterEstado, setFilterEstado] = useState<"todos" | "Completa" | "Incompleta">("todos");

  // Initialize Firestore services
  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID);
      setFsServices(services);
    }
  }, [useFirestore]);

  // Load Firestore data when feature flag is enabled
  useEffect(() => {
    if (!useFirestore || !fsServices) return;

    setLoadingFs(true);
    setErrorFs(null);

    fsServices.receptions
      .getByWarehouse(WAREHOUSE_IDS.NORTH)
      .then((receptions: any[]) => {
        const converted = receptions
          .filter((r: any) => r.evidencePhotos?.trailer || r.evidencePhotos?.product)
        .map(mapReceptionEvidence);
        setListaLocal(converted);
        setLoadingFs(false);
      })
      .catch((err: Error) => {
        console.error("Error loading evidencias:", err);
        setErrorFs(err.message);
        setLoadingFs(false);
      });
  }, [useFirestore, fsServices]);

  const lista: EvidenciaData[] = listaLocal;

  async function downloadEvidence(evidence: EvidenciaData) {
    setDownloadError(null);
    try {
      let pallets = evidence.pallets || [];
      if (fsServices && evidence.receptionId) {
        const docs = await fsServices.pallets.getByReception(evidence.receptionId, [WAREHOUSE_IDS.NORTH]);
        const received = docs.filter((pallet) => ["RECEIVED", "STORED"].includes(pallet.status));
        pallets = received.map((pallet, index) => ({
          palletNumber: pallet.palletNumber
            ?? evidence.pallets?.find((planned) => planned.qrIdentifier === pallet.qrIdentifier)?.palletNumber
            ?? index + 1,
          qrIdentifier: pallet.qrIdentifier,
          lot: pallet.lot,
          expiryDate: pallet.expiryDate,
        }));
      }
      const blob = await generateEvidencePdf({
        evidenceId: evidence.evidenceId || evidence.id,
        receptionId: evidence.receptionId || evidence.ocFolio,
        date: [evidence.fecha, evidence.hora].filter(Boolean).join(" "),
        item: evidence.item,
        supplier: evidence.proveedor,
        logisticsProvider: evidence.proveedorLogistico,
        purchaseOrderNumber: evidence.purchaseOrderNumber || evidence.ocFolio,
        lot: evidence.lote,
        expiryDate: evidence.caducidad,
        receivedPalletCount: evidence.receptionId ? pallets.length : evidence.tarimas,
        trailerPhoto: evidence.fotoTrailer,
        productPhoto: evidence.fotoProducto,
        pallets,
      });
      const filename = "Evidencia-" + (evidence.evidenceId || evidence.id).replace(/[^a-zA-Z0-9-]/g, "-") + ".pdf";
      downloadBlob(blob, filename);
    } catch (error) {
      console.error("Evidence PDF generation failed:", error);
      setDownloadError("No se pudo descargar la evidencia. Verificá las fotos y la conexión.");
    } finally {
    }
  }

  // Lista filtrada
  const listaFiltrada = lista.filter((ev) => {
    const matchesSearch =
      searchText === "" ||
      ev.id.toLowerCase().includes(searchText.toLowerCase()) ||
      ev.proveedor.toLowerCase().includes(searchText.toLowerCase()) ||
      ev.item.toLowerCase().includes(searchText.toLowerCase()) ||
      ev.ocFolio.toLowerCase().includes(searchText.toLowerCase());
    const matchesEstado = filterEstado === "todos" || ev.estado === filterEstado;
    return matchesSearch && matchesEstado;
  });

  return (
    <div className="flex flex-col gap-5 items-start p-7 size-full overflow-y-auto">
      <div className="flex items-center justify-between w-full">
        <div className="flex gap-3 items-center">
          <div className="bg-white border border-[#dce4e7] flex h-10 items-center px-4 rounded-[10px] gap-2">
            <span className="text-[#607078] text-[13px]">🔍</span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar evidencia..."
              className="bg-transparent outline-none text-[13px] w-[200px] text-[#172126] placeholder-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            />
          </div>
          <div className="bg-white border border-[#dce4e7] flex h-10 items-center px-4 rounded-[10px] relative">
            <select
              value={filterEstado}
              onChange={(e) =>
                setFilterEstado(e.target.value as "todos" | "Completa" | "Incompleta")
              }
              className="bg-transparent outline-none text-[13px] text-[#172126] appearance-none pr-8 cursor-pointer"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              <option value="todos">Todos los estados</option>
              <option value="Completa">Completa</option>
              <option value="Incompleta">Incompleta</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#607078] pointer-events-none">
              ▼
            </span>
          </div>
        </div>
        <div className="bg-[#16343f] text-white rounded-[10px] px-4 py-[6px] flex items-center gap-2">
          <span className="text-[13px] font-bold" style={{ fontFamily: "'Inter', sans-serif" }}>
            {listaFiltrada.length}
          </span>
          <span className="text-[13px] font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>
            evidencias
          </span>
          {useFirestore && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-medium">
              Firestore
            </span>
          )}
        </div>
      </div>

      {/* Loading / Error states for Firestore */}
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
          Cargando evidencias desde Firestore...
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
              setLoadingFs(true);
              setErrorFs(null);
              fsServices?.receptions
                .getByWarehouse(WAREHOUSE_IDS.NORTH)
                .then((r: any[]) => {
                  const converted = r
                    .filter(
                      (rec: any) => rec.evidencePhotos?.trailer || rec.evidencePhotos?.product,
                    )
                    .map(mapReceptionEvidence);
                  setListaLocal(converted);
                  setLoadingFs(false);
                })
                .catch((e: Error) => {
                  setErrorFs(e.message);
                  setLoadingFs(false);
                });
            }}
            className="ml-2 underline text-[11px]"
          >
            Reintentar
          </button>
        </div>
      )}
      {downloadError && (
        <p className="text-sm text-red-700" role="alert">{downloadError}</p>
      )}

      <div className="flex flex-col gap-3 w-full">
        {listaFiltrada.map((ev) => (
          <div
            key={ev.id}
            onClick={() => onSelect?.(ev)}
            className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex items-center justify-between px-5 py-4 rounded-[20px] w-full hover:shadow-[0px_12px_20px_rgba(22,52,63,0.12)] cursor-pointer transition-shadow"
          >
            <div className="flex flex-col gap-1 items-start flex-1 min-w-0">
              <div className="flex gap-3 items-center">
                <p
                  className="font-bold text-[#172126] text-[15px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  {ev.id}
                </p>
                <p
                  className="text-[#607078] text-[13px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
                >
                  ·
                </p>
                <p
                  className="text-[#172126] text-[13px] truncate"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
                >
                  {ev.proveedor}
                </p>
              </div>
              <p
                className="font-semibold text-[#172126] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
              >
                {ev.item}
              </p>
              <div className="flex gap-3 items-center flex-wrap">
                <p
                  className="text-[#607078] text-[12px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
                >
                  {ev.tarimas} tarimas · Cad. {ev.caducidad} · {ev.fecha}
                </p>
                <span
                  className="bg-[#e7f0f2] text-[#3276a8] text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  📷{" "}
                  {ev.fotoTrailer && ev.fotoProducto
                    ? 2
                    : ev.fotoTrailer || ev.fotoProducto
                      ? 1
                      : 0}{" "}
                  foto{!ev.fotoTrailer || !ev.fotoProducto ? "" : "s"}
                </span>
                {ev.estado === "Incompleta" && (
                  <span
                    className="bg-[#fce9e7] text-[#c54b45] text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Fotos incompletas
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-4">
              <div
                className="flex gap-[7px] items-center px-[11px] py-[7px] rounded-full"
                style={{ backgroundColor: ev.bg }}
              >
                <img alt="" className="size-[7px]" src={ev.img} />
                <p
                  className="font-bold text-[13px] whitespace-nowrap"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    color: ev.color,
                  }}
                >
                  {ev.estado}
                </p>
              </div>
              <RowMenu
                evId={ev.id}
                onEdit={() => alert(`Editando evidencia ${ev.id}`)}
                onDownload={() => void downloadEvidence(ev)}
                onDelete={() => setListaLocal((prev) => prev.filter((e) => e.id !== ev.id))}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
