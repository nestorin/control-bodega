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
import type { Proveedor } from "./Configuracion";

const ORG_ID = "org_exepa_001";

interface Props {
  recId: string;
  suppliers: Proveedor[];
  onBack: () => void;
  onSave: () => void;
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

export default function EditarRecepcion({ recId, suppliers, onBack, onSave }: Props) {
  const { user, canQuery } = useAuthorization();
  const services = useMemo(() => (db ? createFirestoreServices(db, ORG_ID) : null), []);
  const [reception, setReception] = useState<ReceptionDoc | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [logisticsProvider, setLogisticsProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!canQuery || !services) {
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
            suppliers.find((supplier) => supplier.nombre === loaded.supplierName)?.id ||
            "",
        );
        setLogisticsProvider(loaded.logisticsProvider || "");
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
  }, [canQuery, recId, services, suppliers]);

  const plannedPallets = reception?.plannedPallets ?? [];
  const editable = reception ? isEditableDraft(reception) : false;
  const totalPallets = plannedPallets.length || reception?.palletCount || 0;
  const productLines = [
    ...plannedPallets
      .reduce((lines, pallet) => {
        const current = lines.get(pallet.lineIndex) ?? {
          productName: pallet.productName,
          quantity: 0,
          unit: pallet.unit,
          pallets: 0,
        };
        current.quantity += pallet.quantity;
        current.pallets += 1;
        lines.set(pallet.lineIndex, current);
        return lines;
      }, new Map<number, { productName: string; quantity: number; unit: string; pallets: number }>())
      .entries(),
  ]
    .sort(([left], [right]) => left - right)
    .map(([, line]) => line);

  async function handleSave() {
    if (!reception || !editable || !services || !user?.uid) return;
    setSaving(true);
    setError(null);
    try {
      const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
      if (!supplierId) throw new Error("Seleccioná un proveedor de mercancía.");
      if (!selectedSupplier && supplierId !== reception.supplierId) {
        throw new Error("El proveedor seleccionado ya no está disponible en el catálogo.");
      }

      const supplierRecord = await services.suppliers.getById(supplierId);
      if (!supplierRecord) throw new Error("No se encontró el proveedor en el catálogo.");

      const groupedLines = new Map<
        number,
        { productId: string; quantity: number; unit: string; palletsCreated: number }
      >();
      for (const pallet of plannedPallets) {
        const line = groupedLines.get(pallet.lineIndex) ?? {
          productId: pallet.productId,
          quantity: 0,
          unit: pallet.unit,
          palletsCreated: 0,
        };
        line.quantity += pallet.quantity;
        groupedLines.set(pallet.lineIndex, line);
      }
      const lines = [...groupedLines.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, line]) => line);
      const palletDrafts: PlannedReceptionPalletDraft[] = plannedPallets.map(
        ({ palletNumber, lineIndex, productId, productName, quantity, unit }) => ({
          palletNumber,
          lineIndex,
          productId,
          productName,
          quantity,
          unit,
        }),
      );
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
        productName: reception.productName,
        palletCount: plannedPallets.length,
        plannedPallets: palletDrafts,
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
      onSave();
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
        <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={onBack}>
          Volver
        </button>
      </section>
    );
  }

  const merchandiseSuppliers = suppliers.filter((supplier) => supplier.tipo === "mercancia");
  const logisticsSuppliers = suppliers.filter((supplier) => supplier.tipo === "logistica");
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
          <h2 className="mb-3 text-base font-bold text-[#172126]">Productos programados</h2>
          {productLines.length ? (
            <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#edf1f3]">
              {productLines.map((line, index) => (
                <div
                  key={`${line.productName}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="font-semibold text-[#172126]">{line.productName}</span>
                  <span className="text-sm text-[#607078]">
                    {line.quantity} {line.unit} · {line.pallets} tarimas
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-[#f4f7f8] p-4 text-sm text-[#607078]">
              Esta recepción no tiene un plan detallado de tarimas.
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-base font-bold text-[#172126]">Tarimas y códigos QR</h2>
          {plannedPallets.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {plannedPallets.map((pallet) => (
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
            onClick={onBack}
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
