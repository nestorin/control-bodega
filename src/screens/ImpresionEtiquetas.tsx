/**
 * ImpresionEtiquetas — Migrated to new architecture (God Component Refactor Phase 7)
 *
 * Uses hooks directly instead of props:
 * - useReceptionFlow for navigation and reception state
 * - useCatalogos for product/supplier catalogs
 * - useUIContext for UI state
 */

import { QRCodeSVG } from "qrcode.react";
import { useReceptionFlow } from "@/hooks/useReceptionFlow";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useUIContext } from "@/context";
import type { ReceptionConversionRow } from "@/types";

/** Number of labels rendered by the demo branch (no reception at all). */
const DEMO_TARIMAS = 20;

/** One label slot, derived from the reception conversion table. */
interface TarimaSlot {
  producto: string;
  cajas: number;
  piezasPorCaja: number | null;
}

/** Normalize a product name for catalog matching (trim + uppercase). */
function normalizeProductName(name: string): string {
  return (name || "").trim().toUpperCase();
}

/**
 * Resolve the units per box of a product from the reception conversion table.
 *
 * The catalog is keyed by product name, so the lookup is a normalized name
 * comparison — the same rule used by `services/palletPlan.ts`. Returns null
 * when the product has no conversion row.
 */
function findPiezasPorCaja(
  conversionesTabla: ReceptionConversionRow[],
  productName: string,
): number | null {
  const target = normalizeProductName(productName);
  if (!target) return null;
  const match = conversionesTabla.find((conv) => normalizeProductName(conv.producto) === target);
  return match?.piezasPorCaja ?? null;
}

interface Tarima {
  id: string;
  numero: number;
  total: number;
  ordenCompra: string;
  fechaRecepcion: string;
  producto: string;
  caducidad: string;
  cajas: number;
  unidadesPorCaja: number | null;
  lote: string;
  proveedor: string;
  proveedorLogistico: string;
}

interface Props {}

