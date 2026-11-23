/**
 * CapturaDocumentoFinal — Paso final de recepción
 * Captura el documento firmado/sellado por encargado y por quién entrega
 */

import { useState, useRef, useEffect } from "react";
import { isFeatureEnabled } from "@/config/featureFlags";
import { createFirestoreServices } from "@/services/firestore";
import { db, storage } from "@/lib/firebase";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useReceptionFlow } from "@/hooks/useReceptionFlow";
import { useUIContext } from "@/context/UIContext";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { uploadEvidencePair } from "@/services/evidenceUpload";
import type { ReceptionData } from "@/types";

const ORG_ID = "org_exepa_001";

interface PhotoSlot {
  label: string;
  hint: string;
  file: string | null;
}

interface Props {
  onBack?: () => void;
  onComplete?: () => void;
  receptionId?: string;
  currentReception?: ReceptionData | null;
}

function DocumentIcon({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8"
        y="12"
        width="48"
        height="40"
        rx="3"
        fill="#e7f0f2"
        stroke="#3276a8"
        strokeWidth="2"
      />
      <line x1="20" y1="22" x2="44" y2="22" stroke="#607078" strokeWidth="1.5" />
      <line x1="20" y1="30" x2="38" y2="30" stroke="#607078" strokeWidth="1.5" />
      <line x1="20" y1="38" x2="44" y2="38" stroke="#607078" strokeWidth="1.5" />
      <line x1="20" y1="46" x2="32" y2="46" stroke="#607078" strokeWidth="1.5" />
      <rect x="36" y="40" width="16" height="10" rx="1" fill="#f2b84b" />
    </svg>
  );
}

