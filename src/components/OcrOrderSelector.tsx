import type { OcrOrder } from "@/services/domain/ocrMapper";

interface Props {
  orders: OcrOrder[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function OcrOrderSelector({ orders, selectedIndex, onSelect }: Props) {
  if (orders.length < 2) return null;

  return (
    <section
      aria-label="Órdenes de compra detectadas"
      className="w-full rounded-[12px] border border-[#b6d4e7] bg-[#f4f8fc] p-3"
    >
      <p className="mb-2 text-[13px] font-bold text-[#172126]">
        Se detectaron {orders.length} órdenes. Selecciona cuál importar:
      </p>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {orders.map((order, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              key={`${order.folio ?? "order"}-${index}`}
              type="button"
              aria-label={`Importar orden ${order.folio ?? index + 1}`}
              aria-pressed={selected}
              onClick={() => onSelect(index)}
              className={`flex min-h-16 flex-col items-start gap-1 rounded-[10px] border px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-[#16845b] bg-[#e2f5ec] text-[#145b42]"
                  : "border-[#dce4e7] bg-white text-[#172126] hover:border-[#3276a8]"
              }`}
            >
              <span className="text-[13px] font-bold">
                Folio: {order.folio || `Orden ${index + 1}`}
              </span>
              {order.proveedor && <span className="text-[12px]">{order.proveedor}</span>}
              <span className="text-[11px] text-[#607078]">
                {order.productos.length} {order.productos.length === 1 ? "producto" : "productos"}
                {order.total ? ` · Total $${order.total}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      {selectedIndex === null && (
        <p role="status" className="mt-2 text-[12px] text-[#607078]">
          Selecciona una orden para cargar sus productos.
        </p>
      )}
    </section>
  );
}
