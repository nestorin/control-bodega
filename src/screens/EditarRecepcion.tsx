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
import { QRCodeSVG } from "qrcode.react";
import type { Producto, Proveedor } from "./Configuracion";
import { ReceptionProductCard } from "./ProgramacionRecepcion";

const ORG_ID = "org_exepa_001";

interface Props {
  recId: string;
  suppliers: Proveedor[];
  products: Producto[];
  onBack: () => void;
  onSave: () => void;
}

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

export default function EditarRecepcion({ recId, suppliers, products, onBack, onSave }: Props) {
  const { user, canQuery } = useAuthorization();

  const { catalogoProveedores, catalogosLoading, catalogosError } = useCatalogos();

  // ============================================
  // Legacy Props Fallback (for migration period)
  // ============================================
  const recId = editId;
  const onBackLegacy = () => {
    ctxCancelReception();
    navigate("recepciones");
  };
  const onSaveLegacy = () => {
    navigate("recepciones");
  };

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
        if (active) setError(receptionErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canQuery, recId, services, merchandiseSuppliers, editReceptionData]);

  const editable = reception ? isEditableDraft(reception) : false;
  const totalPallets =
    reception?.plannedPallets?.length ?? productLines.reduce((sum, l) => sum + l.pallets, 0);

  function handleProductQuantityChange(lineIndex: number, quantity: number) {
    setProductLines((prev) =>
      prev.map((line) =>
        line.lineIndex === lineIndex ? { ...line, quantity: Math.max(1, quantity) } : line,
      ),
    );
  }

  function handleProductUnitChange(lineIndex: number, unit: string) {
    setProductLines((prev) =>
      prev.map((line) => (line.lineIndex === lineIndex ? { ...line, unit } : line)),
    );
  }

  function handleAddProductLine() {
    const nextLineIndex =
      productLines.length > 0 ? Math.max(...productLines.map((l) => l.lineIndex)) + 1 : 0;
    setProductLines((prev) => [
      ...prev,
      {
        lineIndex: nextLineIndex,
        productId: "",
        productName: "",
        quantity: 1,
        unit: "cajas",
        pallets: 1,
      },
    ]);
  }

  function handleRemoveProductLine(lineIndex: number) {
    setProductLines((prev) => prev.filter((line) => line.lineIndex !== lineIndex));
  }

  async function handleSave() {
    if (!reception || !editable || !services || !user?.uid) return;
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
      const lines = productLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unit: line.unit,
        lot: undefined,
        palletsCreated: 0,
      }));

      const groupedLines = new Map<
        number,
        { productId: string; quantity: number; unit: string; palletsCreated: number }
      >();
      for (const line of productLines) {
        const existing = groupedLines.get(line.lineIndex) ?? {
          productId: line.productId,
          quantity: 0,
          unit: line.unit,
          palletsCreated: 0,
        };
        existing.quantity += line.quantity;
        groupedLines.set(line.lineIndex, existing);
      }

      const plannedPallets: PlannedReceptionPalletDraft[] = productLines.map((line) => ({
        palletNumber: line.pallets,
        lineIndex: line.lineIndex,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unit: line.unit,
      }));

      const operationId = `op-edit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const editData: ReceptionCreateInput = {
        warehouseId: reception.warehouseId,
        supplierId,
        purchaseOrderId: reception.purchaseOrderId,
        purchaseOrderNumber: reception.purchaseOrderNumber,
        folio: reception.folio || reception.purchaseOrderNumber || reception.id,
        scheduledDate: reception.scheduledDate,
        supplierCode: supplierRecord.code,
        supplierName: supplierRecord.name,
        logisticsProvider: logisticsProvider.trim(),
        productName: productLines.map((l) => l.productName).join(", "),
        palletCount: plannedPallets.length,
        plannedPallets,
        status: "DRAFT",
        operationId,
        actorUserId: user.uid,
      };

      const updated = await services.receptions.editReception(
        reception.id,
        editData,
        lines,
        user.uid,
        operationId,
        reception.version,
      );
      setReception(updated);
      onSaveLegacy();
    } catch (saveError) {
      setError(receptionErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
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
        <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={onBackLegacy}>
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

        {!editable && (
          <div className="rounded-xl border border-[#f2d49a] bg-[#fff8e8] px-4 py-3 text-sm text-[#76551f]">
            Esta recepción no se puede editar: solo se permiten cambios en borradores que todavía no
            iniciaron la captura de tarimas.
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[#f4f7f8] p-4">
            <p className="text-xs font-bold uppercase text-[#607078]">Orden de compra</p>
            <p className="mt-1 font-semibold text-[#172126]">
              {reception.purchaseOrderNumber || "—"}
            </p>
          </div>
          <div className="rounded-xl bg-[#f4f7f8] p-4">
            <p className="text-xs font-bold uppercase text-[#607078]">Total de tarimas</p>
            <p className="mt-1 font-semibold text-[#172126]">{totalPallets}</p>
            <p className="mt-1 text-xs text-[#607078]">
              Calculado del plan de tarimas para mantener cantidades y QR sincronizados.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold text-[#607078]">
            Proveedor de mercancía
            {editable ? (
              <select
                className="min-h-11 rounded-lg border border-[#dce4e7] px-3 text-[#172126]"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Seleccionar proveedor</option>
                {reception.supplierId &&
                  !merchandiseSuppliers.some(
                    (supplier) => supplier.id === reception.supplierId,
                  ) && (
                    <option value={reception.supplierId}>
                      {reception.supplierName || reception.supplierCode || "Proveedor actual"}
                    </option>
                  )}
                {merchandiseSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span className="min-h-11 rounded-lg bg-[#f4f7f8] px-3 py-3 text-[#172126]">
                {reception.supplierName || reception.supplierCode || "Sin proveedor"}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-[#607078]">
            Proveedor logístico
            {editable ? (
              <select
                className="min-h-11 rounded-lg border border-[#dce4e7] px-3 text-[#172126]"
                value={logisticsProvider}
                onChange={(event) => setLogisticsProvider(event.target.value)}
              >
                <option value="">Sin proveedor logístico</option>
                {logisticsProvider &&
                  !logisticsSuppliers.some((supplier) => supplier.nombre === logisticsProvider) && (
                    <option value={logisticsProvider}>{logisticsProvider}</option>
                  )}
                {logisticsSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.nombre}>
                    {supplier.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span className="min-h-11 rounded-lg bg-[#f4f7f8] px-3 py-3 text-[#172126]">
                {reception.logisticsProvider || "Sin proveedor logístico"}
              </span>
            )}
          </label>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#172126]">Productos programados</h2>
            {editable && (
              <button
                type="button"
                onClick={handleAddProductLine}
                className="text-sm text-[#3276a8] hover:underline"
              >
                + Agregar producto
              </button>
            )}
          </div>
          {productLines.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {productLines.map((line) =>
                editable ? (
                  <ReceptionProductCard
                    key={line.lineIndex}
                    number={line.lineIndex + 1}
                    inputId={`edit-product-${line.lineIndex}`}
                    inputAriaLabel={`Producto línea ${line.lineIndex + 1}`}
                    value={line.productName}
                    onChange={(value) =>
                      setProductLines((prev) =>
                        prev.map((current) =>
                          current.lineIndex === line.lineIndex
                            ? { ...current, productName: value, productId: "" }
                            : current,
                        ),
                      )
                    }
                    onSelect={(product) =>
                      setProductLines((prev) =>
                        prev.map((current) =>
                          current.lineIndex === line.lineIndex
                            ? {
                                ...current,
                                productName: product.nombre,
                                productId: product.id,
                                unit: product.unidad,
                              }
                            : current,
                        ),
                      )
                    }
                    catalogos={products}
                    onRemove={() => handleRemoveProductLine(line.lineIndex)}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid min-w-0 gap-1 text-xs font-bold uppercase tracking-wide text-[#607078]">
                        Cantidad
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(event) =>
                            handleProductQuantityChange(
                              line.lineIndex,
                              parseInt(event.target.value) || 1,
                            )
                          }
                          className="min-h-11 w-full min-w-0 rounded-lg border border-[#dce4e7] bg-white px-3 text-[13px] text-[#172126]"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-xs font-bold uppercase tracking-wide text-[#607078]">
                        Unidad
                        <select
                          value={line.unit}
                          onChange={(event) =>
                            handleProductUnitChange(line.lineIndex, event.target.value)
                          }
                          className="min-h-11 w-full min-w-0 rounded-lg border border-[#dce4e7] bg-white px-3 text-[13px] text-[#172126]"
                        >
                          <option value="cajas">Cajas</option>
                          <option value="piezas">Piezas</option>
                          <option value="unidades">Unidades</option>
                          <option value="pallets">Pallets</option>
                        </select>
                      </label>
                    </div>
                    <p className="text-sm text-[#607078]">
                      Línea {line.lineIndex + 1} · {line.pallets} tarimas
                    </p>
                  </ReceptionProductCard>
                ) : (
                  <div
                    key={line.lineIndex}
                    className="min-w-0 rounded-2xl border border-[#dce4e7] bg-[#fbfcfc] p-4 shadow-sm sm:p-5"
                  >
                    <p className="break-words font-semibold text-[#172126]">{line.productName}</p>
                    <p className="mt-1 text-sm text-[#607078]">
                      {line.quantity} {line.unit} · {line.pallets} tarimas
                    </p>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-[#f4f7f8] p-4 text-sm text-[#607078]">
              Esta recepción no tiene un plan detallado de tarimas.
              {editable && " Agregá productos usando el botón de arriba."}
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-base font-bold text-[#172126]">Tarimas y códigos QR</h2>
          {reception.plannedPallets && reception.plannedPallets.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {reception.plannedPallets.map((pallet) => (
                <article
                  key={pallet.qrIdentifier}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-[#edf1f3] p-3"
                >
                  <QRCodeSVG
                    value={pallet.qrIdentifier}
                    size={76}
                    level="H"
                    marginSize={2}
                    title={`Código QR ${pallet.qrIdentifier}`}
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-[#172126]">
                      Tarima {pallet.palletNumber} · {pallet.status}
                    </p>
                    <p className="truncate text-sm text-[#607078]">
                      {pallet.productName} · {pallet.quantity} {pallet.unit}
                    </p>
                    <p className="break-all text-xs font-semibold text-[#3276a8]">
                      {pallet.qrIdentifier}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-[#f4f7f8] p-4 text-sm text-[#607078]">
              Esta recepción no tiene códigos QR disponibles en su plan.
            </p>
          )}
        </div>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-[#edf1f3] pt-4">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[#dce4e7] px-5 font-bold text-[#16343f]"
            onClick={onBackLegacy}
          >
            Volver
          </button>
          {editable && (
            <button
              type="button"
              className="min-h-11 rounded-lg bg-[#16343f] px-5 font-bold text-white disabled:opacity-60"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
