import { useEffect, useRef, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { downloadBlob } from "@/services/pdfGenerator";
import { generateEvidencePdf, type EvidencePalletRow } from "@/services/evidencePdf";
import {
  buildAuthenticatedEvidenceLink,
  buildEvidenceShareMessage,
} from "@/services/evidenceShare";

export interface EvidenciaData {
  id: string;
  fotoTrailer: string | null;
  fotoProducto: string | null;
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

interface Props {
  evidencia: EvidenciaData;
  onBack: () => void;
  onDelete?: () => void;
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.004 2C6.484 2 2 6.484 2 12.004c0 1.868.516 3.614 1.41 5.112L2 22l4.984-1.387A9.945 9.945 0 0 0 12.004 22C17.523 22 22 17.516 22 12.004 22 6.484 17.523 2 12.004 2zm0 18.122a8.094 8.094 0 0 1-4.122-1.126l-.296-.176-3.073.855.855-3.073-.196-.306A8.094 8.094 0 0 1 3.878 12c0-4.478 3.644-8.122 8.122-8.122S20.122 7.522 20.122 12c0 4.479-3.644 8.122-8.118 8.122z" />
    </svg>
  );
}

function EditablePhotoCard({
  label,
  src,
  editing,
  onFile,
}: {
  label: string;
  src: string | null;
  editing: boolean;
  onFile: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 flex-1">
      <p
        className="font-bold text-[#607078] text-[12px] uppercase tracking-wide"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
      >
        {label}
      </p>
      <div
        onClick={() => editing && ref.current?.click()}
        className="rounded-[16px] overflow-hidden flex items-center justify-center relative group"
        style={{
          height: 180,
          background: src ? "transparent" : "#e7f0f2",
          border: src ? (editing ? "2px solid #3276a8" : "none") : "2px dashed #b9d9e4",
          cursor: editing ? "pointer" : "default",
        }}
      >
        {src ? (
          <>
            <img src={src} alt={label} className="size-full object-cover" />
            {editing && (
              <div className="absolute inset-0 bg-[rgba(22,52,63,0.45)] flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={editing ? "#3276a8" : "#607078"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <p
              className="text-[12px] text-center px-4"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 400,
                color: editing ? "#3276a8" : "#607078",
              }}
            >
              {editing ? "Toca para agregar foto" : "Sin foto"}
            </p>
          </div>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(URL.createObjectURL(f));
          }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-[11px] border-b border-[#edf1f3] last:border-0">
      <p
        className="text-[#607078] text-[13px] shrink-0"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
      >
        {label}
      </p>
      <p
        className="font-semibold text-[#172126] text-[13px] text-right"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
      >
        {value}
      </p>
    </div>
  );
}

function EditRow({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-[5px] py-[8px] border-b border-[#edf1f3] last:border-0">
      <p
        className="text-[#607078] text-[12px] font-bold"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
      >
        {label}
      </p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#f4f7f8] border border-[#dce4e7] rounded-[8px] h-10 px-3 text-[#172126] text-[13px] outline-none focus:border-[#3276a8] transition-colors w-full"
        style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
      />
    </div>
  );
}

function useProtectedEvidenceImage(path: string | null) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    // Previews are valid only in the active tab. New evidence always uses the
    // canonical protected Storage path below.
    if (path.startsWith("blob:") || path.startsWith("data:")) {
      setSrc(path);
      return;
    }
    if (!storage || !path.startsWith("organizations/")) {
      setSrc(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    getBlob(ref(storage, path))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setSrc(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return src;
}

export default function EvidenciaDetalle({ evidencia: ev, onBack, onDelete }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ev);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const trailerPhoto = useProtectedEvidenceImage(draft.fotoTrailer);
  const productPhoto = useProtectedEvidenceImage(draft.fotoProducto);

  function field(key: keyof EvidenciaData) {
    return String(draft[key] ?? "");
  }
  function set(key: keyof EvidenciaData) {
    return (v: string) => setDraft((d) => ({ ...d, [key]: key === "tarimas" ? Number(v) : v }));
  }

  function sendWhatsApp() {
    const d = draft;
    const evidenceLink = d.receptionId ? buildAuthenticatedEvidenceLink(d.receptionId) : null;
    const msg = buildEvidenceShareMessage({
      receptionId: d.receptionId || d.id,
      supplier: d.proveedor,
      item: d.item,
      palletCount: d.tarimas,
      evidenceLink,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function downloadEvidence() {
    setDownloadError(null);
    try {
      const blob = await generateEvidencePdf({
        evidenceId: draft.evidenceId || draft.id,
        receptionId: draft.receptionId || draft.id,
        date: [draft.fecha, draft.hora].filter(Boolean).join(" "),
        item: draft.item,
        supplier: draft.proveedor,
        logisticsProvider: draft.proveedorLogistico,
        purchaseOrderNumber: draft.purchaseOrderNumber || draft.ocFolio,
        lot: draft.lote,
        expiryDate: draft.caducidad,
        receivedPalletCount: draft.tarimas,
        trailerPhoto,
        productPhoto,
        pallets: draft.pallets || [],
      });
      downloadBlob(
        blob,
        `Evidencia-${(draft.evidenceId || draft.id).replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`,
      );
    } catch (error) {
      console.error("Evidence PDF download failed:", error);
      setDownloadError(
        "No se pudo descargar la evidencia. Verificá tu conexión e intentá nuevamente.",
      );
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-7 size-full overflow-y-auto">
      {/* Left column — photos */}
      <div className="lg:w-[360px] lg:shrink-0 w-full lg:flex-none flex flex-col gap-4">
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-4 p-4 lg:p-5 rounded-[20px] w-full">
          <div className="flex items-center justify-between w-full gap-3 flex-wrap">
            <p
              className="font-extrabold text-[#172126] text-[16px] lg:text-[18px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              Fotos de evidencia
            </p>
            <div
              className="flex gap-[6px] items-center px-3 py-[6px] rounded-full shrink-0"
              style={{ backgroundColor: draft.bg }}
            >
              <img alt="" className="size-[7px]" src={draft.img} />
              <p
                className="font-bold text-[12px] lg:text-[13px] whitespace-nowrap"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  color: draft.color,
                }}
              >
                {draft.estado}
              </p>
            </div>
          </div>

          {editing && (
            <div className="bg-[#fff8e6] border border-[#f2b84b] rounded-[10px] px-3 py-2 w-full">
              <p
                className="text-[#7a5c00] text-[11px] lg:text-[12px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              >
                Toca cada foto para cambiarla
              </p>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-3 w-full">
            <EditablePhotoCard
              label="Mercancía en tráiler"
              src={trailerPhoto}
              editing={editing}
              onFile={(url) => setDraft((d) => ({ ...d, fotoTrailer: url }))}
            />
            <EditablePhotoCard
              label="Producto y caducidad"
              src={productPhoto}
              editing={editing}
              onFile={(url) => setDraft((d) => ({ ...d, fotoProducto: url }))}
            />
          </div>

          {!editing && (
            <div className="bg-[#e7f0f2] border border-[#3276a8] rounded-[12px] px-4 py-3 w-full">
              <p
                className="text-[#3276a8] text-[11px] lg:text-[12px]"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                Estas fotos son exclusivas de la evidencia y fueron capturadas al inicio del proceso
                de recepción.
              </p>
            </div>
          )}

          <button
            onClick={onBack}
            className="flex items-center gap-2 w-full h-11 justify-center rounded-[12px] border border-[#dce4e7] bg-white hover:bg-[#f8fafb] transition-colors touch-target"
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
            <span
              className="font-bold text-[#172126] text-[13px] lg:text-[14px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Volver a evidencias
            </span>
          </button>
        </div>
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 lg:gap-[14px]">
        {/* Header card */}
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-3 items-start p-4 lg:p-5 rounded-[20px] w-full">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between w-full gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <p
                className="font-bold text-[#607078] text-[10px] lg:text-[11px] uppercase tracking-wide"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                EVIDENCIA DE RECEPCIÓN
              </p>
              <p
                className="font-extrabold text-[#172126] text-[20px] lg:text-[26px] truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                {draft.id}
              </p>
              <p
                className="text-[#607078] text-[12px] lg:text-[14px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                {draft.fecha} · {draft.hora}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-2 h-9 lg:h-10 px-3 lg:px-4 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors touch-target"
                  >
                    <span
                      className="text-[12px] lg:text-[13px] font-bold text-[#607078] whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Cancelar
                    </span>
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-2 h-9 lg:h-10 px-4 rounded-[10px] bg-[#16343f] hover:bg-[#1e4456] transition-colors touch-target"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span
                      className="text-[12px] lg:text-[13px] font-bold text-white whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Guardar
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-2 h-9 lg:h-10 px-3 lg:px-4 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors touch-target"
                  >
                    <svg
                      width="13"
                      height="13"
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
                      className="text-[12px] lg:text-[13px] font-bold text-[#172126] whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Editar
                    </span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 h-9 lg:h-10 px-3 lg:px-4 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors touch-target"
                  >
                    <span className="text-[12px] lg:text-[13px] font-bold text-[#172126] whitespace-nowrap">
                      Imprimir
                    </span>
                  </button>
                  <button
                    onClick={downloadEvidence}
                    className="flex items-center gap-2 h-9 lg:h-10 px-3 lg:px-4 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors touch-target"
                  >
                    <span className="text-[12px] lg:text-[13px] font-bold text-[#172126] whitespace-nowrap">
                      Descargar PDF
                    </span>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 h-9 lg:h-10 px-3 lg:px-4 rounded-[10px] border border-[#fce9e7] bg-[#fce9e7] hover:bg-[#f9d8d5] transition-colors touch-target"
                  >
                    <svg
                      width="13"
                      height="13"
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
                      className="text-[12px] lg:text-[13px] font-bold text-[#c54b45] whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Borrar
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              background: "rgba(22,52,63,0.45)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setShowDeleteConfirm(false)}
          >
            <div
              className="bg-white rounded-[20px] lg:rounded-[24px] shadow-[0px_24px_48px_rgba(22,52,63,0.2)] p-5 lg:p-8 flex flex-col gap-4 lg:gap-6 items-center w-full max-w-[360px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className="bg-[#fce9e7] rounded-full flex items-center justify-center"
                  style={{ width: 50, height: 50 }}
                >
                  <svg
                    width="22"
                    height="22"
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
                </div>
                <p
                  className="font-extrabold text-[#172126] text-[16px] lg:text-[18px] text-center"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 800,
                    margin: 0,
                  }}
                >
                  ¿Borrar evidencia?
                </p>
                <p
                  className="text-[#607078] text-[13px] lg:text-[14px] text-center"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 400,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Se eliminará <strong style={{ color: "#172126" }}>{draft.id}</strong> y sus fotos.
                  Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex flex-col lg:flex-row gap-3 w-full">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 h-11 lg:h-12 rounded-[12px] border border-[#dce4e7] bg-white hover:bg-[#f8fafb] transition-colors touch-target"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#172126",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    onDelete?.();
                    onBack();
                  }}
                  className="flex-1 h-11 lg:h-12 rounded-[12px] border-none hover:opacity-90 transition-opacity touch-target"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "white",
                    background: "#c54b45",
                    cursor: "pointer",
                  }}
                >
                  Sí, borrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info card */}
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col items-start px-4 lg:px-5 pt-4 pb-4 lg:pt-4 lg:pb-4 rounded-[20px] w-full">
          {downloadError && (
            <p className="mb-3 text-[13px] text-[#c54b45]" role="alert">
              {downloadError}
            </p>
          )}
          <p
            className="font-bold text-[#172126] text-[14px] lg:text-[15px] pb-2"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            {editing ? "✏️ Editando información" : "Información de la mercancía"}
          </p>
          <div className="w-full">
            {editing ? (
              <>
                <EditRow label="Ítem recibido" value={field("item")} onChange={set("item")} />
                <EditRow
                  label="Proveedor de mercancía"
                  value={field("proveedor")}
                  onChange={set("proveedor")}
                />
                <EditRow
                  label="Proveedor logístico"
                  value={field("proveedorLogistico")}
                  onChange={set("proveedorLogistico")}
                />
                <EditRow
                  label="Orden de compra"
                  value={field("ocFolio")}
                  onChange={set("ocFolio")}
                />
                <EditRow label="Lote" value={field("lote")} onChange={set("lote")} />
                <EditRow
                  label="Tarimas recibidas"
                  value={field("tarimas")}
                  onChange={set("tarimas")}
                  type="number"
                />
                <EditRow
                  label="Caducidad del producto"
                  value={field("caducidad")}
                  onChange={set("caducidad")}
                  type="date"
                />
                <EditRow
                  label="Fecha de recepción"
                  value={field("fecha")}
                  onChange={set("fecha")}
                />
              </>
            ) : (
              <>
                <InfoRow label="Ítem recibido" value={draft.item} />
                <InfoRow label="Proveedor de mercancía" value={draft.proveedor} />
                <InfoRow label="Proveedor logístico" value={draft.proveedorLogistico} />
                <InfoRow label="Orden de compra" value={draft.ocFolio} />
                <InfoRow label="Lote" value={draft.lote} />
                <InfoRow label="Tarimas recibidas" value={`${draft.tarimas} tarimas`} />
                <InfoRow label="Caducidad del producto" value={draft.caducidad} />
                <InfoRow label="Fecha de recepción" value={`${draft.fecha} · ${draft.hora}`} />
              </>
            )}
          </div>
          {!editing && (
            <div className="pt-4 w-full">
              <button
                onClick={sendWhatsApp}
                className="flex gap-2 h-[48px] w-full items-center justify-center rounded-[12px] cursor-pointer transition-opacity hover:opacity-90 touch-target"
                style={{ background: "#25D366" }}
              >
                <WhatsAppIcon />
                <span
                  className="font-bold text-white text-[13px] lg:text-[14px] whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Enviar evidencia por WhatsApp
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
