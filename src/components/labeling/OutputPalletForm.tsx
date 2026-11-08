/**
 * OutputPalletForm — Formulario para crear pallets de salida (división/fusión)
 *
 * Permite:
 * - Crear pallets de salida a partir de cajas disponibles (assigned - returned - loss)
 * - División: un trackingKey → múltiples pallets
 * - Fusión: múltiples trackingKeys → un pallet (si mismo producto/lote/caducidad)
 */

import { useState, useCallback, useMemo, memo } from "react";
import { useLabelingBatch } from "@/hooks/useLabelingBatch";
import type { LabelingOutputPallet } from "@/types/labeling";

export interface OutputPalletFormProps {
  onClose?: () => void;
  batchId?: string;
}

export function OutputPalletForm({ onClose, batchId }: OutputPalletFormProps) {
  const { currentBatch, lines, outputPallets, createOutputPallets, setError } = useLabelingBatch();

  const [pallets, setPallets] = useState<
    Array<{
      id: string;
      trackingKey: string;
      boxes: number;
    }>
  >([]);

  // Available trackingKeys with pending boxes
  const availableTrackingKeys = useMemo(() => {
    if (!currentBatch) return [];
    return Array.from(lines.values())
      .filter((line: any) => {
        const pending =
          line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes - line.outputBoxes;
        return pending > 0;
      })
      .map((line: any) => ({
        trackingKey: line.trackingKey,
        productName: line.productSnapshot?.name || line.productId,
        lot: line.lotSnapshot,
        expiry: line.expiryDate,
        pendingBoxes:
          line.assignedBoxes - line.returnedBoxes - line.approvedLossBoxes - line.outputBoxes,
        assignedBoxes: line.assignedBoxes,
        returnedBoxes: line.returnedBoxes,
        lossBoxes: line.approvedLossBoxes,
      }));
  }, [lines, currentBatch]);

  const handleAddPallet = useCallback(() => {
    if (availableTrackingKeys.length === 0) return;
    setPallets((prev) => [
      ...prev,
      {
        id: `pallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        trackingKey: availableTrackingKeys[0].trackingKey,
        boxes: 1,
      },
    ]);
  }, [availableTrackingKeys]);

  const handleUpdatePallet = useCallback(
    (index: number, field: "trackingKey" | "boxes", value: any) => {
      setPallets((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
    },
    [],
  );

  const handleRemovePallet = useCallback((index: number) => {
    setPallets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    if (pallets.length === 0) {
      setError("Debe agregar al menos un pallet de salida");
      return;
    }

    // Validate each pallet
    const errors: string[] = [];
    pallets.forEach((pallet, i) => {
      const available = availableTrackingKeys.find((tk) => tk.trackingKey === pallet.trackingKey);
      if (!available) {
        errors.push(`Pallet ${i + 1}: trackingKey no disponible`);
        return;
      }
      if (pallet.boxes <= 0) {
        errors.push(`Pallet ${i + 1}: cajas debe ser > 0`);
        return;
      }
      if (pallet.boxes > available.pendingBoxes) {
        errors.push(`Pallet ${i + 1}: excede cajas disponibles (${available.pendingBoxes})`);
        return;
      }
    });

    if (errors.length > 0) {
      setError(errors.join("; "));
      return;
    }

    // Convert to output pallets format
    const outputPalletsData = pallets.map((pallet) => ({
      outputPalletId: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      batchId: currentBatch?.batchId || batchId || "",
      outputQr: `OUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      trackingKey: pallet.trackingKey,
      boxes: pallet.boxes,
      sourceAllocation: [
        {
          assignmentId: "",
          boxes: pallet.boxes,
        },
      ],
      status: "created" as const,
      createdAt: new Date().toISOString(),
    }));

    createOutputPallets({
      outputPallets: outputPalletsData,
      trackingKey: outputPalletsData[0]?.trackingKey || "",
    });

    if (onClose) onClose();
  }, [
    pallets,
    availableTrackingKeys,
    currentBatch,
    batchId,
    createOutputPallets,
    setError,
    onClose,
  ]);

  const totalBoxes = pallets.reduce((sum, p) => sum + p.boxes, 0);
  const totalPending = availableTrackingKeys.reduce((sum, tk) => sum + tk.pendingBoxes, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crear Pallets de Salida</h1>
          <p className="text-gray-600 mt-1">Divida o fusione cajas en pallets para envío</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Available trackingKeys */}
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
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 4a2 2 0 11-4 0 2 2 0 014 0zm0 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Cajas Disponibles por TrackingKey ({totalPending} total)
          </h2>
          <span className="px-3 py-1 text-sm font-medium bg-blue-50 text-blue-700 rounded-full">
            {availableTrackingKeys.length} trackingKeys
          </span>
        </div>

        {availableTrackingKeys.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No hay cajas disponibles</h3>
            <p className="mt-2 text-gray-500">
              Todas las líneas están completas o no hay entregas confirmadas
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-medium">Producto</th>
                  <th className="text-left p-3 font-medium">Lote</th>
                  <th className="text-left p-3 font-medium">Caducidad</th>
                  <th className="text-right p-3 font-medium">Asignadas</th>
                  <th className="text-right p-3 font-medium">Devueltas</th>
                  <th className="text-right p-3 font-medium">Pérdida</th>
                  <th className="text-right p-3 font-medium">Salida</th>
                  <th className="text-right p-3 font-medium">Disponibles</th>
                </tr>
              </thead>
              <tbody>
                {availableTrackingKeys.map((tk) => (
                  <tr key={tk.trackingKey} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 truncate max-w-xs">{tk.productName}</td>
                    <td className="p-3 font-mono text-xs">{tk.lot}</td>
                    <td className="p-3">{tk.expiry || "—"}</td>
                    <td className="p-3 text-right">{tk.assignedBoxes}</td>
                    <td className="p-3 text-right">{tk.returnedBoxes}</td>
                    <td className="p-3 text-right">{tk.lossBoxes}</td>
                    <td className="p-3 text-right">
                      {tk.assignedBoxes -
                        tk.returnedBoxes -
                        tk.lossBoxes -
                        (tk.assignedBoxes - tk.returnedBoxes - tk.lossBoxes - tk.pendingBoxes)}
                    </td>
                    <td className="p-3 text-right font-bold text-green-600">{tk.pendingBoxes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pallets to create */}
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Pallets a Crear ({pallets.length})
          </h2>
          <button
            onClick={handleAddPallet}
            disabled={availableTrackingKeys.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
            Agregar pallet
          </button>
        </div>

        {pallets.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <p className="mt-2 text-gray-500">Agregue pallets usando el botón de arriba</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pallets.map((pallet, index) => (
              <div
                key={pallet.id}
                className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Pallet {index + 1}</h3>
                  <button
                    onClick={() => handleRemovePallet(index)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label={`Eliminar pallet ${index + 1}`}
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* TrackingKey selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      TrackingKey <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={pallet.trackingKey}
                      onChange={(e) => handleUpdatePallet(index, "trackingKey", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {availableTrackingKeys.map((tk) => (
                        <option key={tk.trackingKey} value={tk.trackingKey}>
                          {tk.productName} - {tk.lot} - {tk.expiry || "sin caducidad"} (disp:{" "}
                          {tk.pendingBoxes})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Boxes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cajas <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={
                        availableTrackingKeys.find((tk) => tk.trackingKey === pallet.trackingKey)
                          ?.pendingBoxes || 999
                      }
                      value={pallet.boxes}
                      onChange={(e) =>
                        handleUpdatePallet(index, "boxes", parseInt(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                    {availableTrackingKeys.find((tk) => tk.trackingKey === pallet.trackingKey) && (
                      <p className="mt-1 text-xs text-gray-500">
                        Máx:{" "}
                        {
                          availableTrackingKeys.find((tk) => tk.trackingKey === pallet.trackingKey)!
                            .pendingBoxes
                        }{" "}
                        cajas disponibles
                      </p>
                    )}
                  </div>

                  {/* Preview */}
                  <div className="md:col-span-1 flex items-end">
                    <div className="w-full p-3 bg-white border border-gray-200 rounded-lg">
                      <p className="text-xs text-gray-500">QR Generado</p>
                      <p className="font-mono text-sm text-gray-900">
                        OUT-{Date.now()}-{index}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pallets.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
              <div className="text-center">
                <p className="text-xs text-blue-700">Total Pallets</p>
                <p className="font-bold text-2xl text-blue-900">{pallets.length}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-blue-700">Total Cajas</p>
                <p className="font-bold text-2xl text-blue-900">{totalBoxes}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-blue-700">Cajas Restantes</p>
                <p className="font-bold text-2xl text-blue-900">{totalPending - totalBoxes}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={pallets.length === 0}
          className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <svg
            className="inline w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Crear Pallets de Salida
        </button>
      </div>
    </div>
  );
}

export default OutputPalletForm;
