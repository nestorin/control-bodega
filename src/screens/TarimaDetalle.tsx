import { useState, useRef, useEffect, useMemo } from "react";

import { PalletDoc } from "@/services/firestore/types";
import { TarimaDetailView, TarimaDetailState } from "@/types/tarimaDetail";
import { parseTarimaQR } from "@/types/qrcode";
import { createFirestoreServices } from "@/services/firestore";
import { db } from "@/lib/firebase";
import {
  downloadTarimaQr,
  downloadTarimaQrBatch,
  type TarimaQrFormat,
} from "@/services/tarimaQrDownload";
import { generateReceptionQrPngs } from "@/services/receptionQr";
import { QRCodeSVG } from "qrcode.react";
import "./TarimaDetalle.css";

const assetPathPrefix = "/assets";
const imgWarehouse = `${assetPathPrefix}/fc229.svg`;
const imgIndicador = `${assetPathPrefix}/08d70.svg`;
const imgIndicadorBlue = `${assetPathPrefix}/cf2d3.svg`;
const imgQrCode = `${assetPathPrefix}/60da5.svg`;

const FORMATS = ["SVG", "PNG", "JPEG", "PDF"] as const;
type Format = TarimaQrFormat;

const ORG_ID = "org_exepa_001";

interface ReceptionReference {
  recId: string;
  receptionId?: string;
  tarimas: number;
  proveedor: string;
  proveedorLogistico: string;
}

interface Props {
  onBack: () => void;
  onViewReference?: (reference: ReceptionReference) => void;
  currentReception?: {
    ocFolio: string;
    tarimas: number;
    receptionId?: string;
    proveedor?: string;
    proveedorLogistico?: string;
  } | null;
  qrCode?: string;
  authorizedWarehouseIds?: string[];
}

