import { Panel, QuickActionCard, StatCard, StatusBadge } from "@/components/ui"

const assetPathPrefix = "/assets"
const imgPlus = `${assetPathPrefix}/68eab.svg`
const imgSquarePlus = `${assetPathPrefix}/76004.svg`
const imgClipboardList = `${assetPathPrefix}/8ee97.svg`
const imgScanQrCode = `${assetPathPrefix}/c42c6.svg`
const imgIndicador = `${assetPathPrefix}/08d70.svg`
const imgWarehouse = `${assetPathPrefix}/0d81c.svg`

interface HomeProps {
  onNewReception: () => void
  onRecepciones: () => void
}

export default function Home({ onNewReception, onRecepciones }: HomeProps) {
  return (
    <div className="flex flex-col gap-4 md:gap-5 p-4 md:p-7 size-full overflow-auto">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 w-full">
        <div className="flex flex-col gap-1 items-start">
          <p
            className="font-extrabold text-[#172126] text-2xl md:text-[34px] leading-tight"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            Recepción sin vueltas
          </p>
          <p
            className="text-[#607078] text-base md:text-lg"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Registra, etiqueta y consulta cada tarima.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewReception}
          className="bg-[#16343f] border border-[#16343f] flex gap-2 h-11 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target w-full md:w-auto"
        >
          <img alt="" className="size-5 md:size-[18px]" src={imgPlus} />
          <p
            className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            Nueva recepción
          </p>
        </button>
      </div>

      {/* Quick actions grid - responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 w-full">
        <QuickActionCard
          onClick={onNewReception}
          iconSrc={imgSquarePlus}
          iconBackgroundClassName="bg-[#fff5dd]"
          title="Programar recepción"
          description="Planificar y verificar datos"
        />
        <QuickActionCard
          onClick={onRecepciones}
          iconSrc={imgClipboardList}
          iconBackgroundClassName="bg-[#e7f0f2]"
          title="Recepciones"
          description="Consultar y editar"
        />
        <QuickActionCard
          iconSrc={imgScanQrCode}
          iconBackgroundClassName="bg-[#e7f0f2]"
          title="Escanear QR"
          description="Abrir ficha de tarima"
        />
      </div>

      {/* Stats + Info cards - responsive grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 w-full">
        {/* Today summary card */}
        <Panel className="flex flex-col gap-3 md:gap-[14px] p-4 md:p-5 w-full">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 w-full">
            <p
              className="text-[#172126] text-base md:text-lg"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              Resumen de hoy
            </p>
            <p
              className="text-[#607078] text-sm md:text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
            >
              19 Sep 2026
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:gap-7 items-start w-full">
            <StatCard value="6" label="Recepciones" />
            <StatCard value="84" label="Tarimas" />
            <StatCard
              value="3"
              label="Incidencias"
              valueClassName="text-[#c54b45]"
            />
          </div>
          <div className="bg-[#e9eef0] flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 md:p-[14px] rounded-[12px] w-full">
            <p
              className="font-bold text-[#172126] text-sm md:text-[13px] whitespace-nowrap truncate"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              OC-24891 · Distribuidora del Norte
            </p>
            <StatusBadge label="Completada" indicatorSrc={imgIndicador} />
          </div>
        </Panel>

        {/* Status card */}
        <Panel className="flex flex-col gap-3 md:gap-[18px] p-4 md:p-5 w-full">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-[18px] w-full">
            <div className="bg-[#fff5dd] flex flex-col gap-2 items-center justify-center rounded-[28px] size-[140px] md:size-[170px] flex-shrink-0">
              <img
                alt=""
                style={{ width: "90px", height: "80px" }}
                src={imgWarehouse}
              />
              <p
                className="font-extrabold text-[#8e592e] text-[10px] md:text-[11px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                TARIMA 03
              </p>
            </div>
            <div className="flex flex-col gap-1 items-start md:items-center text-center md:text-left min-w-0 flex-1">
              <StatusBadge
                label="Operación estable"
                indicatorSrc={imgIndicador}
              />
              <p
                className="text-[#172126] text-base md:text-lg truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                Todo listo para recibir
              </p>
              <p
                className="text-[#607078] text-sm md:text-[13px] leading-relaxed"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                Usa guantes y valida cada condición.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
