import { QRCodeSVG } from "qrcode.react"

interface Tarima {
  id: string
  numero: number
  total: number
  ordenCompra: string
  fechaRecepcion: string
  producto: string
  caducidad: string
  cajas: number
  unidadesPorCaja: number | null
  lote: string
  proveedor: string
  proveedorLogistico: string
}

interface Props {
  onClose: () => void
  currentReception?: { ocFolio: string; tarimas: number } | null
  conversionesTabla?: Array<{
    producto: string
    codigo: string
    unidades: number
    unidad: string
    piezasPorCaja: number
    cajasPorTarima: number
    cajas: number
    tarimas: number
    stickers: number
  }>
}

function Etiqueta({
  tarima,
  index,
}: {
  tarima: Tarima & {
    stickerIndex?: number
    stickerFace?: string
    stickerCopy?: string
  }
  index: number
}) {
  const isLastRow = index >= 2
  const isRightCol = index % 2 !== 0

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
  )

  const stickerInfo = tarima.stickerFace
    ? `${tarima.stickerFace} · ${tarima.stickerCopy}`
    : `Tarima ${tarima.numero} de ${tarima.total}`

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
      {/* QR — grande y centrado arriba */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <QRCodeSVG
          value={tarima.id}
          size={200}
          level="H"
          marginSize={2}
          style={{ display: "block" }}
        />
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
            [
              "Unidades / caja",
              tarima.unidadesPorCaja ? `${tarima.unidadesPorCaja} uds` : "—",
            ],
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
  )
}

export default function ImpresionEtiquetas({
  onClose,
  currentReception,
  conversionesTabla,
}: Props) {
  const ocFolio = currentReception?.ocFolio ?? "OC-24891"
  const ocNumber = ocFolio.replace("OC-", "")

  // Si hay conversionesTabla, generar tarimas basadas en productos reales
  // Si no, usar datos de ejemplo
  const tarimas: Tarima[] =
    conversionesTabla && conversionesTabla.length > 0
      ? conversionesTabla.flatMap((conv, idx) =>
          Array.from({ length: conv.tarimas }, (_, i) => ({
            id: `TQR-${ocNumber}-${String(idx * 10 + i + 1).padStart(3, "0")}`,
            numero: idx * 10 + i + 1,
            total: conversionesTabla.reduce((a, b) => a + b.tarimas, 0),
            ordenCompra: ocFolio,
            fechaRecepcion: "19 Sep 2026 · 09:42",
            producto: conv.producto,
            caducidad: "15 Mar 2027",
            cajas: Math.ceil(conv.cajas / conv.tarimas),
            unidadesPorCaja: conv.piezasPorCaja,
            lote: "LT-0926-A",
            proveedor: "Distribuidora del Norte",
            proveedorLogistico: "Logística Veloz",
          })),
        )
      : Array.from({ length: currentReception?.tarimas ?? 20 }, (_, i) => ({
          id: `TQR-${ocNumber}-${String(i + 1).padStart(3, "0")}`,
          numero: i + 1,
          total: currentReception?.tarimas ?? 20,
          ordenCompra: ocFolio,
          fechaRecepcion: "19 Sep 2026 · 09:42",
          producto: "Agua mineral 600 ml",
          caducidad: "15 Mar 2027",
          cajas: 48,
          unidadesPorCaja: i % 3 === 0 ? null : 24,
          lote: "LT-0926-A",
          proveedor: "Distribuidora del Norte",
          proveedorLogistico: "Logística Veloz",
        }))

  // NUEVO: Generar stickers - 4 por tarima (2 caras × 2 copias)
  const stickers = tarimas.flatMap((tarima) =>
    [1, 2, 3, 4].map((stickerNum, si) => ({
      ...tarima,
      stickerIndex: si,
      stickerFace: si < 2 ? "Cara A" : "Cara B",
      stickerCopy: si % 2 === 0 ? "Copia 1" : "Copia 2",
    })),
  )

  const pages: Array<typeof stickers[number][]> = []
  for (let i = 0; i < stickers.length; i += 4) {
    pages.push(stickers.slice(i, i + 4))
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
              ? `${stickers.length} stickers (4×tarima) · {pages.length} páginas`
              : `${tarimas.length} etiquetas · {pages.length} páginas · 4 por hoja`}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onClose}
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
              <Etiqueta key={tarima.id} tarima={tarima} index={i} />
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
  )
}