function PhotoUploadBox({
  slot,
  onFile,
}: {
  slot: PhotoSlot;
  onFile: (file: File, url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFile(f, URL.createObjectURL(f));
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
          <img src={slot.file} alt={slot.label} className="size-full object-cover rounded-[16px]" />
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
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
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
  );
}

export default function CapturaDocumentoFinal({
  onBack: onBackProp,
  onComplete: onCompleteProp,
  receptionId: receptionIdProp,
  currentReception: currentReceptionProp,
}: Props) {
  // ============================================
  // Hooks
  // ============================================
  const { currentReception: ctxCurrentReception, navigate, transition } = useReceptionFlow();
  const { closeSidebarOnMobile, isMobile } = useUIContext();

  // ============================================
  // Legacy Props Fallback
  // ============================================
  const currentReception = currentReceptionProp ?? ctxCurrentReception;
  const receptionId = receptionIdProp ?? currentReception?.receptionId;
  const onBack = onBackProp ?? (() => navigate("captura-tarima"));
  const onComplete = onCompleteProp ?? (() => navigate("completada"));

  // ============================================
  // Local State
  // ============================================
  const [photos, setPhotos] = useState<[string | null, string | null]>([null, null]);
  const [photoFiles, setPhotoFiles] = useState<[File | null, File | null]>([null, null]);
  const [notices, setNotices] = useState<string[]>([]);
  const [noticeKind, setNoticeKind] = useState<"warning" | "error">("warning");
  const [saved, setSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  // Firestore integration
  const { canQuery, user } = useAuthorization();
  const useFirestore = isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery;

  const [fsServices, setFsServices] = useState<ReturnType<typeof createFirestoreServices> | null>(null);
  const [firestoreReady, setFirestoreReady] = useState(false);

  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID);
      setFsServices(services);
      setFirestoreReady(true);
    }
  }, [useFirestore]);

  const slots: Omit<PhotoSlot, "file">[] = [
    {
      label: "Documento firmado/sellado por encargado de bodega",
      hint: "Foto del documento con firma y sello del responsable de almacén",
    },
    {
      label: "Documento firmado por quién entrega la mercancía",
      hint: "Foto del documento con firma del conductor/entregador",
    },
  ];

  async function saveDocumentToFirestore(): Promise<boolean> {
    if (!useFirestore || !firestoreReady || !fsServices) return true;

    try {
      const warehouseId = currentReception?.warehouseId;
      const evidenceStorage = storage;
      const encargadoFile = photoFiles[0];
      const entregadorFile = photoFiles[1];

      if (receptionId && user && evidenceStorage && warehouseId && encargadoFile && entregadorFile) {
        const evidencePath = (slot: string, file: File) => {
          const extension = file.type === "application/pdf" ? "pdf" : extensionForImage(file);
          return `organizations/${ORG_ID}/warehouses/${warehouseId}/receptions/${receptionId}/evidence/${slot}.${extension}`;
        };
        const extensionForImage = (file: File) => {
          if (file.type === "image/png") return "png";
          if (file.type === "image/webp") return "webp";
          return "jpg";
        };
        const evidencePhotos = {
          documentSignedByEncargado: evidencePath("documento-encargado", encargadoFile),
          documentSignedByEntregador: evidencePath("documento-entregador", entregadorFile),
        };
        await uploadEvidencePair(
          [
            () =>
              uploadBytes(ref(evidenceStorage, evidencePhotos.documentSignedByEncargado), encargadoFile, {
                contentType: encargadoFile.type,
              }),
            () =>
              uploadBytes(ref(evidenceStorage, evidencePhotos.documentSignedByEntregador), entregadorFile, {
                contentType: entregadorFile.type,
              }),
          ],
          [
            () => deleteObject(ref(evidenceStorage, evidencePhotos.documentSignedByEncargado)),
            () => deleteObject(ref(evidenceStorage, evidencePhotos.documentSignedByEntregador)),
          ],
        );
        try {
          await fsServices.receptions.saveFinalDocument(
            receptionId,
            evidencePhotos,
            `op-final-doc-${Date.now()}`,
          );
        } catch (error) {
          await Promise.allSettled([
            deleteObject(ref(evidenceStorage, evidencePhotos.documentSignedByEncargado)),
            deleteObject(ref(evidenceStorage, evidencePhotos.documentSignedByEntregador)),
          ]);
          throw error;
        }
        return true;
      }
    } catch (e) {
      console.error("Failed to save final document to Firestore:", e);
      return false;
    }
    return false;
  }

  async function handleSave(): Promise<boolean> {
    setSaveNotice(false);
    setSaving(true);

    try {
      const persisted = await saveDocumentToFirestore();
      if (!persisted && useFirestore) {
        setSaved(false);
        setNoticeKind("error");
        setNotices(["No se pudo guardar el documento final. Verificá tus permisos y conexión."]);
        return false;
      }

      setNotices([]);
      setSaved(true);
      setSaveNotice(true);
      setTimeout(() => setSaveNotice(false), 3000);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    const missing: string[] = [];
    if (!photos[0]) missing.push("Documento firmado/sellado por encargado");
    if (!photos[1]) missing.push("Documento firmado por quién entrega");

    if (missing.length > 0) {
      setNoticeKind("warning");
      setNotices(missing);
      setTimeout(() => setNotices([]), 5000);
      return;
    }

    if (!(await handleSave())) return;

    transition("completed");
    onComplete();
  }

  return (
    <div className="flex flex-col gap-[18px] items-start p-7 size-full overflow-y-auto">
      {/* Progress */}
      <div className="bg-[#dce4e7] flex flex-col h-2 items-start overflow-hidden rounded-full w-full shrink-0">
        <div className="bg-[#f2b84b] h-2 rounded-full" style={{ width: "100%" }} />
      </div>

      {/* Header card */}
      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-5 rounded-[20px] w-full">
        {/* Title + document icon */}
        <div className="flex items-center gap-4 w-full">
          <div
            className="bg-[#e7f0f2] flex items-center justify-center rounded-[18px] shrink-0"
            style={{ width: 72, height: 72 }}
          >
            <DocumentIcon size={52} />
          </div>
          <div className="flex flex-col gap-1">
            <p
              className="font-extrabold text-[#172126] text-[24px] leading-tight"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              Documento Final
              <br />
              de Recepción
            </p>
            <p
              className="text-[#607078] text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              Paso final · Confirmación de entrega BODEGA Exapa
            </p>
          </div>
        </div>

        {/* Photo slots */}
        <div className="flex gap-3 w-full">
          {slots.map((slot, i) => (
            <div key={i} className="flex-1 flex flex-col gap-2">
              <PhotoUploadBox
                slot={{ ...slot, file: photos[i] }}
                onFile={(file, url) => {
                  setPhotoFiles((prev) => {
                    const next: [File | null, File | null] = [...prev] as [
                      File | null,
                      File | null,
                    ];
                    next[i] = file;
                    return next;
                  });
                  setPhotos((prev) => {
                    const next: [string | null, string | null] = [...prev] as [
                      string | null,
                      string | null,
                    ];
                    next[i] = url;
                    return next;
                  });
                }}
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

        {/* Save notice */}
        {saveNotice && (
          <div
            className="flex items-center gap-2 p-3 w-full bg-[#e2f5ec] border border-[#16845b] rounded-[10px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16845b" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-[#16845b] font-semibold text-[13px]">Documento final guardado correctamente</span>
          </div>
        )}

        {/* Notices */}
        {notices.length > 0 && (
          <div
            className={`flex gap-3 items-start p-[14px] rounded-[12px] w-full ${
              noticeKind === "error"
                ? "bg-[#fff0ee] border border-[#d9534f]"
                : "bg-[#fff8e6] border border-[#f2b84b]"
            }`}
          >
            <span
              className={`text-[13px] shrink-0 ${noticeKind === "error" ? "text-[#d9534f]" : "text-[#f2b84b]"}`}
            >
              {noticeKind === "error" ? "⚠" : "⚠"}
            </span>
            <ul className="flex-1 space-y-1">
              {notices.map((notice, idx) => (
                <li key={idx} className="text-[13px] text-[#172126]">
                  {notice}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 w-full">
        <button
          onClick={onBack}
          className="flex-1 h-12 md:h-[52px] bg-white border border-[#dce4e7] hover:bg-[#f4f7f8] flex items-center justify-center gap-3 text-[14px] font-bold rounded-[14px] transition-colors touch-target"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: "#172126" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <button
          onClick={handleComplete}
          disabled={saving}
          className="flex-1 h-12 md:h-[52px] bg-[#16343f] hover:bg-[#1e4456] disabled:bg-[#b9c9cf] text-white font-bold text-[14px] md:text-[15px] rounded-[14px] transition-colors touch-target"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
        >
          {saving ? (
            <>
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 100" />
              </svg>
              Guardando...
            </>
          ) : (
            <>
              Completar recepción
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}