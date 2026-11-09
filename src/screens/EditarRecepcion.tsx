/**
 * EditarRecepcion — Migrated to new architecture (God Component Refactor Phase 7)
 *
 * Uses hooks directly instead of props:
 * - useReceptionFlow for navigation and reception state
 * - useCatalogos for supplier catalogs
 * - useAuthorization for auth state
 */

import { useEffect, useMemo, useState } from "react";
import {
  createFirestoreServices,
  type PlannedReceptionPalletDraft,
  type ReceptionCreateInput,
  type ReceptionDoc,
} from "@/services/firestore";
import { db } from "@/lib/firebase";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useReceptionFlow } from "@/hooks/useReceptionFlow";
import { QRCodeSVG } from "qrcode.react";
import type { Producto, Proveedor } from "./Configuracion";
import { ReceptionProductCard } from "./ProgramacionRecepcion";
import { useNavigate } from "react-router-dom";

const ORG_ID = "org_exepa_001";

interface EditableProductLine {
  lineIndex: number;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  pallets: number;
}

function isEditableDraft(reception: ReceptionDoc): boolean {
  const pallets = reception.plannedPallets ?? [];
  return (
    reception.status === "DRAFT" &&
    pallets.length > 0 &&
    pallets.every((pallet) => pallet.status === "PLANNED" && !pallet.activated)
  );
}

function receptionErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code.includes("permission-denied")) return "No tenés permisos para editar esta recepción.";
  if (code.includes("failed-precondition")) {
    return "La recepción cambió o ya comenzó su captura. Volvé al listado y consultá su estado actual.";
  }
  return error instanceof Error ? error.message : "No se pudo cargar la recepción.";
}

