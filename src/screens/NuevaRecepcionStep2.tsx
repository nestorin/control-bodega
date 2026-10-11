import { Select, type Proveedor, type Producto } from "./Configuracion"
import { isFeatureEnabled } from "@/config/featureFlags"
import { createFirestoreServices } from "@/services/firestore"
import { db } from "@/lib/firebase"
import { useAuthorization } from "@/hooks/useAuthorization"
import { useState, useEffect } from "react"

const assetPathPrefix = "/assets"
const imgCheck = `${assetPathPrefix}/3eae4.svg`
const imgWarehouse = `${assetPathPrefix}/ccb3f.svg`

const ORG_ID = "org_exepa_001"

type ReceptionOcrProduct = {
  productId: string | null
  codigo: string | null
  nombre: string
  unidad: string | null
  cantidad: number
  importe: number
  estadoMatch: "confirmado" | "sugerido" | "manual"
}

interface Props {
  onBack: () => void
  onContinue: () => void
  initialData?: {
    hasOC: boolean
    ocFolio: string
    tarimas: string
    proveedor: string
    proveedorLogistico: string
    receptionId?: string
    productos?: ReceptionOcrProduct[]
  }
  conversiones?: Array<{
    producto: string
    productId?: string | null
    piezasPorCaja: number
    cajasPorTarima: number
  }>
  catalogos: { proveedores: Proveedor[] productos: Producto[] }
  catalogosStatus?: { loading: boolean error: Error | null }
}

