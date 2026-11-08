/**
 * LineForm — Formulario para editar una línea de etiquetado
 *
 * Permite editar: producto, lote, caducidad, cajas/pallets estimados.
 * Se usa dentro de BatchForm para agregar/editar líneas.
 */

import { useCallback, useMemo, memo } from "react";
import { useLabelingCatalog } from "@/hooks/useLabelingCatalog";
import type { LabelingEligibleProduct } from "@/types/labeling";

interface LineFormData {
  productId: string;
  lot: string;
  expiry: string; // YYYY-MM-DD
  estimatedBoxes: number;
  estimatedPallets: number;
}

interface LineFormProps {
  line: LineFormData;
  availableProducts: LabelingEligibleProduct[];
  onUpdate: (field: keyof LineFormData, value: any) => void;
  onRemove: () => void;
  index: number;
  isLast: boolean;
}

function LineFormInner({
  line,
  availableProducts,
  onUpdate,
  onRemove,
  index,
  isLast,
}: LineFormProps) {
  const { eligibleProducts } = useLabelingCatalog();

  // Use passed products or fallback to catalog
  const products = useMemo(
    () => (availableProducts.length > 0 ? availableProducts : eligibleProducts),
    [availableProducts, eligibleProducts],
  );

  const handleProductChange = useCallback(
    (productId: string) => {
      onUpdate("productId", productId);
      // Clear lot/expiry when product changes
      onUpdate("lot", "");
      onUpdate("expiry", "");
    },
    [onUpdate],
  );

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-100">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Línea {index + 1}</h3>
        {isLast && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 transition-colors"
            aria-label={`Eliminar línea ${index + 1}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Producto */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Producto <span className="text-red-500">*</span>
          </label>
          <select
            value={line.productId}
            onChange={(e) => handleProductChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          >
            <option value="">Seleccionar producto...</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
        </div>

        {/* Lote */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lote <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={line.lot}
            onChange={(e) => onUpdate("lot", e.target.value)}
            placeholder="Ej: LOTE-2024-001"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        {/* Caducidad */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Caducidad <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={line.expiry}
            onChange={(e) => onUpdate("expiry", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        {/* Cajas estimadas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cajas est. <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            value={line.estimatedBoxes}
            onChange={(e) => onUpdate("estimatedBoxes", parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        {/* Pallets estimados */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pallets est. <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            value={line.estimatedPallets}
            onChange={(e) => onUpdate("estimatedPallets", parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
      </div>
    </div>
  );
}

export const LineForm = memo(function LineForm({
  line,
  availableProducts = [],
  onUpdate,
  onRemove,
  index,
  isLast,
}: LineFormProps) {
  return <LineFormInner {...arguments[0]} />;
});

export type { LineFormData, LineFormProps };
export default LineForm;