export default function EditarRecepcion() {
  const { user, canQuery } = useAuthorization();
  const navigate = useNavigate();

  const { catalogoProveedores, catalogosLoading, catalogosError } = useCatalogos();
  const { editReceptionData } = useReceptionFlow();

  const recId = editReceptionData?.receptionId;

  const services = useMemo(() => (db ? createFirestoreServices(db, ORG_ID) : null), []);
  const [reception, setReception] = useState<ReceptionDoc | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [logisticsProvider, setLogisticsProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productLines, setProductLines] = useState<EditableProductLine[]>([]);

  // Filter suppliers by type
  const merchandiseSuppliers = catalogoProveedores.filter(
    (supplier) => supplier.tipo === "mercancia",
  );
  const logisticsSuppliers = catalogoProveedores.filter(
    (supplier) => supplier.tipo === "logistica",
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Use editReceptionData from context if available, otherwise load from Firestore
    if (editReceptionData) {
      if (!active) return;
      const receptionData = editReceptionData as unknown as ReceptionDoc;
      setReception(receptionData);
      setSupplierId(
        receptionData.supplierId ||
          merchandiseSuppliers.find((supplier) => supplier.nombre === receptionData.supplierName)
            ?.id ||
          "",
      );
      setLogisticsProvider(receptionData.logisticsProvider || "");

      // Initialize editable product lines from plannedPallets
      const plannedPallets = receptionData.plannedPallets ?? [];
      const linesMap = new Map<number, EditableProductLine>();
      plannedPallets.forEach((pallet) => {
        const existing = linesMap.get(pallet.lineIndex);
        if (existing) {
          existing.quantity += pallet.quantity;
          existing.pallets += 1;
        } else {
          linesMap.set(pallet.lineIndex, {
            lineIndex: pallet.lineIndex,
            productId: pallet.productId,
            productName: pallet.productName,
            quantity: pallet.quantity,
            unit: pallet.unit,
            pallets: 1,
          });
        }
      });
      setProductLines(Array.from(linesMap.values()).sort((a, b) => a.lineIndex - b.lineIndex));
      setLoading(false);
      return;
    }

    if (!canQuery || !services || !recId) {
      setError("Se requiere una sesión autorizada para consultar la recepción.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void services.receptions
      .getById(recId)
      .then((loaded) => {
        if (!active) return;
        if (!loaded) {
          setError("No se encontró la recepción seleccionada.");
          return;
        }
        setReception(loaded);
        setSupplierId(
          loaded.supplierId ||
            merchandiseSuppliers.find((supplier) => supplier.nombre === loaded.supplierName)?.id ||
            "",
        );
        setLogisticsProvider(loaded.logisticsProvider || "");

        // Initialize editable product lines from plannedPallets
        const plannedPallets = loaded.plannedPallets ?? [];
        const linesMap = new Map<number, EditableProductLine>();
        plannedPallets.forEach((pallet) => {
          const existing = linesMap.get(pallet.lineIndex);
          if (existing) {
            existing.quantity += pallet.quantity;
            existing.pallets += 1;
          } else {
            linesMap.set(pallet.lineIndex, {
              lineIndex: pallet.lineIndex,
              productId: pallet.productId,
              productName: pallet.productName,
              quantity: pallet.quantity,
              unit: pallet.unit,
              pallets: 1,
            });
          }
        });
        setProductLines(Array.from(linesMap.values()).sort((a, b) => a.lineIndex - b.lineIndex));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(receptionErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [recId, canQuery, services, catalogosLoading, editReceptionData, merchandiseSuppliers]);

  const editable = isEditableDraft(reception!);

  async function handleSave() {
    if (!reception || !services || !user) return;
    setSaving(true);
    setError(null);
    try {
      const selectedSupplier = merchandiseSuppliers.find((supplier) => supplier.id === supplierId);
      if (!supplierId) throw new Error("Seleccioná un proveedor de mercancía.");
      if (!selectedSupplier && supplierId !== reception.supplierId) {
        throw new Error("El proveedor seleccionado ya no está disponible en el catálogo.");
      }

      const supplierRecord = await services.suppliers.getById(supplierId);
      if (!supplierRecord) throw new Error("No se encontró el proveedor en el catálogo.");
      if (productLines.some((line) => !line.productId || !line.productName.trim())) {
        throw new Error("Seleccioná cada producto del catálogo antes de guardar.");
      }

      // Build lines from productLines
      const lines: PlannedReceptionPalletDraft[] = productLines.map((line) => ({
        lineIndex: line.lineIndex,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unit: line.unit,
        status: "PLANNED" as const,
        activated: false,
      }));

      // Create edit data for the reception
      const editData: ReceptionCreateInput = {
        hasOC: reception.hasOC ?? true,
        ocFolio: reception.ocFolio,
        tarimas: reception.tarimas,
        supplierId: supplierRecord.id,
        supplierName: supplierRecord.nombre,
        logisticsProvider: logisticsProvider || reception.logisticsProvider,
        warehouseId: reception.warehouseId,
        fechaRecepcion: reception.fechaRecepcion,
        lote: reception.lote,
        caducidad: reception.caducidad,
      };

      // Generate operation ID if needed
      const operationId = reception.operationId || `op-${Date.now()}`;

      const updated = await services.receptions.editReception(
        reception.id,
        editData,
        lines,
        user.uid,
        operationId,
        reception.version,
      );
      setReception(updated);
      navigate("recepciones");
    } catch (saveError) {
      setError(receptionErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function handleAddProductLine() {
    const nextIndex = productLines.length > 0 ? Math.max(...productLines.map((l) => l.lineIndex)) + 1 : 0;
    setProductLines((prev) => [
      ...prev,
      {
        lineIndex: nextIndex,
        productId: "",
        productName: "",
        quantity: 0,
        unit: "",
        pallets: 0,
      },
    ]);
  }

  function handleRemoveProductLine(lineIndex: number) {
    setProductLines((prev) => prev.filter((line) => line.lineIndex !== lineIndex));
  }

  function handleProductSelect(lineIndex: number, product: Producto) {
    setProductLines((prev) =>
      prev.map((current) =>
        current.lineIndex === lineIndex
          ? {
              ...current,
              productName: product.nombre,
              productId: product.id,
              unit: product.unidad,
            }
          : current,
      ),
    );
  }

  if (loading) {
    return (
      <div className="p-7 text-[#607078]" role="status">
        Cargando recepción…
      </div>
    );
  }
  if (!reception) {
    return (
      <section className="m-4 rounded-2xl bg-white p-6 md:m-7">
        <p role="alert" className="text-red-700">
          {error || "No se pudo cargar la recepción."}
        </p>
        <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={() => navigate("recepciones")}>
          Volver
        </button>
      </section>
    );
  }

  const displayFolio = reception.folio || reception.purchaseOrderNumber || reception.id;

  return (
    <div className="size-full overflow-y-auto p-4 md:p-7">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm md:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#3276a8]">
              {editable ? "BORRADOR EDITABLE" : "CONSULTA DE RECEPCIÓN"}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-[#172126]">{displayFolio}</h1>
          </div>
          <span className="rounded-full bg-[#e7f0f2] px-3 py-1 text-sm font-bold text-[#3276a8]">
            {reception.status}
          </span>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-[#607078]">
            <span className="font-bold">Proveedor:</span>
            <span>{reception.supplierName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#607078]">
            <span className="font-bold">Proveedor logístico:</span>
            <span>{reception.logisticsProvider || "Sin proveedor logístico"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#607078]">
            <span className="font-bold">Tarimas:</span>
            <span>{reception.tarimas}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#607078]">
            <span className="font-bold">Fecha:</span>
            <span>{reception.fechaRecepcion || "—"}</span>
          </div>
        </div>

        {editable && (
          <section className="rounded-xl border border-[#dce4e7] bg-[#f8fafb] p-4">
            <h2 className="mb-3 text-lg font-bold text-[#172126]">Líneas de producto</h2>
            <div className="space-y-3">
              {productLines.map((line) => (
                <ReceptionProductCard
                  key={line.lineIndex}
                  line={line}
                  catalogos={catalogoProductos}
                  onRemove={() => handleRemoveProductLine(line.lineIndex)}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-[#607078]">Producto</label>
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const product = catalogoProductos.find((p) => p.id === e.target.value);
                          if (product) handleProductSelect(line.lineIndex, product);
                        }}
                        className="rounded-lg border border-[#dce4e7] bg-white px-3 py-2 text-sm focus:border-[#3276a8] focus:outline-none"
                      >
                        <option value="">Seleccionar producto</option>
                        {catalogoProductos.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.nombre} ({product.codigo})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-[#607078]">Cantidad</label>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          setProductLines((prev) =>
                            prev.map((current) =>
                              current.lineIndex === line.lineIndex
                                ? { ...current, quantity: parseInt(e.target.value) || 0 }
                                : current,
                            ),
                          )
                        }
                        min="0"
                        className="rounded-lg border border-[#dce4e7] bg-white px-3 py-2 text-sm focus:border-[#3276a8] focus:outline-none"
                      />
                    </div>
                  </div>
                </ReceptionProductCard>
              ))}
              {editable && (
                <button
                  type="button"
                  onClick={handleAddProductLine}
                  className="flex items-center gap-2 w-full rounded-lg border-2 border-dashed border-[#dce4e7] bg-white py-2 text-sm font-medium text-[#3276a8] hover:bg-[#f4f7f8]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Agregar línea de producto
                </button>
              )}
            </div>
          </section>
        )}

        <div className="flex flex-col md:flex-row gap-3 justify-end pt-4 border-t border-[#dce4e7]">
          <button
            type="button"
            onClick={() => navigate("recepciones")}
            className="flex items-center gap-2 min-h-11 rounded-lg border border-[#dce4e7] bg-white px-5 py-2 text-sm font-semibold text-[#172126] hover:bg-[#f8fafb]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Volver
          </button>
          {editable && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 min-h-11 rounded-lg bg-[#3276a8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2a6291] disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
                  </svg>
                  Guardando…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Guardar cambios
                </>
              )}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}