export default function TarimaDetalle({
  onBack,
  onViewReference,
  currentReception,
  qrCode,
  authorizedWarehouseIds,
}: Props) {
  const [showFormats, setShowFormats] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printPallets, setPrintPallets] = useState<
    Array<{ qrIdentifier: string; palletNumber: number }>
  >([]);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fsServices = useMemo(() => createFirestoreServices(db!, ORG_ID), []);
  const { pallets, products, suppliers, receptions } = fsServices;

  const [detailState, setDetailState] = useState<TarimaDetailState>({
    status: "loading",
  });
  const [legacyMode, setLegacyMode] = useState(false);

  useEffect(() => {
    if (qrCode) {
      setLegacyMode(false);
      fetchTarimaDetail(qrCode);
    } else {
      setLegacyMode(true);
      setDetailState({ status: "success", data: buildLegacyData() });
    }
  }, [qrCode]);

  useEffect(() => {
    let active = true;
    const identifier = detailState.status === "success" ? detailState.data.qrIdentifier : null;
    setQrPreview(null);
    if (!identifier)
      return () => {
        active = false;
      };

    void generateReceptionQrPngs([identifier])
      .then(([image]) => {
        if (active) setQrPreview(image ?? null);
      })
      .catch((error) => {
        console.error("Error generando vista QR de tarima:", error);
        if (active) setQrPreview(null);
      });

    return () => {
      active = false;
    };
  }, [detailState]);

  useEffect(() => {
    if (printPallets.length === 0) return;
    const timer = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(timer);
  }, [printPallets]);

  async function fetchTarimaDetail(qrIdentifier: string) {
    setDetailState({ status: "loading" });
    try {
      const pallet = await pallets.getByQR(qrIdentifier, authorizedWarehouseIds ?? []);
      if (!pallet) {
        setDetailState({ status: "not-found", qrCode: qrIdentifier });
        return;
      }

      // Fetch related product
      const product = pallet.productId ? await products.getById(pallet.productId) : null;

      // Fetch reception to get supplierId and folio
      const reception = pallet.receptionId ? await receptions.getById(pallet.receptionId) : null;

      // Fetch supplier from reception.supplierId
      const supplier = reception?.supplierId ? await suppliers.getById(reception.supplierId) : null;

      const detail: TarimaDetailView = {
        receptionId: pallet.receptionId,
        qrIdentifier: pallet.qrIdentifier,
        lot: pallet.lot || "",
        expiryDate: pallet.expiryDate ?? ({ toDate: () => new Date() } as any),
        quantity: pallet.quantity,
        unit: pallet.unit,
        status: pallet.status,
        location: pallet.location,
        createdAt: pallet.createdAt,
        productName: product?.name || "Producto desconocido",
        productCode: product?.sku || "",
        supplierName: supplier?.name || "Proveedor desconocido",
        supplierCode: supplier?.code || "",
        receptionFolio: reception?.purchaseOrderId || reception?.id || "",
        receptionDate:
          reception?.receivedAt ?? reception?.createdAt ?? ({ toDate: () => new Date() } as any),
      };

      setDetailState({ status: "success", data: detail });
    } catch (error) {
      setDetailState({
        status: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
        retry: () => fetchTarimaDetail(qrIdentifier),
      });
    }
  }

  function buildLegacyData(): TarimaDetailView {
    const ocFolio = currentReception?.ocFolio ?? "OC-24891";
    const tarimasTotal = currentReception?.tarimas ?? 20;
    const tarimaNum = 3;
    const ocNumber = ocFolio.replace("OC-", "");
    const tarimaId = `TQR-${ocNumber}-${String(tarimaNum).padStart(3, "0")}`;

    return {
      qrIdentifier: tarimaId,
      lot: "LT-0926-A",
      expiryDate: { toDate: () => new Date("2027-03-15") } as any,
      quantity: 48,
      unit: "cajas",
      status: "RECEIVED",
      createdAt: { toDate: () => new Date("2026-09-19") } as any,
      productName: "Agua mineral 600 ml",
      productCode: "AGUA-600ML",
      supplierName: "Distribuidora del Norte",
      supplierCode: "PROV-001",
      receptionFolio: "19 Sep 2026 · 09:42",
      receptionDate: { toDate: () => new Date("2026-09-19") } as any,
    };
  }

  async function downloadAs(format: Format) {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadTarimaQr(getTarimaId(), format);
      setShowFormats(false);
    } catch (error) {
      console.error("Error descargando código QR de tarima:", error);
      setDownloadError(
        error instanceof Error ? error.message : "No se pudo descargar el código QR.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  async function printReceptionCodes(currentQrIdentifier: string) {
    if (isPreparingPrint) return;
    setIsPreparingPrint(true);
    setPrintError(null);
    try {
      const warehouseIds = authorizedWarehouseIds ?? [];
      const currentPallet = await pallets.getByQR(currentQrIdentifier, warehouseIds);
      if (!currentPallet) throw new Error("No se pudo identificar la recepción de esta tarima.");

      const [registeredPallets, reception] = await Promise.all([
        pallets.getByReception(currentPallet.receptionId, warehouseIds),
        receptions.getById(currentPallet.receptionId),
      ]);
      const qrIdentifiers = new Set([
        ...registeredPallets.map((pallet) => pallet.qrIdentifier),
        ...(reception?.plannedPallets ?? []).map((pallet) => pallet.qrIdentifier),
      ]);
      if (qrIdentifiers.size === 0) throw new Error("Esta recepción todavía no tiene códigos QR.");

      const expectedPalletCount = reception?.palletCount ?? reception?.plannedPallets?.length;
      if (expectedPalletCount && qrIdentifiers.size < expectedPalletCount) {
        throw new Error(
          "No se pudieron cargar todos los códigos QR de la recepción. Intentá nuevamente.",
        );
      }

      const orderedCodes = [...qrIdentifiers].sort((left, right) => {
        const leftNumber = Number(left.match(/-(\d+)$/)?.[1] ?? 0);
        const rightNumber = Number(right.match(/-(\d+)$/)?.[1] ?? 0);
        return leftNumber - rightNumber || left.localeCompare(right);
      });
      setPrintPallets(
        orderedCodes.map((qrIdentifier, index) => ({
          qrIdentifier,
          palletNumber: Number(qrIdentifier.match(/-(\d+)$/)?.[1]) || index + 1,
        })),
      );
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : "No se pudo preparar la impresión.");
    } finally {
      setIsPreparingPrint(false);
    }
  }

  async function downloadReceptionCodes() {
    if (isPreparingPrint) return;
    setIsPreparingPrint(true);
    setPrintError(null);
    try {
      const warehouseIds = authorizedWarehouseIds ?? [];
      const currentPallet = await pallets.getByQR(getTarimaId(), warehouseIds);
      if (!currentPallet) throw new Error("No se pudo identificar la recepción de esta tarima.");

      const [registeredPallets, reception] = await Promise.all([
        pallets.getByReception(currentPallet.receptionId, warehouseIds),
        receptions.getById(currentPallet.receptionId),
      ]);
      const identifiers = new Set([
        ...registeredPallets.map((pallet) => pallet.qrIdentifier),
        ...(reception?.plannedPallets ?? []).map((pallet) => pallet.qrIdentifier),
      ]);
      const expectedCount = reception?.palletCount ?? reception?.plannedPallets?.length;
      if (identifiers.size === 0 || (expectedCount && identifiers.size < expectedCount)) {
        throw new Error("No se pudieron cargar todos los códigos QR de la recepción.");
      }
      const orderedIdentifiers = [...identifiers].sort((left, right) => {
        const leftNumber = Number(left.match(/-(\d+)$/)?.[1] ?? 0);
        const rightNumber = Number(right.match(/-(\d+)$/)?.[1] ?? 0);
        return leftNumber - rightNumber || left.localeCompare(right);
      });
      await downloadTarimaQrBatch(
        orderedIdentifiers,
        reception?.purchaseOrderId || currentPallet.receptionId,
      );
    } catch (error) {
      setPrintError(
        error instanceof Error ? error.message : "No se pudieron descargar los códigos QR.",
      );
    } finally {
      setIsPreparingPrint(false);
    }
  }

  function getTarimaId(): string {
    if (detailState.status === "success") {
      return detailState.data.qrIdentifier;
    }
    const ocFolio = currentReception?.ocFolio ?? "OC-24891";
    const ocNumber = ocFolio.replace("OC-", "");
    return `TQR-${ocNumber}-003`;
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCustomImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  function renderLoading() {
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-7 size-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <div className="w-24 h-24 border-3 border-[#3276a8] border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-lg font-medium text-gray-900">Cargando tarima…</p>
        </div>
      </div>
    );
  }

  function renderNotFound(qrCode: string) {
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-7 size-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <svg
            className="w-24 h-24 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-4 text-lg font-medium text-gray-900">Tarima no encontrada</p>
          <p className="mt-1 text-sm text-gray-500">
            El código QR "{qrCode}" no corresponde a ninguna tarima registrada.
          </p>
          <button
            onClick={onBack}
            className="mt-6 px-6 py-2 bg-[#16343f] text-white rounded-[10px] font-bold hover:bg-[#1e4456] transition-colors touch-target"
          >
            Volver al escáner
          </button>
        </div>
      </div>
    );
  }

  function renderError(message: string, retry: () => void) {
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-7 size-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <svg
            className="w-24 h-24 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="mt-4 text-lg font-medium text-gray-900">Error al cargar la tarima</p>
          <p className="mt-1 text-sm text-gray-500">{message}</p>
          <div className="mt-6 flex gap-4">
            <button
              onClick={retry}
              className="px-6 py-2 bg-[#16343f] text-white rounded-[10px] font-bold hover:bg-[#1e4456] transition-colors touch-target"
            >
              Reintentar
            </button>
            <button
              onClick={onBack}
              className="px-6 py-2 border border-[#dce4e7] text-[#172126] rounded-[10px] font-bold hover:bg-[#f4f7f8] transition-colors touch-target"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSuccess(data: TarimaDetailView) {
    const tarimaId = data.qrIdentifier;
    const printPages = Array.from({ length: Math.ceil(printPallets.length / 4) }, (_, page) =>
      printPallets.slice(page * 4, page * 4 + 4),
    );

    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-7 size-full overflow-y-auto">
        {/* Left column — tarima info */}
        <div className="lg:w-[360px] lg:shrink-0 w-full lg:flex-none flex flex-col gap-4">
          <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-4 p-4 lg:p-5 rounded-[20px] w-full">
            <div className="flex flex-col gap-3 items-center w-full">
              <div
                className="relative bg-[#fff5dd] flex flex-col gap-2 items-center justify-center rounded-[28px] size-[220px] group cursor-pointer overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
                title="Cargar imagen"
              >
                {customImage ? (
                  <img
                    alt="Imagen cargada"
                    src={customImage}
                    className="size-full object-cover rounded-[28px]"
                  />
                ) : (
                  <>
                    <img
                      alt=""
                      style={{ width: "145.2px", height: "127.6px" }}
                      src={imgWarehouse}
                    />
                    <p
                      className="font-extrabold text-[#8e592e] text-[11px] whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 800,
                      }}
                    >
                      TARIMA {data.qrIdentifier.split("-").pop()?.padStart(2, "0") || "03"} /{" "}
                      {data.receptionFolio
                        ? data.receptionFolio.split("·")[1]?.trim().split(" ")[0]
                        : "20"}
                    </p>
                  </>
                )}
                <div className="absolute inset-0 bg-[rgba(22,52,63,0.45)] flex flex-col gap-1 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-[28px]">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span
                    className="text-white text-[11px] font-bold"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {customImage ? "Cambiar imagen" : "Cargar imagen"}
                  </span>
                  <span
                    className="text-white/70 text-[10px]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Tarima real o logo
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
              <p
                className="text-[#172126] text-[20px] lg:text-[23px] whitespace-nowrap truncate w-full text-center"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                {data.qrIdentifier}
              </p>
              <div className="relative flex gap-2 items-start flex-wrap justify-center">
                <div className="bg-[#e2f5ec] flex gap-[7px] items-center px-[11px] py-[7px] rounded-full">
                  <img alt="" className="size-[7px]" src={imgIndicador} />
                  <p
                    className="font-bold text-[#16845b] text-[13px] whitespace-nowrap"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Sistema en línea
                  </p>
                </div>
                <button
                  onClick={() => setShowFormats((show) => !show)}
                  aria-expanded={showFormats}
                  disabled={isDownloading}
                  aria-busy={isDownloading}
                  aria-label={isDownloading ? "Preparando código QR" : "Descargar código QR"}
                  className="flex items-center gap-2 bg-[#f2b84b] text-white px-3 py-2 rounded-[8px] font-bold text-[11px] hover:bg-[#d9a03e] transition-colors touch-target"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span
                    className="text-[11px] lg:text-[12px] text-white whitespace-nowrap"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {isDownloading ? "Preparando…" : "Descargar"}
                  </span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showFormats && (
                  <div className="absolute top-full right-0 mt-2 min-w-48 bg-white border border-[#dce4e7] rounded-[10px] shadow-[0px_8px_20px_rgba(22,52,63,0.14)] overflow-hidden z-50">
                    {FORMATS.map((fmt) => (
                      <button
                        key={fmt}
                        disabled={isDownloading}
                        onClick={() => void downloadAs(fmt)}
                        className="flex items-center gap-2 w-full px-3 py-[9px] hover:bg-[#f4f7f8] transition-colors text-left"
                      >
                        <span
                          className="text-[11px] font-bold text-[#607078] w-10"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          .{fmt.toLowerCase()}
                        </span>
                        <span
                          className="text-[12px] text-[#172126]"
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: 600,
                          }}
                        >
                          {fmt === "SVG"
                            ? "Vector (SVG)"
                            : fmt === "PNG"
                              ? "Imagen PNG"
                              : fmt === "JPEG"
                                ? "Imagen JPEG"
                                : "Documento PDF"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {downloadError && (
                <p role="alert" className="text-xs font-semibold text-red-700 text-center">
                  {downloadError}
                </p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="flex-1 min-w-0 flex flex-col gap-4 lg:gap-[14px]">
            <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-4 lg:p-5 rounded-[20px] w-full">
              <p
                className="font-extrabold text-[#172126] text-[20px] lg:text-[24px] whitespace-nowrap truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                {data.productName}
              </p>
              <div className="flex flex-wrap gap-2 w-full">
                <span
                  className="bg-[#e7f0f2] text-[#3276a8] px-3 py-1 rounded-full text-[11px] font-bold"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {data.productCode || "—"}
                </span>
                <span
                  className="bg-[#f0f5fa] text-[#607078] px-3 py-1 rounded-full text-[11px] font-bold"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {data.supplierCode || "—"}
                </span>
                <span
                  className="bg-[#fff5dd] text-[#8e592e] px-3 py-1 rounded-full text-[11px] font-bold"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {data.supplierName || "—"}
                </span>
              </div>
            </div>

            <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-4 p-4 lg:p-5 rounded-[20px] w-full">
              <div className="flex items-center gap-3 w-full">
                <div
                  className="bg-[#e7f0f2] flex items-center justify-center rounded-[12px] shrink-0"
                  style={{ width: 48, height: 48 }}
                >
                  <img alt="" className="size-[30px]" src={imgQrCode} />
                </div>
                <div className="flex flex-col gap-1 w-full">
                  <p
                    className="font-bold text-[#607078] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Código QR
                  </p>
                  <p
                    className="font-extrabold text-[#172126] text-[14px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.qrIdentifier}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <div className="flex-1 bg-[#f0f5fa] rounded-[14px] p-3">
                  <p
                    className="font-bold text-[#607078] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Lote
                  </p>
                  <p
                    className="font-extrabold text-[#172126] text-[15px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.lot || "—"}
                  </p>
                </div>
                <div className="flex-1 bg-[#f0f5fa] rounded-[14px] p-3">
                  <p
                    className="font-bold text-[#607078] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Caducidad
                  </p>
                  <p
                    className="font-extrabold text-[#172126] text-[15px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.expiryDate?.toDate?.()
                      ? data.expiryDate.toDate().toLocaleDateString("es-MX")
                      : "—"}
                  </p>
                </div>
                <div className="flex-1 bg-[#f0f5fa] rounded-[14px] p-3">
                  <p
                    className="font-bold text-[#607078] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Cantidad
                  </p>
                  <p
                    className="font-extrabold text-[#172126] text-[15px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.quantity} {data.unit}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <div className="flex-1 bg-[#e2f5ec] rounded-[14px] p-3">
                  <p
                    className="font-bold text-[#16845b] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Ubicación
                  </p>
                  <p
                    className="font-extrabold text-[#172126] text-[15px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.location || "—"}
                  </p>
                </div>
                <div className="flex-1 bg-[#e7f0f2] rounded-[14px] p-3">
                  <p
                    className="font-bold text-[#3276a8] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Estado
                  </p>
                  <p
                    className="font-extrabold text-[#3276a8] text-[15px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.status}
                  </p>
                </div>
                <div className="flex-1 bg-[#fff5dd] rounded-[14px] p-3">
                  <p
                    className="font-bold text-[#8e592e] text-[11px] uppercase"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    Registrado
                  </p>
                  <p
                    className="font-extrabold text-[#8e592e] text-[15px] truncate"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.createdAt?.toDate?.()
                      ? data.createdAt.toDate().toLocaleDateString("es-MX")
                      : "—"}
                  </p>
                </div>
              </div>

              {/* QR Visual */}
              <div className="w-full flex flex-col items-center gap-3 pt-2">
                <div className="bg-white border border-[#dce4e7] rounded-[14px] p-4 flex flex-col items-center gap-2">
                  {qrPreview ? (
                    <img
                      alt={`Código QR ${data.qrIdentifier}`}
                      className="size-[180px] print:size-[240px]"
                      src={qrPreview}
                    />
                  ) : (
                    <div
                      role="status"
                      className="size-[180px] flex items-center justify-center text-center text-xs text-gray-500"
                    >
                      Generando código QR…
                    </div>
                  )}
                  <p
                    className="font-extrabold text-[#172126] text-[8px] lg:text-[9px] whitespace-nowrap"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {data.qrIdentifier}
                  </p>
                  <p
                    className="text-[#607078] text-[7px] lg:text-[8px] whitespace-nowrap"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    ETIQUETA IMPRIMIBLE
                  </p>
                </div>

                <div className="flex gap-2 w-full pt-1">
                  <button
                    onClick={() => void printReceptionCodes(data.qrIdentifier)}
                    disabled={!qrPreview || isPreparingPrint}
                    aria-label="Imprimir códigos de la recepción"
                    className="flex flex-1 items-center justify-center gap-2 h-10 lg:h-11 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors touch-target"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#172126"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    <span
                      className="text-[11px] lg:text-[12px] text-[#172126] whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      {isPreparingPrint ? "Preparando…" : "Imprimir todos"}
                    </span>
                  </button>
                  <button
                    onClick={() => void downloadReceptionCodes()}
                    disabled={isPreparingPrint}
                    aria-busy={isPreparingPrint}
                    className="flex flex-1 items-center justify-center gap-2 h-10 lg:h-11 rounded-[10px] border border-[#dce4e7] bg-white hover:bg-[#f4f7f8] transition-colors touch-target"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#172126"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span
                      className="text-[11px] lg:text-[12px] text-[#172126] whitespace-nowrap"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      {isPreparingPrint ? "Preparando…" : "Descargar todos (PDF)"}
                    </span>
                  </button>
                </div>
                {printError && (
                  <p role="alert" className="text-xs font-semibold text-red-700 text-center">
                    {printError}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-4 lg:p-5 rounded-[20px] w-full">
              <p
                className="font-extrabold text-[#172126] text-[20px] lg:text-[24px] whitespace-nowrap truncate"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                Recepción de referencia
              </p>
              <div className="flex flex-col gap-1 w-full">
                <p
                  className="font-bold text-[#3276a8] text-[10px] lg:text-[11px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  RECEPCIÓN COMPLETA
                </p>
                <p
                  className="font-extrabold text-[#172126] text-[15px] lg:text-lg whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
                >
                  {data.receptionFolio?.split("·")[0]?.trim() || data.productCode || "OC-24891"} ·{" "}
                  {data.receptionFolio?.split("·")[1]?.trim().split(" ")[0] || "20"} tarimas
                </p>
              </div>
              <button
                onClick={() =>
                  onViewReference?.({
                    recId:
                      currentReception?.receptionId ||
                      data.receptionId ||
                      currentReception?.ocFolio ||
                      data.receptionFolio?.split("·")[0]?.trim() ||
                      "OC-24891",
                    tarimas: currentReception?.tarimas ?? 20,
                    proveedor: currentReception?.proveedor || data.supplierName || "—",
                    proveedorLogistico: currentReception?.proveedorLogistico || "Logística Veloz",
                  })
                }
                className="font-extrabold text-[#16343f] text-[14px] lg:text-[15px] whitespace-nowrap hover:underline touch-target"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                Ver referencia →
              </button>
            </div>
          </div>
        </div>
        {printPallets.length > 0 && (
          <div id="reception-qr-print-set" aria-hidden="true">
            {printPages.map((page, pageIndex) => (
              <section className="reception-qr-print-page" key={pageIndex}>
                {page.map((pallet) => (
                  <article className="reception-qr-print-label" key={pallet.qrIdentifier}>
                    <QRCodeSVG value={pallet.qrIdentifier} size={210} level="H" marginSize={2} />
                    <strong>
                      Tarima {pallet.palletNumber} de {printPallets.length}
                    </strong>
                    <span>{pallet.qrIdentifier}</span>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (detailState.status === "loading") return renderLoading();
  if (detailState.status === "not-found") return renderNotFound(detailState.qrCode);
  if (detailState.status === "error") return renderError(detailState.message, detailState.retry);
  return renderSuccess(detailState.data);
}
