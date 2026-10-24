import { useState, useRef, useEffect } from "react";
import { where } from "firebase/firestore";
import { isFeatureEnabled } from "@/config/featureFlags";
import { useCollection } from "@/hooks/useFirestore";
import { db } from "@/lib/firebase";
import { createFirestoreServices } from "@/services/firestore";
import { useOfflineQueue } from "@/hooks/useFirestore";
import type { ReceptionDoc } from "@/services/firestore/types";
import { WAREHOUSE_IDS } from "@/config/warehouses";
import { useAuthorization, isPermissionDenied } from "@/hooks/useAuthorization";
import { Panel, StatusBadge, TouchTarget } from "@/components/ui";
import { mapReceptionListItem } from "@/domains/reception/receptionLifecycle";

const imgIndicador = "/assets/08d70.svg";
const imgIndicadorRed = "/assets/9d6fd.svg";

const ORG_ID = "org_exepa_001";
const NORTH_RECEPTION_CONSTRAINTS = [where("warehouseId", "==", WAREHOUSE_IDS.NORTH)];

interface ReceptionView {
  id: string;
  displayId?: string;
  proveedor: string;
  producto: string;
  tarimas: number;
  fecha: string;
  estado: string;
  incidencias: number;
  color: string;
  bg: string;
  img: string;
  canResume?: boolean;
}

// Fallback local data for when feature flag is OFF
const recepcionesLocal = [
  {
    id: "OC-24891",
    proveedor: "Distribuidora del Norte",
    producto: "Coca Cola 600ml c/24",
    tarimas: 20,
    fecha: "19 Sep 2026",
    estado: "Completada",
    incidencias: 2,
    color: "#16845b",
    bg: "#e2f5ec",
    img: imgIndicador,
  },
  {
    id: "OC-24850",
    proveedor: "Comercial Preciado",
    producto: "Sabritas Clásicas 45g c/30",
    tarimas: 12,
    fecha: "18 Sep 2026",
    estado: "En proceso",
    incidencias: 0,
    color: "#3276a8",
    bg: "#e7f0f2",
    img: imgIndicador,
  },
  {
    id: "OC-24830",
    proveedor: "Logística Veloz",
    producto: "Lala Leche 1L c/12",
    tarimas: 8,
    fecha: "17 Sep 2026",
    estado: "Con incidencia",
    incidencias: 1,
    color: "#c54b45",
    bg: "#fce9e7",
    img: imgIndicadorRed,
  },
  {
    id: "OC-24810",
    proveedor: "Distribuidora del Norte",
    producto: "Bimbo Pan Blanco 680g",
    tarimas: 15,
    fecha: "16 Sep 2026",
    estado: "Completada",
    incidencias: 0,
    color: "#16845b",
    bg: "#e2f5ec",
    img: imgIndicador,
  },
  {
    id: "OC-24790",
    proveedor: "Proveedor Central",
    producto: "Gamesa Galletas Saladas 90g c/20",
    tarimas: 6,
    fecha: "15 Sep 2026",
    estado: "Completada",
    incidencias: 0,
    color: "#16845b",
    bg: "#e2f5ec",
    img: imgIndicador,
  },
  {
    id: "OC-24760",
    proveedor: "Comercial Preciado",
    producto: "Pepsi 2L c/6",
    tarimas: 22,
    fecha: "14 Sep 2026",
    estado: "Con incidencia",
    incidencias: 3,
    color: "#c54b45",
    bg: "#fce9e7",
    img: imgIndicadorRed,
  },
];

