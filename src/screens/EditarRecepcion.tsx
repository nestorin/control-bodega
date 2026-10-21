import { useState } from "react"

const imgCheck = "/assets/3eae4.svg"
const imgWarehouse = "/assets/ccb3f.svg"

interface Props {
  recId: string
  onBack: () => void
  onSave: () => void
  readOnly?: boolean
  initialData?: {
    tarimas?: number
    proveedor?: string
    proveedorLogistico?: string
  }
}

export default function EditarRecepcion({
  recId,
  onBack,
  onSave,
  readOnly = false,
  initialData,
}: Props) {
  const [tarimas, setTarimas] = useState(String(initialData?.tarimas ?? 20))
  const [proveedor, setProveedor] = useState(
    initialData?.proveedor ?? "Distribuidora del Norte",
  )
  const [proveedorLog, setProveedorLog] = useState(
    initialData?.proveedorLogistico ?? "Logística Veloz",
  )
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => {
      onSave()
    }, 800)
  }

  const fields = [
    {
      label: "Número total de tarimas",
      value: tarimas,
      set: setTarimas,
      hint: "Podrás agregar o eliminar después",
    },
    {
      label: "Proveedor de mercancía",
      value: proveedor,
      set: setProveedor,
      hint: null,
    },
    {
      label: "Proveedor logístico",
      value: proveedorLog,
      set: setProveedorLog,
      hint: null,
    },
  ]

  return (
    <div className="flex gap-6 items-start p-7 size-full">
      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-5 rounded-[20px] shrink-0 w-[570px]">
        {/* Edited badge */}
        <div className="flex items-center gap-2">
          <span
            className="bg-[#fff5dd] text-[#8e592e] text-[11px] font-bold px-3 py-1 rounded-full"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            {readOnly ? "CONSULTANDO" : "EDITANDO"} · {recId}
          </span>
        </div>

        <p
          className="font-extrabold text-[#172126] text-[28px]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          Editar recepción
        </p>

        {fields.map(({ label, value, set, hint }) => (
          <div
            key={label}
            className="flex flex-col gap-[7px] items-start w-full"
          >
            <p
              className="font-bold text-[#607078] text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              {label}
            </p>
            <input
              value={value}
              onChange={(e) => set(e.target.value)}
              readOnly={readOnly}
              className={`bg-white border border-[#dce4e7] min-h-12 px-[14px] py-3 rounded-lg w-full font-semibold text-[#172126] text-[15px] outline-none focus:border-[#3276a8] transition-colors ${readOnly ? "cursor-default bg-[#f4f7f8]" : ""}`}
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
            />
            {hint && (
              <p
                className="text-[#607078] text-[11px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                {hint}
              </p>
            )}
          </div>
        ))}

        <div className="bg-[#e9eef0] flex items-start justify-between p-[14px] rounded-[12px] w-full">
          <p
            className="text-[#607078] text-[13px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Orden vinculada
          </p>
          <p
            className="font-extrabold text-[#172126] text-[13px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            {recId}
          </p>
        </div>

        <div className="flex items-start justify-between w-full">
          <button
            onClick={onBack}
            className="bg-white border border-[#dce4e7] flex h-[52px] items-center justify-center px-5 rounded-[14px] cursor-pointer hover:bg-[#f8fafb] transition-colors"
          >
            <p
              className="font-bold text-[#16343f] text-[15px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Cancelar
            </p>
          </button>
          {readOnly ? (
            <button
              type="button"
              disabled
              aria-label="Editar recepción"
              className="flex gap-2 h-[52px] items-center justify-center px-5 rounded-[14px] cursor-not-allowed transition-all"
              style={{ background: "#e9eef0", border: "none" }}
            >
              <p
                className="font-bold text-[15px] whitespace-nowrap"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  color: "#607078",
                }}
              >
                Editar recepción
              </p>
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex gap-2 h-[52px] items-center justify-center px-5 rounded-[14px] cursor-pointer transition-all"
              style={{
                background: saved ? "#e2f5ec" : "#16343f",
                border: "none",
              }}
            >
              <img alt="" className="size-[18px]" src={imgCheck} />
              <p
                className="font-bold text-[15px] whitespace-nowrap"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  color: saved ? "#16845b" : "white",
                }}
              >
                {saved ? "Guardado ✓" : "Guardar cambios"}
              </p>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-1 flex-col items-center justify-center min-w-0 p-5 rounded-[20px] gap-4">
        <div className="bg-[#fff5dd] flex flex-col gap-2 items-center justify-center rounded-[28px] size-[200px]">
          <img
            alt=""
            style={{ width: "130px", height: "114px" }}
            src={imgWarehouse}
          />
          <p
            className="font-extrabold text-[#8e592e] text-[11px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            {tarimas} TARIMAS
          </p>
        </div>
        <p
          className="text-[#172126] text-lg text-center"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
        >
          {readOnly ? "Recepción en consulta" : "Recepción en edición"}
        </p>
        <p
          className="text-[#607078] text-[14px] text-center leading-relaxed"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
        >
          Los cambios se aplicarán a todas las tarimas de esta recepción.
        </p>
      </div>
    </div>
  )
}