function Etiqueta({
  tarima,
  index,
}: {
  tarima: Tarima & {
    stickerIndex?: number;
    stickerFace?: string;
    stickerCopy?: string;
  };
  index: number;
}) {
  const isLastRow = index >= 2;
  const isRightCol = index % 2 !== 0;

  const row = (label: string, value: string, last = false) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingBottom: last ? 0 : "4px",
        borderBottom: last ? "none" : "1px solid #edf1f3",
        marginBottom: last ? 0 : "4px",
      }}
    >
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: "10.5px",
          fontWeight: 400,
          color: "#607078",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: "10.5px",
          fontWeight: 700,
          color: "#172126",
          textAlign: "right",
          maxWidth: "55%",
        }}
      >
        {value}
      </span>
    </div>
  );

  const stickerInfo = tarima.stickerFace
    ? `${tarima.stickerFace} · ${tarima.stickerCopy}`
    : `Tarima ${tarima.numero} de ${tarima.total}`;

  return (
    <div
      style={{
        width: "50%",
        height: "50%",
        boxSizing: "border-box",
        padding: "16px 20px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        borderRight: !isRightCol ? "1px dashed #c8d4d8" : "none",
        borderBottom: !isLastRow ? "1px dashed #c8d4d8" : "none",
      }}
    >
      {/* QR block — large and centered on top */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        {tarima.id ? (
          <QRCodeSVG
            value={tarima.id}
            size={200}
            level="H"
            marginSize={2}
            style={{ display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "200px",
              height: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed #c8d4d8",
              borderRadius: "8px",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 700,
              color: "#607078",
            }}
          >
            QR no asignado
          </div>
        )}
      </div>

      {/* Footer: tarima + ID + cara/copia */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "11px",
            fontWeight: 400,
            color: "#607078",
          }}
        >
          {stickerInfo}
        </span>
        {tarima.stickerFace && (
          <>
            <span
              style={{
                width: "3px",
                height: "3px",
                borderRadius: "50%",
                background: "#c8d4d8",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                fontWeight: 800,
                color: "#172126",
              }}
            >
              {tarima.id}
            </span>
          </>
        )}
      </div>

      {/* Datos — debajo del QR, en dos columnas */}
      <div
        style={{
          borderTop: "1px solid #dce4e7",
          paddingTop: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "13px",
            fontWeight: 800,
            color: "#172126",
            margin: "0 0 2px",
          }}
        >
          {tarima.producto}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "3px 16px",
          }}
        >
          {[
            ["Recepción", tarima.fechaRecepcion],
            ["Orden de compra", tarima.ordenCompra],
            ["Lote", tarima.lote],
            ["Caducidad", tarima.caducidad],
            ["Cajas", `${tarima.cajas} cajas`],
            ["Proveedor", tarima.proveedor],
            ["Prov. logístico", tarima.proveedorLogistico],
            ["Unidades / caja", tarima.unidadesPorCaja ? `${tarima.unidadesPorCaja} uds` : "—"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "6px",
              }}
            >
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "9.5px",
                  fontWeight: 400,
                  color: "#607078",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "9.5px",
                  fontWeight: 700,
                  color: "#172126",
                  textAlign: "right",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ImpresionEtiquetas() {
  // ============================================
  // New Architecture Hooks
  // ============================================
  const { currentReception: ctxCurrentReception, navigate, transition } = useReceptionFlow();

  const {
    catalogoProductos,
    catalogoProveedores,
    catalogoConversiones,
    catalogosLoading,
    catalogosError,
    getAlmacenActivo,
  } = useCatalogos();

  const { closeSidebarOnMobile, isMobile } = useUIContext();

  // ============================================
  // Legacy Props Fallback (for migration period)
  // ============================================
  const currentReception = ctxCurrentReception;
  const onCloseLegacy = () => navigate("home");

  const ocFolio = currentReception?.ocFolio ?? "OC-24891";
  const ocNumber = ocFolio.replace("OC-", "");
  const conversionesTabla = currentReception?.conversionesTabla ?? [];
  const plannedPallets = currentReception?.plannedPallets ?? [];
  const codigosQR = currentReception?.codigosQR ?? [];

  // One slot per tarima, derived from the reception conversion table.
  const slots: TarimaSlot[] = conversionesTabla.flatMap((conv) =>
    Array.from({ length: conv.tarimas ?? 0 }, () => ({
      producto: conv.producto,
      cajas: conv.cajas,
      piezasPorCaja: conv.piezasPorCaja ?? null,
    })),
  );

  // The QR identifier of a printed label MUST come from the backend: it is
  // `plannedPallets[].qrIdentifier` (or the matching `codigosQR[]` entry).
  // The backend derives it from the operation id, so it can NEVER be
  // synthesized from the purchase order folio — a folio-derived identifier
  // scans to nothing.
  const tarimas: Tarima[] = (() => {
    // Primary source: the planned pallets returned by the backend. One planned
    // pallet is one tarima and carries its own real, scannable identifier.
    if (plannedPallets.length > 0) {
      return plannedPallets.map((pallet) => ({
        id: pallet.qrIdentifier ?? "",
        numero: pallet.palletNumber,
        total: plannedPallets.length,
        ordenCompra: currentReception?.ocFolio ?? "",
        fechaRecepcion: currentReception?.fechaRecepcion ?? "",
        producto: pallet.productName,
        caducidad: pallet.expiryDate ?? currentReception?.caducidad ?? "",
        cajas: pallet.quantity,
        unidadesPorCaja: findPiezasPorCaja(conversionesTabla, pallet.productName),
        lote: pallet.lot ?? currentReception?.lote ?? "",
        proveedor: currentReception?.proveedor ?? "",
        proveedorLogistico: currentReception?.proveedorLogistico ?? "",
      }));
    }

    // Secondary source: the QR code list, paired with the conversion table
    // (which knows how many pallets each product has).
    if (codigosQR.length > 0) {
      const codigoSlots: TarimaSlot[] =
        slots.length > 0
          ? slots
          : codigosQR.map(() => ({ producto: "", cajas: 0, piezasPorCaja: null }));
      return codigoSlots.map((slot, index) => ({
        id: codigosQR[index] ?? "",
        numero: index + 1,
        total: codigoSlots.length,
        ordenCompra: currentReception?.ocFolio ?? "",
        fechaRecepcion: currentReception?.fechaRecepcion ?? "",
        producto: slot.producto,
        caducidad: currentReception?.caducidad ?? "",
        cajas: slot.cajas,
        unidadesPorCaja: slot.piezasPorCaja,
        lote: currentReception?.lote ?? "",
        proveedor: currentReception?.proveedor ?? "",
        proveedorLogistico: currentReception?.proveedorLogistico ?? "",
      }));
    }

    // A reception with no backend QR identifier: keep the label structure so
    // the operator still sees the pallet plan, but leave the identifier empty
    // instead of printing a QR code that no scanner can resolve.
    if (currentReception) {
      const receptionSlots: TarimaSlot[] =
        slots.length > 0
          ? slots
          : Array.from({ length: currentReception.tarimas ?? 0 }, () => ({
              producto: "",
              cajas: 0,
              piezasPorCaja: null,
            }));
      return receptionSlots.map((slot, index) => ({
        id: "",
        numero: index + 1,
        total: receptionSlots.length,
        ordenCompra: currentReception.ocFolio ?? "",
        fechaRecepcion: currentReception.fechaRecepcion ?? "",
        producto: slot.producto,
        caducidad: currentReception.caducidad ?? "",
        cajas: slot.cajas,
        unidadesPorCaja: slot.piezasPorCaja,
        lote: currentReception.lote ?? "",
        proveedor: currentReception.proveedor ?? "",
        proveedorLogistico: currentReception.proveedorLogistico ?? "",
      }));
    }

    // Demo data: there is no reception at all, so the screen still renders
    // sample labels with the hardcoded demo values.
    return Array.from({ length: DEMO_TARIMAS }, (_, i) => ({
      id: `TQR-${ocNumber}-${String(i + 1).padStart(3, "0")}`,
      numero: i + 1,
      total: DEMO_TARIMAS,
      ordenCompra: ocFolio,
      fechaRecepcion: "19 Sep 2026 · 09:42",
      producto: "Agua mineral 600 ml",
      caducidad: "15 Mar 2027",
      cajas: 48,
      unidadesPorCaja: i % 3 === 0 ? null : 24,
      lote: "LT-0926-A",
      proveedor: "Distribuidora del Norte",
      proveedorLogistico: "Logística Veloz",
    }));
  })();

  // NUEVO: Generar stickers - 4 por tarima (2 caras × 2 copias)
  const stickers = tarimas.flatMap((tarima) =>
    [1, 2, 3, 4].map((stickerNum, si) => ({
      ...tarima,
      stickerIndex: si,
      stickerFace: si < 2 ? "Cara A" : "Cara B",
      stickerCopy: si % 2 === 0 ? "Copia 1" : "Copia 2",
    })),
  );

  const pages: Array<(typeof stickers)[number][]> = [];
  for (let i = 0; i < stickers.length; i += 4) {
    pages.push(stickers.slice(i, i + 4));
  }

  return (
    <>
      {/* Toolbar */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "#16343f",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          height: "60px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "15px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            Vista de impresión — {ocFolio}
          </p>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              color: "#b9c9cf",
            }}
          >
            {conversionesTabla && conversionesTabla.length > 0
              ? `${stickers.length} stickers (4×tarima) · ${pages.length} páginas`
              : `${tarimas.length} etiquetas · ${pages.length} páginas · 4 por hoja`}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onCloseLegacy}
            style={{
              height: "36px",
              padding: "0 18px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 700,
              color: "white",
              cursor: "pointer",
            }}
          >
            ← Volver
          </button>
          <button
            onClick={() => window.print()}
            style={{
              height: "36px",
              padding: "0 18px",
              borderRadius: "10px",
              border: "none",
              background: "#f2b84b",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 700,
              color: "#16343f",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            🖨 Imprimir todas
          </button>
        </div>
      </div>

      {/* Pages */}
      <div
        style={{
          paddingTop: "60px",
          background: "#edf1f3",
          minHeight: "100vh",
        }}
        className="no-print-bg"
      >
        {pages.map((page, pi) => (
          <div
            key={pi}
            className="print-page"
            style={{
              width: "297mm",
              height: "210mm",
              margin: "24px auto",
              background: "white",
              display: "flex",
              flexWrap: "wrap",
              boxShadow: "0 4px 20px rgba(22,52,63,0.12)",
              pageBreakAfter: "always",
              overflow: "hidden",
            }}
          >
            {page.map((tarima, i) => (
              // The slot index keeps the key unique even when a tarima has no
              // QR identifier yet (empty ids would collide).
              <Etiqueta key={`${tarima.id}-${i}`} tarima={tarima} index={i} />
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .no-print-bg { padding-top: 0 !important; background: white !important; }
          .print-page {
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          @page { margin: 0; size: A4 landscape; }
        }
      `}</style>
    </>
  );
}
