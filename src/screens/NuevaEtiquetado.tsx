/**
 * NuevaEtiquetado — Pantalla para crear y planificar lotes de etiquetado
 *
 * Flujo:
 * 1. Seleccionar empresa etiquetadora + receptor + entregado por
 * 2. Agregar líneas: producto, lote, caducidad, cajas/pallets estimados
 * 3. Guardar borrador o Planificar (valida campos requeridos)
 */

import { useState, useCallback, useMemo } from "react";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";
import { useLabelingCatalog } from "@/hooks/useLabelingCatalog";
import { BatchForm } from "@/components/labeling/BatchForm";
import { QRScanner } from "@/components/labeling/QRScanner";
import { EvidencePreview } from "@/components/labeling/EvidencePreview";
import type { LabelingLine } from "@/types/labeling";

export function NuevaEtiquetado() {
  const {
    currentBatch,
    status,
    lines,
    isLoading,
    createBatch,
    planBatch,
    addLine,
    updateLine,
    removeLine,
    setError,
  } = useLabelingBatch();

  const { labelingCompanies, eligibleProducts, loadCatalogs, catalogosLoading } =
    useLabelingCatalog();

  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<{
    productId: string;
    lot: string;
    expiry: string;
    estimatedBoxes: number;
    estimatedPallets: number;
  } | null>(null);

  // Load catalogs on mount
  useMemo(() => {
    if (labelingCompanies.length === 0 && !catalogosLoading) {
      loadCatalogs("");
    }
  }, [labelingCompanies.length, catalogosLoading, loadCatalogs]);

  const handleClose = useCallback(() => {
    setShowQRScanner(false);
    setScannedProduct(null);
  }, []);

  const handleQRScan = useCallback(
    (qrCode: string) => {
      // Buscar producto por QR (TQR-OC123-1)
      // El QR tiene formato TQR-{ocNumber}-{tarimaIndex}
      // Buscar en productos elegibles por coincidencia
      const product = eligibleProducts.find((p) => qrCode.includes(p.id) || qrCode.includes(p.sku));
      if (product) {
        setScannedProduct({
          productId: product.id,
          lot: "",
          expiry: "",
          estimatedBoxes: 1,
          estimatedPallets: 1,
        });
        setShowQRScanner(false);
      } else {
        setError(`Producto no encontrado para QR: ${qrCode}`);
      }
    },
    [eligibleProducts, setError],
  );

  const handleSaveDraft = useCallback(() => {
    // BatchForm maneja el guardado
  }, []);

  const handlePlan = useCallback(() => {
    // BatchForm maneja el planificado
  }, []);

  if (catalogosLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando catálogos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.history.back()}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Volver"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Nuevo Lote de Etiquetado</h1>
                <p className="text-sm text-gray-500">Cree y planifique un lote para etiquetado</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                  status === "draft"
                    ? "bg-gray-100 text-gray-700"
                    : status === "planned"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {status === "draft"
                  ? "Borrador"
                  : status === "planned"
                    ? "Planificado"
                    : "En proceso"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {isLoading}
          </div>
        )}

        {/* Batch Form */}
        <BatchForm onClose={() => window.history.back()} />

        {/* QR Scanner Modal */}
        {showQRScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Escanear Código QR</h2>
                <button
                  onClick={handleClose}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
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
              <div className="p-4">
                <QRScanner onScanSuccess={handleQRScan} onError={handleClose} className="w-full" />
              </div>
            </div>
          </div>
        )}

        {/* Scanned Product Preview */}
        {scannedProduct && !showQRScanner && (
          <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-80">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Producto detectado por QR</h3>
                <button
                  onClick={() => setScannedProduct(null)}
                  className="text-gray-400 hover:text-gray-600"
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
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Producto:</span>{" "}
                  {eligibleProducts.find((p) => p.id === scannedProduct.productId)?.name ||
                    "Desconocido"}
                </p>
                <p>
                  <span className="font-medium">SKU:</span>{" "}
                  {eligibleProducts.find((p) => p.id === scannedProduct.productId)?.sku || "—"}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    // Agregar línea con el producto escaneado
                    setScannedProduct(null);
                  }}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Agregar a lote
                </button>
                <button
                  onClick={() => setScannedProduct(null)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Button for QR Scanner */}
      {!showQRScanner && !scannedProduct && (
        <button
          onClick={() => setShowQRScanner(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 transition-all duration-200 flex items-center justify-center"
          aria-label="Escanear QR"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default NuevaEtiquetado;