export default function NuevaRecepcionStep2({
  onBack,
  onContinue,
  initialData,
  catalogos,
  catalogosStatus,
  conversiones = [],
}: Props) {
  // Guard: don't render until catalogs are loaded (prevents empty logistics provider list)
  if (catalogosStatus?.loading) {
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

  const catalogoConversiones = conversiones
  const proveedoresMercancia = catalogos.proveedores
    .filter((p) => p.tipo === "mercancia")
    .map((p) => ({ value: p.nombre, label: p.nombre }))
  const proveedoresLogistica = catalogos.proveedores
    .filter((p) => p.tipo === "logistica")
    .map((p) => ({ value: p.nombre, label: p.nombre }))

  const { canQuery } = useAuthorization()
  const useFirestore =
    isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery
  const [fsServices, setFsServices] =
    useState<ReturnType<typeof createFirestoreServices> | null>(null)
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  // NUEVO: Tabla de conversiones y stickers
  const [conversionesTabla, setConversionesTabla] = useState<Array<{
    producto: string
    codigo: string
    unidades: number
    unidad: string
    piezasPorCaja: number
    cajasPorTarima: number
    cajas: number
    tarimas: number
    stickers: number
  }>>([])

  function tarimasPara(producto: ReceptionOcrProduct) {
    const conversion = catalogoConversiones.find(
      (item) =>
        item.producto.trim().toUpperCase() ===
        producto.nombre.trim().toUpperCase(),
    )
    if (!conversion || producto.estadoMatch !== "confirmado") return null
    return producto.unidad?.toLowerCase().includes("pieza")
      ? Math.ceil(
          producto.cantidad /
            conversion.piezasPorCaja /
            conversion.cajasPorTarima,
        )
      : Math.ceil(producto.cantidad / conversion.cajasPorTarima)
  }

  function calcularConversionesYStickers() {
    if (!initialData?.productos) return []
    const tabla = initialData.productos
      .filter((p) => p.estadoMatch === "confirmado" && p.productId)
      .map((p) => {
        const conversion = catalogoConversiones.find(
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
        const stickers = tarimas * 4

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

  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID)
      setFsServices(services)
      setFirestoreReady(true)
    }
    // Calcular conversiones al montar
    if (initialData?.productos) {
      calcularConversionesYStickers()
    }
  }, [useFirestore, initialData?.productos])

  async function handleContinue() {
    // If Firestore enabled and we have a receptionId, advance to IN_PROGRESS
    if (
      useFirestore &&
      firestoreReady &&
      fsServices &&
      initialData?.receptionId
    ) {
      setAdvancing(true)
      try {
        await fsServices.receptions.advanceToInProgress(
          initialData.receptionId,
          "user",
          `op-${Date.now()}`,
        )
      } catch (e) {
        console.error("Firestore advance reception failed:", e)
        // Continue anyway
      } finally {
        setAdvancing(false)
      }
    }

    onContinue()
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-7 size-full overflow-auto">
      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-4 md:gap-[14px] p-4 md:p-5 rounded-[20px] w-full">
        <p
          className="font-extrabold text-[#172126] text-2xl md:text-[28px]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          ¿Qué vamos a recibir?
        </p>

        <div className="flex flex-col gap-3 md:gap-4 w-full">
          {!!initialData?.productos?.length && (
            <div className="border border-[#dce4e7] rounded-[12px] overflow-auto">
              <div className="bg-[#f4f8fc] px-3 py-2 text-[12px] font-bold text-[#172126]">
                Productos identificados por OCR
              </div>
              {initialData.productos.map((producto) => {
                const tarimas = tarimasPara(producto)
                return (
                  <div
                    key={`${producto.codigo}-${producto.nombre}`}
                    className="flex items-center justify-between gap-3 border-t border-[#eef2f4] px-3 py-2 text-[11px]"
                  >
                    <div>
                      <p className="font-bold text-[#172126]">
                        {producto.estadoMatch === "confirmado" ? "✓" : "⚠"}{" "}
                        {producto.nombre}
                      </p>
                      <p className="text-[#607078]">
                        {producto.codigo || "Sin código"} · {producto.cantidad}{" "}
                        {producto.unidad || "unidades"}
                      </p>
                    </div>
                    <p className="font-bold text-[#3276a8]">
                      {tarimas === null
                        ? "Revisar conversión"
                        : `${tarimas} tarimas`}
                    </p>
                  </div>
                )
              })}
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

          <div className="flex flex-col gap-2 md:gap-3 w-full">
            <p
              className="font-bold text-[#607078] text-sm md:text-base"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Número total de tarimas
            </p>
            <div className="bg-white border border-[#dce4e7] flex flex-col items-start min-h-12 px-3 md:px-[14px] py-3 rounded-lg w-full">
              <p
                className="font-semibold text-[#172126] text-base md:text-[15px] w-full truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
              >
                {initialData?.tarimas ?? "20"}
              </p>
            </div>
            <p
              className="text-[#607078] text-xs md:text-[11px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              Podrás agregar o eliminar después
            </p>
          </div>
          <div className="flex flex-col gap-2 md:gap-3 w-full">
            <label
              htmlFor="reception-step2-supplier"
              className="font-bold text-[#607078] text-sm md:text-base"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Proveedor de mercancía
            </label>
            <Select
              value={initialData?.proveedor ?? "Distribuidora del Norte"}
              onChange={() => {}}
              options={proveedoresMercancia}
              placeholder="Seleccionar proveedor"
              id="reception-step2-supplier"
              name="supplier"
              disabled
            />
          </div>
          <div className="flex flex-col gap-2 md:gap-3 w-full">
            <label
              htmlFor="reception-step2-logistics-supplier"
              className="font-bold text-[#607078] text-sm md:text-base"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Proveedor logístico
            </label>
            <Select
              value={initialData?.proveedorLogistico ?? ""}
              onChange={() => {}}
              options={proveedoresLogistica}
              placeholder="Seleccionar transportista"
              id="reception-step2-logistics-supplier"
              name="logisticsSupplier"
              disabled
            />
          </div>
        </div>

        <div className="bg-[#e9eef0] flex flex-col md:flex-row md:items-start md:justify-between gap-2 p-3 md:p-[14px] rounded-[12px] w-full">
          <p
            className="text-[#607078] text-sm md:text-[13px] truncate"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Orden vinculada
          </p>
          <p
            className="font-extrabold text-[#172126] text-sm md:text-[13px] truncate"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            {initialData?.ocFolio ?? "OC-24891"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={onBack}
            className="bg-white border border-[#dce4e7] flex flex-1 h-11 md:h-[52px] items-center justify-center px-3 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#f8fafb] transition-colors touch-target"
          >
            <p
              className="font-bold text-[#16343f] text-sm md:text-[15px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Atrás
            </p>
          </button>
          <button
            onClick={handleContinue}
            disabled={advancing}
            className="bg-[#16343f] border border-[#16343f] flex gap-2 flex-1 h-11 md:h-[52px] items-center justify-center px-3 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target"
          >
            <img alt="" className="size-5 md:size-[18px]" src={imgCheck} />
            <p
              className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              {advancing ? "Avanzando..." : "Crear recepción"}
            </p>
          </button>
        </div>
      </div>

      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-1 flex-col items-center justify-center min-w-0 p-4 md:p-5 rounded-[20px]">
        <div className="flex flex-col gap-2 md:gap-[18px] items-center w-full">
          <div className="bg-[#fff5dd] flex flex-col gap-2 items-center justify-center rounded-[28px] size-[180px] md:size-[230px]">
            <img
              alt=""
              style={{ width: "120px", height: "105px" }}
              src={imgWarehouse}
            />
            <p
              className="font-extrabold text-[#8e592e] text-[10px] md:text-[11px] whitespace-nowrap"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              20 TARIMAS
            </p>
          </div>
          <p
            className="text-[#172126] text-base md:text-lg text-center w-full"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Recepción preparada
          </p>
          <p
            className="text-[#607078] text-sm md:text-[15px] leading-relaxed text-center w-full"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Generaremos un ID único para cada tarima.
          </p>
        </div>
      </div>
    </div>
  )
}
