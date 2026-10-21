/**
 * Paso 6: Revisar datos antes de guardar
 */

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Package,
  MapPin,
  Truck,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { TouchTarget } from "@/components/ui/TouchTarget";

interface Props {
  state: any;
  matchedProducts: any[];
  conversions: any[];
  tarimasTotal: number;
  warehouses: any[];
  suppliers: any[];
  onSetWarehouse: (id: string) => void;
  onSetSupplier: (id: string) => void;
  onPrev: () => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export default function ReviewStep({
  state,
  matchedProducts,
  conversions,
  tarimasTotal,
  warehouses,
  suppliers,
  onSetWarehouse,
  onSetSupplier,
  onPrev,
  onSave,
  saving,
}: Props) {
  const warehouse = warehouses.find((w) => w.id === state.warehouseId);
  const supplier = suppliers.find((s) => s.id === state.supplierId);

  const hasProductsWithoutQuantity = matchedProducts.some((p) => p.cantidad <= 0);

  const isValid =
    state.folio &&
    state.fecha &&
    state.proveedor &&
    state.warehouseId &&
    state.supplierId &&
    matchedProducts.length > 0 &&
    !hasProductsWithoutQuantity;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#16343f] mb-2 flex items-center gap-2">
          <FileText className="w-8 h-8" />
          Revisar y Confirmar
        </h2>
        <p className="text-[#607078]">Verifica todos los datos antes de crear la recepción</p>
      </div>

      <div className="space-y-6">
        {/* Info general */}
        <SectionCard title="Información de la OC" icon={<FileText className="w-5 h-5" />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoField label="Folio" value={state.folio || "—"} required />
            <InfoField label="Fecha" value={state.fecha || "—"} required />
            <InfoField label="Proveedor" value={state.proveedor || "—"} required />
            <InfoField label="Total" value={`$${state.total || "0.00"}`} required />
          </div>
        </SectionCard>

        {/* Almacén y Proveedor Logístico */}
        <SectionCard title="Destino y Logística" icon={<MapPin className="w-5 h-5" />}>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <SelectField
              label="Almacén destino"
              value={state.warehouseId}
              options={warehouses}
              onChange={onSetWarehouse}
              required
            />
            <SelectField
              label="Proveedor logístico"
              value={state.supplierId}
              options={suppliers}
              onChange={onSetSupplier}
              required
            />
          </div>
        </SectionCard>

        {/* Productos */}
        <SectionCard
          title={`Productos (${matchedProducts.length})`}
          icon={<Package className="w-5 h-5" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f8fa] border-b border-[#dce4e7]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[#607078]">#</th>
                  <th className="px-4 py-3 text-left font-medium text-[#607078]">Producto</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Cajas</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Precio</th>
                  <th className="px-4 py-3 text-right font-medium text-[#607078]">Importe</th>
                  <th className="px-4 py-3 text-center font-medium text-[#607078]">Match</th>
                </tr>
              </thead>
              <tbody>
                {matchedProducts.map((p, idx) => (
                  <tr key={idx} className="border-b border-[#dce4e7] hover:bg-[#f8fafb]">
                    <td className="px-4 py-3 text-[#607078]">{idx + 1}</td>
                    <td className="px-4 py-3 text-[#16343f] max-w-xs truncate">{p.nombre}</td>
                    <td className="px-4 py-3 text-right text-[#16343f] font-mono">
                      {p.cantidad?.toLocaleString() || 0}
                    </td>
                    <td className="px-4 py-3 text-right text-[#16343f] font-mono">
                      ${p.precio?.toFixed(2) || "0.00"}
                    </td>
                    <td className="px-4 py-3 text-right text-[#16343f] font-bold font-mono">
                      ${p.importe?.toFixed(2) || "0.00"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          p.estadoMatch === "confirmado"
                            ? "bg-[#dcfce7] text-[#166534]"
                            : p.estadoMatch === "sugerido"
                              ? "bg-[#fef3c7] text-[#92400e]"
                              : "bg-[#fee2e2] text-[#991b1b]"
                        }`}
                      >
                        {p.estadoMatch === "confirmado" && <CheckCircle className="w-3 h-3" />}
                        {p.estadoMatch}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Conversiones */}
        <SectionCard
          title={`Conversiones (${conversions.length})`}
          icon={<Truck className="w-5 h-5" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <InfoField label="Total Tarimas" value={tarimasTotal.toString()} />
            <InfoField label="Total Stickers" value={(tarimasTotal * 4).toString()} />
            <InfoField
              label="Con Conversión"
              value={conversions.filter((c) => c.conversionMatch).length.toString()}
            />
            <InfoField
              label="Sin Conversión"
              value={conversions.filter((c) => !c.conversionMatch).length.toString()}
            />
          </div>
        </SectionCard>

        {/* Validación */}
        {!isValid && (
          <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-[12px] p-4 flex items-start gap-3">
            <AlertCircle className="text-[#ef4444] text-xl mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-[#991b1b] mb-1">Faltan datos requeridos:</p>
              <ul className="text-sm text-[#991b1b] space-y-1">
                {!state.folio && <li>• Folio</li>}
                {!state.fecha && <li>• Fecha</li>}
                {!state.proveedor && <li>• Proveedor</li>}
                {!state.warehouseId && <li>• Almacén destino</li>}
                {!state.supplierId && <li>• Proveedor logístico</li>}
                {matchedProducts.length === 0 && <li>• Al menos un producto</li>}
                {hasProductsWithoutQuantity && <li>- Cantidad {">"} 0 en todos los productos</li>}
              </ul>
            </div>
          </div>
        )}

        {isValid && (
          <div className="bg-[#dcfce7] border border-[#86efac] rounded-[12px] p-4 flex items-center gap-3">
            <CheckCircle className="text-[#166534] text-xl shrink-0" />
            <p className="font-medium text-[#166534]">Todo listo para crear la recepción</p>
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-6 border-t border-[#dce4e7]">
        <TouchTarget
          as="button"
          onClick={onPrev}
          className="flex-1 py-4 rounded-[12px] font-bold text-lg bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f0f4f5] touch-target"
        >
          <ChevronLeft className="inline w-5 h-5 mr-2" /> Volver
        </TouchTarget>
        <TouchTarget
          as="button"
          onClick={onSave}
          disabled={!isValid || saving}
          className={`flex-1 py-4 rounded-[12px] font-bold text-lg transition-colors touch-target ${
            isValid && !saving
              ? "bg-[#16343f] text-white hover:bg-[#0d2630]"
              : "bg-[#dce4e7] text-[#607078] cursor-not-allowed"
          }`}
        >
          {saving ? (
            <>
              <Loader2 className="inline w-5 h-5 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              Crear Recepción <ChevronRight className="inline w-5 h-5 ml-2" />
            </>
          )}
        </TouchTarget>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#dce4e7] rounded-[12px] p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#e7f0f2] flex items-center justify-center text-[#16343f]">
          {icon}
        </div>
        <h3 className="font-bold text-[#16343f]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoField({
  label,
  value,
  required,
}: {
  label: string;
  value: string;
  required?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs text-[#607078] mb-1 flex items-center gap-1">
        {label} {required && <span className="text-[#ef4444]">*</span>}
      </span>
      <p className="font-medium text-[#16343f]">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: string | null;
  options: any[];
  onChange: (id: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={`review-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        className="block text-xs text-[#607078] mb-1 flex items-center gap-1"
      >
        {label} {required && <span className="text-[#ef4444]">*</span>}
      </label>
      <select
        id={`review-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        name={`review-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[#dce4e7] rounded-[8px] text-sm focus:border-[#3276a8] focus:outline-none focus:ring-1 focus:ring-[#3276a8] bg-white"
      >
        <option value="">Seleccionar...</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
