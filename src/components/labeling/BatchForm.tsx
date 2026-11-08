/**
 * BatchForm — Formulario para crear/planificar un lote de etiquetado
 *
 * Permite:
 * - Seleccionar empresa etiquetadora + nombre receptor
 * - Agregar líneas: producto (filtrado por lotControlled/expiryControlled), lote, caducidad, cajas/pallets estimados
 * - Guardar borrador o Planificar (valida que todas las líneas tengan campos requeridos)
 */

import { useState, useCallback, useMemo } from "react";
import { useLabelingCatalog } from "@/hooks/useLabelingCatalog";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";
import type { LabelingLine, LabelingCompany, LabelingEligibleProduct } from "@/types/labeling";
import { buildTrackingKey } from "@/services/labeling/trackingKey";

interface LineFormData {
  productId: string;
  lot: string;
  expiry: string; // YYYY-MM-DD
  estimatedBoxes: number;
  estimatedPallets: number;
}

export interface BatchFormProps {
  onClose?: () => void;
  initialBatchId?: string; // for editing existing batch
}

export function BatchForm({ onClose, initialBatchId }: BatchFormProps) {
  // Catalog data
  const { labelingCompanies, eligibleProducts, loadCatalogs, catalogosLoading } =
    useLabelingCatalog();

  // Batch operations
  const {
    currentBatch,
    status,
    lines,
    createBatch,
    planBatch,
    addLine,
    updateLine,
    removeLine,
    setError,
    isLoading,
  } = useLabelingBatch();

  // Local form state
  const [companyId, setCompanyId] = useState<string>("");
  const [receiverName, setReceiverName] = useState<string>("");
  const [deliveredByName, setDeliveredByName] = useState<string>("");
  const [lineForms, setLineForms] = useState<LineFormData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load catalogs on mount
  useMemo(() => {
    if (labelingCompanies.length === 0 && !catalogosLoading) {
      loadCatalogs("");
    }
  }, [labelingCompanies.length, catalogosLoading, loadCatalogs]);

  // Computed: available products for selection
  const availableProducts = useMemo(() => eligibleProducts, [eligibleProducts]);

  // Validation helpers
  const validateLine = useCallback((line: LineFormData): string[] => {
    const errors: string[] = [];
    if (!line.productId) errors.push("Producto es requerido");
    if (!line.lot.trim()) errors.push("Lote es requerido");
    if (!line.expiry) errors.push("Fecha de caducidad es requerida");
    if (line.estimatedBoxes <= 0) errors.push("Cajas estimadas debe ser > 0");
    if (line.estimatedPallets <= 0) errors.push("Pallets estimados debe ser > 0");
    return errors;
  }, []);

  const validateBatch = useCallback((): string[] => {
    const errors: string[] = [];
    if (!companyId) errors.push("Empresa etiquetadora es requerida");
    if (!receiverName.trim()) errors.push("Nombre del receptor es requerido");
    if (!deliveredByName.trim()) errors.push("Nombre de quien entrega es requerido");
    if (lineForms.length === 0) errors.push("Debe agregar al menos una línea");
    lineForms.forEach((line, i) => {
      const lineErrors = validateLine(line);
      lineErrors.forEach((e) => errors.push(`Línea ${i + 1}: ${e}`));
    });
    return errors;
  }, [companyId, receiverName, deliveredByName, lineForms, validateLine]);

  // Handlers
  const handleAddLine = useCallback(() => {
    setLineForms((prev) => [
      ...prev,
      { productId: "", lot: "", expiry: "", estimatedBoxes: 1, estimatedPallets: 1 },
    ]);
  }, []);

  const handleUpdateLine = useCallback((index: number, field: keyof LineFormData, value: any) => {
    setLineForms((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
  }, []);

  const handleRemoveLine = useCallback((index: number) => {
    setLineForms((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveDraft = useCallback(async () => {
    const errors = validateBatch();
    if (errors.length > 0) {
      setError(errors.join("; "));
      return;
    }

    setIsSubmitting(true);
    try {
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      createBatch({
        batchId,
        warehouseId: "org_exepa_001", // TODO: get from auth context
        labelingCompanyId: companyId,
        labelingCompanyName: labelingCompanies.find((c) => c.id === companyId)?.name || "",
        receiverName,
        deliveredByName,
      });

      // Add lines
      lineForms.forEach((line, i) => {
        addLine({
          lineId: `line-${i + 1}`,
          trackingKey: buildTrackingKey(line.productId, line.lot, line.expiry),
          productId: line.productId,
          productSnapshot: {
            id: line.productId,
            sku: availableProducts.find((p) => p.id === line.productId)?.sku || "",
            name: availableProducts.find((p) => p.id === line.productId)?.name || "",
          },
          lotKey: line.lot.trim().toUpperCase(),
          lotSnapshot: line.lot.trim(),
          expiryKey: line.expiry,
          expiryDate: line.expiry,
          estimatedBoxes: line.estimatedBoxes,
          estimatedPallets: line.estimatedPallets,
          assignedBoxes: 0,
          returnedBoxes: 0,
          approvedLossBoxes: 0,
          outputBoxes: 0,
        });
      });

      if (onClose) onClose();
    } catch (error) {
      setError("Error al guardar borrador");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    companyId,
    receiverName,
    deliveredByName,
    lineForms,
    labelingCompanies,
    availableProducts,
    createBatch,
    addLine,
    setError,
    onClose,
  ]);

  const handlePlan = useCallback(async () => {
    const errors = validateBatch();
    if (errors.length > 0) {
      setError(errors.join("; "));
      return;
    }

    setIsSubmitting(true);
    try {
      // First save as draft
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      createBatch({
        batchId,
        warehouseId: "org_exepa_001",
        labelingCompanyId: companyId,
        labelingCompanyName: labelingCompanies.find((c) => c.id === companyId)?.name || "",
        receiverName,
        deliveredByName,
      });

      lineForms.forEach((line, i) => {
        addLine({
          lineId: `line-${i + 1}`,
          trackingKey: buildTrackingKey(line.productId, line.lot, line.expiry),
          productId: line.productId,
          productSnapshot: {
            id: line.productId,
            sku: availableProducts.find((p) => p.id === line.productId)?.sku || "",
            name: availableProducts.find((p) => p.id === line.productId)?.name || "",
          },
          lotKey: line.lot.trim().toUpperCase(),
          lotSnapshot: line.lot.trim(),
          expiryKey: line.expiry,
          expiryDate: line.expiry,
          estimatedBoxes: line.estimatedBoxes,
          estimatedPallets: line.estimatedPallets,
          assignedBoxes: 0,
          returnedBoxes: 0,
          approvedLossBoxes: 0,
          outputBoxes: 0,
        });
      });

      // Then plan
      planBatch(1); // expectedVersion = 1 after create

      if (onClose) onClose();
    } catch (error) {
      setError("Error al planificar lote");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    companyId,
    receiverName,
    deliveredByName,
    lineForms,
    labelingCompanies,
    availableProducts,
    createBatch,
    addLine,
    planBatch,
    setError,
    onClose,
  ]);

  // Render
  if (catalogosLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">Cargando catálogos...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Lote de Etiquetado</h1>
          <p className="text-gray-600 mt-1">
            Complete los datos del lote y agregue las líneas de producto
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Error display */}
      {isLoading && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {isLoading}
        </div>
      )}

      {/* Section 1: Datos del Lote */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          Datos del Lote
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Empresa Etiquetadora */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Empresa Etiquetadora <span className="text-red-500">*</span>
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Seleccionar empresa...</option>
              {labelingCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Nombre del Receptor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de quien recibe <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="Nombre de la persona que recibe en etiquetado"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Nombre de quien Entrega */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de quien entrega <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={deliveredByName}
              onChange={(e) => setDeliveredByName(e.target.value)}
              placeholder="Nombre de la persona que entrega desde bodega"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>
      </section>

      {/* Section 2: Líneas de Producto */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            Líneas de Producto
          </h2>
          <button
            onClick={handleAddLine}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg
              className="inline w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Agregar línea
          </button>
        </div>

        {lineForms.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            <p className="mt-2 text-gray-500">
              No hay líneas agregadas. Haga clic en "Agregar línea" para comenzar.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {lineForms.map((line, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Línea {index + 1}</h3>
                  <button
                    onClick={() => handleRemoveLine(index)}
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Producto */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Producto <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={line.productId}
                      onChange={(e) => handleUpdateLine(index, "productId", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">Seleccionar producto...</option>
                      {availableProducts.map((product) => (
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
                      onChange={(e) => handleUpdateLine(index, "lot", e.target.value)}
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
                      onChange={(e) => handleUpdateLine(index, "expiry", e.target.value)}
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
                      onChange={(e) =>
                        handleUpdateLine(index, "estimatedBoxes", parseInt(e.target.value) || 0)
                      }
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
                      onChange={(e) =>
                        handleUpdateLine(index, "estimatedPallets", parseInt(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {lineForms.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Total: <span className="font-medium">{lineForms.length}</span> línea(s) •
              <span className="font-medium ml-4">
                {lineForms.reduce((sum, l) => sum + l.estimatedBoxes, 0)} cajas est. •
              </span>
              <span className="font-medium ml-4">
                {lineForms.reduce((sum, l) => sum + l.estimatedPallets, 0)} pallets est.
              </span>
            </p>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          onClick={handleSaveDraft}
          className="px-6 py-2.5 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
          disabled={isSubmitting || lineForms.length === 0}
        >
          <svg
            className="inline w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          Guardar borrador
        </button>
        <button
          onClick={handlePlan}
          className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          disabled={isSubmitting || lineForms.length === 0}
        >
          <svg
            className="inline w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          Planificar
        </button>
      </div>
    </div>
  );
}

export default BatchForm;