const menuItems = [
  {
    label: "Editar",
    icon: (
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
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    color: "#172126",
  },
  {
    label: "Imprimir QRs",
    icon: (
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
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    ),
    color: "#172126",
  },
  {
    label: "Borrar",
    icon: (
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
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
    ),
    color: "#c54b45",
  },
];

function RowMenu({
  recId,
  onEdit,
  onDelete,
}: {
  recId: string;
  onEdit: () => void;
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

  const items = [
    {
      ...menuItems[0],
      action: () => {
        setOpen(false);
        onEdit();
      },
    },
    {
      ...menuItems[1],
      action: () => {
        setOpen(false);
        alert(`Imprimiendo QRs de ${recId}`);
      },
    },
    {
      ...menuItems[2],
      action: () => {
        setOpen(false);
        onDelete();
      },
    },
  ];

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <TouchTarget
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="!min-h-8 !min-w-8 size-8 rounded-lg hover:bg-[#edf1f3] transition-colors text-[#607078]"
        title="Opciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </TouchTarget>

      {open && (
        <div className="absolute right-0 top-10 z-50 bg-white border border-[#dce4e7] rounded-[14px] shadow-[0px_12px_28px_rgba(22,52,63,0.14)] overflow-hidden min-w-[160px]">
          {items.map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[#f4f7f8] transition-colors ${
                i < items.length - 1 ? "border-b border-[#edf1f3]" : ""
              }`}
            >
              <span style={{ color: item.color }}>{item.icon}</span>
              <span
                className="text-[13px]"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  color: item.color,
                }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteModal({
  id,
  onConfirm,
  onCancel,
}: {
  id: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(22,52,63,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-[24px] shadow-[0px_24px_48px_rgba(22,52,63,0.2)] p-8 flex flex-col gap-6 items-center"
        style={{ width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="bg-[#fce9e7] rounded-full flex items-center justify-center"
            style={{ width: 56, height: 56 }}
          >
            <svg
              width="24"
              height="24"
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
            className="font-extrabold text-[#172126] text-[18px] text-center"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              margin: 0,
            }}
          >
            ¿Borrar recepción?
          </p>
          <p
            className="text-[#607078] text-[14px] text-center"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Se eliminará <strong style={{ color: "#172126" }}>{id}</strong> y todas sus tarimas
            asociadas. Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-[12px] border border-[#dce4e7] bg-white hover:bg-[#f8fafb] transition-colors"
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
            onClick={onConfirm}
            className="flex-1 h-12 rounded-[12px] border-none hover:opacity-90 transition-opacity"
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
  );
}

export default function Recepciones({
  onSelectTarima,
  onEdit,
  onResume,
}: {
  onSelectTarima: (recId: string) => void;
  onEdit: (id: string) => void;
  onResume?: (id: string) => void;
}) {
  const { canQuery, canAccessWarehouse } = useAuthorization();
  const useFirestore = isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery;
  const canQueryNorthWarehouse = useFirestore && canAccessWarehouse(WAREHOUSE_IDS.NORTH);

  // Firestore services
  const [fsServices, setFsServices] = useState(() =>
    useFirestore && db ? createFirestoreServices(db, ORG_ID) : null,
  );

  // Offline queue
  const { enqueue, isOnline } = useOfflineQueue(db, ORG_ID);

  // Local state (fallback)
  const [listaLocal, setListaLocal] = useState<ReceptionView[]>(recepcionesLocal);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [loadingFs, setLoadingFs] = useState(false);
  const [errorFs, setErrorFs] = useState<string | null>(null);

  // Estados de filtro
  const [searchText, setSearchText] = useState("");
  const [filterEstado, setFilterEstado] = useState<
    "todos" | "Completada" | "En proceso" | "Con incidencia" | "Borrador"
  >("todos");

  // Firestore hook
  const {
    data: recepcionesFirestore,
    loading,
    error,
    refresh,
  } = useCollection<ReceptionView>(db, `organizations/${ORG_ID}/receptions`, {
    // Rules authorize reception reads by warehouse. An unscoped collection
    // listener is rejected even for an active member.
    constraints: NORTH_RECEPTION_CONSTRAINTS,
    enabled: canQueryNorthWarehouse,
    mapFn: (doc) => {
      const d = doc.data();
      const mapped = mapReceptionListItem({ id: doc.id, ...d } as any);
      return {
        id: mapped.id,
        displayId: mapped.displayId,
        proveedor: mapped.supplier,
        producto: mapped.product,
        tarimas: mapped.palletCount,
        fecha: mapped.date,
        canResume: mapped.canResume,
        estado:
          d.status === "CONFIRMED"
            ? "Completada"
            : d.status === "IN_PROGRESS"
              ? "En proceso"
              : d.status === "CANCELLED"
                ? "Con incidencia"
                : "Borrador",
        incidencias: 0,
        color:
          d.status === "CONFIRMED" ? "#16845b" : d.status === "IN_PROGRESS" ? "#3276a8" : "#c54b45",
        bg:
          d.status === "CONFIRMED" ? "#e2f5ec" : d.status === "IN_PROGRESS" ? "#e7f0f2" : "#fce9e7",
        img:
          d.status === "CONFIRMED"
            ? imgIndicador
            : d.status === "IN_PROGRESS"
              ? imgIndicador
              : imgIndicadorRed,
      };
    },
  });

  // Load Firestore data when feature flag is enabled
  useEffect(() => {
    if (!canQueryNorthWarehouse || !fsServices) return;

    setLoadingFs(true);
    setErrorFs(null);

    fsServices.receptions
      .getByWarehouse(WAREHOUSE_IDS.NORTH)
      .then((receptions: any[]) => {
        const converted = receptions.map((r: any) => ({
          ...(() => {
            const mapped = mapReceptionListItem(r);
            return {
              id: mapped.id,
              displayId: mapped.displayId,
              proveedor: mapped.supplier,
              producto: mapped.product,
              tarimas: mapped.palletCount,
              fecha: mapped.date,
              canResume: mapped.canResume,
            };
          })(),
          estado:
            r.status === "CONFIRMED"
              ? "Completada"
              : r.status === "IN_PROGRESS"
                ? "En proceso"
                : r.status === "CANCELLED"
                  ? "Con incidencia"
                  : "Borrador",
          incidencias: 0,
          color:
            r.status === "CONFIRMED"
              ? "#16845b"
              : r.status === "IN_PROGRESS"
                ? "#3276a8"
                : "#c54b45",
          bg:
            r.status === "CONFIRMED"
              ? "#e2f5ec"
              : r.status === "IN_PROGRESS"
                ? "#e7f0f2"
                : "#fce9e7",
          img:
            r.status === "CONFIRMED"
              ? imgIndicador
              : r.status === "IN_PROGRESS"
                ? imgIndicador
                : imgIndicadorRed,
        }));
        setListaLocal(converted);
        setLoadingFs(false);
      })
      .catch((err: Error) => {
        console.error("Error loading receptions:", err);
        setErrorFs(
          isPermissionDenied(err)
            ? "No tenés permisos para consultar las recepciones de este almacén."
            : err.message,
        );
        setLoadingFs(false);
      });
  }, [canQueryNorthWarehouse, fsServices]);

  // Use Firestore data when enabled, otherwise local
  const lista = useFirestore && !loadingFs ? listaLocal : listaLocal;

  // Lista filtrada
  const listaFiltrada = lista.filter((rec) => {
    const matchesSearch =
      searchText === "" ||
      (rec.displayId || rec.id).toLowerCase().includes(searchText.toLowerCase()) ||
      rec.proveedor.toLowerCase().includes(searchText.toLowerCase()) ||
      rec.producto.toLowerCase().includes(searchText.toLowerCase());
    const matchesEstado = filterEstado === "todos" || rec.estado === filterEstado;
    return matchesSearch && matchesEstado;
  });

  function confirmDelete() {
    if (!deleteTarget) return;

    // Delete from local
    setListaLocal((prev) => prev.filter((r) => r.id !== deleteTarget));

    // Delete from Firestore
    if (useFirestore && fsServices) {
      fsServices.receptions
        .deleteReception(deleteTarget, "user", `op-${Date.now()}`)
        .catch((err: Error) => {
          console.error("Error deleting reception:", err);
          setErrorFs(err.message);
        });
    }

    // Queue for offline sync if not online
    if (!isOnline) {
      enqueue({
        type: "delete",
        collectionPath: `organizations/{orgId}/receptions`,
        docId: deleteTarget,
        operationId: `op-${Date.now()}-delete`,
      });
    }

    setDeleteTarget(null);
  }

  return (
    <>
      {deleteTarget && (
        <DeleteModal
          id={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex flex-col gap-5 items-start p-4 md:p-7 size-full overflow-y-auto">
        <div className="flex items-center justify-between w-full">
          <div className="flex gap-3 items-center">
            <div className="bg-white border border-[#dce4e7] flex h-10 items-center px-4 rounded-[10px] gap-2">
              <span className="text-[#607078] text-[13px]">🔍</span>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar recepción..."
                className="bg-transparent outline-none text-[13px] w-[200px] text-[#172126] placeholder-[#607078]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              />
            </div>
            <div className="bg-white border border-[#dce4e7] flex h-10 items-center px-4 rounded-[10px] relative">
              <select
                value={filterEstado}
                onChange={(e) =>
                  setFilterEstado(
                    e.target.value as
                      | "todos"
                      | "Completada"
                      | "En proceso"
                      | "Con incidencia"
                      | "Borrador",
                  )
                }
                className="bg-transparent outline-none text-[13px] text-[#172126] appearance-none pr-8 cursor-pointer"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                <option value="todos">Todos los estados</option>
                <option value="Completada">Completada</option>
                <option value="En proceso">En proceso</option>
                <option value="Con incidencia">Con incidencia</option>
                <option value="Borrador">Borrador</option>
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
              recepciones
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
            Cargando recepciones desde Firestore...
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
                    const converted = r.map((rec: any) => ({
                      ...(() => {
                        const mapped = mapReceptionListItem(rec);
                        return {
                          id: mapped.id,
                          displayId: mapped.displayId,
                          proveedor: mapped.supplier,
                          producto: mapped.product,
                          tarimas: mapped.palletCount,
                          fecha: mapped.date,
                          canResume: mapped.canResume,
                        };
                      })(),
                      estado:
                        rec.status === "CONFIRMED"
                          ? "Completada"
                          : rec.status === "IN_PROGRESS"
                            ? "En proceso"
                            : rec.status === "CANCELLED"
                              ? "Con incidencia"
                              : "Borrador",
                      incidencias: 0,
                      color:
                        rec.status === "CONFIRMED"
                          ? "#16845b"
                          : rec.status === "IN_PROGRESS"
                            ? "#3276a8"
                            : "#c54b45",
                      bg:
                        rec.status === "CONFIRMED"
                          ? "#e2f5ec"
                          : rec.status === "IN_PROGRESS"
                            ? "#e7f0f2"
                            : "#fce9e7",
                      img:
                        rec.status === "CONFIRMED"
                          ? imgIndicador
                          : rec.status === "IN_PROGRESS"
                            ? imgIndicador
                            : imgIndicadorRed,
                    }));
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

        <div className="flex flex-col gap-3 w-full">
          {listaFiltrada.map((rec) => (
            <Panel
              key={rec.id}
              role="button"
              tabIndex={0}
              aria-label={`Abrir recepción ${rec.displayId || rec.id}`}
              className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 w-full hover:shadow-[0px_12px_20px_rgba(22,52,63,0.12)] transition-shadow touch-target cursor-pointer"
              onClick={() => onSelectTarima(rec.displayId || rec.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTarima(rec.displayId || rec.id);
                }
              }}
            >
              <div className="flex flex-col gap-1 items-start flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className="font-bold text-[#172126] text-base md:text-[15px] whitespace-nowrap"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {rec.displayId || rec.id}
                  </p>
                  <p
                    className="text-[#607078] text-base md:text-[13px]"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    ·
                  </p>
                  <p
                    className="text-[#172126] text-base md:text-[13px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {rec.proveedor}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <p
                    className="text-[#607078] text-sm md:text-[12px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {rec.producto}
                  </p>
                  <p
                    className="text-[#607078] text-sm md:text-[12px]"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {rec.tarimas} tarimas · {rec.fecha}
                  </p>
                  {rec.incidencias > 0 && (
                    <span
                      className="bg-[#fce9e7] text-[#c54b45] text-xs md:text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      {rec.incidencias} incidencia
                      {rec.incidencias !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-4 md:ml-4">
                <StatusBadge
                  label={rec.estado}
                  indicatorSrc={rec.img}
                  backgroundColor={rec.bg}
                  labelColor={rec.color}
                />
                {rec.canResume && onResume && (
                  <button
                    type="button"
                    aria-label={`Reanudar recepción ${rec.displayId || rec.id}`}
                    className="text-xs font-bold text-[#3276a8] underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onResume(rec.id);
                    }}
                  >
                    Reanudar
                  </button>
                )}
                <RowMenu
                  recId={rec.id}
                  onEdit={() => onEdit(rec.id)}
                  onDelete={() => setDeleteTarget(rec.id)}
                />
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </>
  );
}
