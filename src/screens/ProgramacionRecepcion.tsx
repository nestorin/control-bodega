import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Select, type Proveedor, type Producto } from "./Configuracion";
import { useOcr } from "../hooks/useOcr";
import { isFeatureEnabled } from "@/config/featureFlags";
import { createFirestoreServices } from "@/services/firestore";
import { db } from "@/lib/firebase";
import { mapReceptionFormToPersistence } from "@/services/receptionMappers";
import {
  matchReceptionLinesToCatalog,
  ocrResponseToReceptionLines,
} from "@/services/domain/ocrToReception";
import { validateReceptionLine } from "@/services/domain/validation";
import type { ReceptionLineState } from "@/types/domain";
import { useAuthorization } from "@/hooks/useAuthorization";
import { WAREHOUSE_IDS } from "@/config/warehouses";
import { mergeSupplierCatalog } from "@/config/supplierCatalog";

// PDF.js para preview de PDF
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const assetPathPrefix = "/assets";
const imgFileUp = `${assetPathPrefix}/928ba.svg`;
const imgArrowRight = `${assetPathPrefix}/55de6.svg`;
const imgDownload = `${assetPathPrefix}/41680.svg`;
const imgWhatsApp = `${assetPathPrefix}/68eab.svg`;
const imgEmail = `${assetPathPrefix}/76004.svg`;
const imgPrint = `${assetPathPrefix}/c42c6.svg`;

const ORG_ID = "org_exepa_001";

const catalogoConversionesDefault = [
  { producto: "AGUA MINERAL 600 ML", piezasPorCaja: 24, cajasPorTarima: 10 },
  { producto: "COCA COLA 600ML C/24", piezasPorCaja: 24, cajasPorTarima: 10 },
  {
    producto: "SABRITAS CLÁSICAS 45G C/30",
    piezasPorCaja: 30,
    cajasPorTarima: 12,
  },
  { producto: "LALA LECHE 1L C/12", piezasPorCaja: 12, cajasPorTarima: 8 },
  { producto: "BIMBO PAN BLANCO 680G", piezasPorCaja: 10, cajasPorTarima: 15 },
  {
    producto: "GAMESA GALLETAS SALADAS 90G C/20",
    piezasPorCaja: 20,
    cajasPorTarima: 10,
  },
  { producto: "PEPSI 2L C/6", piezasPorCaja: 6, cajasPorTarima: 20 },
];

// Autocomplete component for product selection
export function AutocompleteProducto({
  value,
  onSelect,
  onChange,
  id,
  name,
  ariaLabel,
  catalogos,
  placeholder,
}: {
  value: string;
  onSelect: (producto: Producto) => void;
  onChange?: (value: string) => void;
  id?: string;
  name?: string;
  ariaLabel?: string;
  catalogos: Producto[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = catalogos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(query.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(query.toLowerCase())) ||
      (p.codigosProveedor || []).some((c) => c.toLowerCase().includes(query.toLowerCase())),
  );

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    onChange?.(val);
    setShowDropdown(true);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      commitProduct(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  }

  function handleFocus() {
    if (query) setShowDropdown(true);
  }

  function updateDropdownPosition() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }

  function commitProduct(product: Producto) {
    onSelect(product);
    setQuery(product.nombre);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  }

  useEffect(() => {
    if (!showDropdown) return;
    updateDropdownPosition();
    const handleViewportChange = () => updateDropdownPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showDropdown, filtered.length]);

  return (
    <div className="relative w-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        aria-label={ariaLabel}
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="bg-white border border-[#dce4e7] h-10 px-3 rounded-lg w-full text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
      />
      {showDropdown &&
        filtered.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[1000] bg-white border border-[#dce4e7] rounded-lg shadow-[0px_8px_12px_rgba(22,52,63,0.12)] max-h-60 overflow-y-auto"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
          >
            {filtered.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => commitProduct(p)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`flex items-center gap-2 px-3 py-2 w-full text-left text-[13px] ${
                  idx === highlightedIndex ? "bg-[#e7f0f2]" : "hover:bg-[#f0f4f5]"
                }`}
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                <span className="font-bold text-[#172126]">{p.nombre}</span>
                <span className="text-[#607078] text-[11px]">({p.sku || "—"})</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      {showDropdown && filtered.length === 0 && query && (
        <div
          className="absolute z-10 mt-1 bg-white border border-[#dce4e7] rounded-lg shadow-[0px_8px_12px_rgba(22,52,63,0.12)] w-full p-3 text-center text-[#607078] text-[13px]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          Sin coincidencias
        </div>
      )}
    </div>
  );
}

// Componente para preview de PDF (primera página como imagen)
function PdfPreview({ fileUrl, fileName }: { fileUrl: string; fileName?: string | null }) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function renderFirstPage() {
      try {
        setLoading(true);
        const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.maxWidth = "100%";
        canvas.style.borderRadius = "12px";

        await page.render({ canvas, canvasContext: context, viewport }).promise;

        if (!cancelled) {
          const dataUrl = canvas.toDataURL("image/png");
          setPreviewSrc(dataUrl);
        }
      } catch (err) {
        console.error("Error rendering PDF preview:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    renderFirstPage();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full w-full p-4">
        <div className="w-12 h-12 border-3 border-[#3276a8] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#607078] text-[11px]">Generando vista previa...</p>
      </div>
    );
  }

  if (error || !previewSrc) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full w-full p-4">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3276a8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <p
          className="font-bold text-[#172126] text-[13px] text-center px-2"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {fileName || "Documento PDF"}
        </p>
        <p className="text-[#607078] text-[11px] text-center">
          Vista previa no disponible · Se procesará con OCR
        </p>
      </div>
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="size-full object-cover rounded-[16px]"
        style={{ maxWidth: "100%", maxHeight: "100%", display: "none" }}
      />
      <img
        src={previewSrc}
        alt={`Preview ${fileName || "PDF"}`}
        className="size-full object-cover rounded-[16px]"
        style={{ maxWidth: "100%", maxHeight: "100%" }}
      />
    </>
  );
}

interface Props {
  onBack: () => void;
  onFinish: (data: {
    recepcionId: string;
    folio: string;
    proveedor: string;
    proveedorLogistico: string;
    fechaRecepcion: string;
    tarimas: number;
    productos: Array<{
      productId: string | null;
      codigo: string | null;
      nombre: string;
      unidad: string | null;
      cantidad: number;
      cajasPorTarima: number;
      tarimas: number;
    }>;
    codigosQR: string[];
  }) => void;
  catalogos: {
    proveedores: Proveedor[];
    productos: Producto[];
  };
}

function generateFolio(): string {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `REC-${year}-${random}`;
}

function formatFecha(fecha: Date): string {
  return fecha.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ProgramacionRecepcion({ onBack, onFinish, catalogos }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=Cargar OC, 2=Revisar/Editar, 3=Códigos listos
  const [folio] = useState(() => generateFolio());
  const [fechaRecepcion] = useState(() => formatFecha(new Date()));

  // Datos del formulario
  const [proveedor, setProveedor] = useState("");
  const [proveedorLogistico, setProveedorLogistico] = useState("");
  const supplierCatalog = useMemo(
    () => mergeSupplierCatalog(catalogos.proveedores),
    [catalogos.proveedores],
  );
  const proveedoresMercancia = useMemo(
    () =>
      supplierCatalog
        .filter((p) => p.tipo === "mercancia")
        .map((p) => ({ value: p.nombre, label: p.nombre })),
    [supplierCatalog],
  );
  const proveedoresLogistica = useMemo(
    () =>
      supplierCatalog
        .filter((p) => p.tipo === "logistica")
        .map((p) => ({ value: p.nombre, label: p.nombre })),
    [supplierCatalog],
  );

  // Keep logistics unselected until the operator explicitly chooses one.
  const [productos, setProductos] = useState<
    Array<{
      lineId?: string;
      productId: string | null;
      codigo: string | null;
      nombre: string;
      unidad: string | null;
      cantidad: number; // cajas pedidas
      cajasPorTarima: number;
      tarimas: number;
      conversionMatch: boolean;
      productConfirmed: boolean;
    }>
  >([]);

  // OCR
  const {
    runOcr,
    loading: ocrLoading,
    result: ocrResult,
    error: ocrError,
    clear,
    previewDataUrl,
    previewFileName,
    isPdfPreview,
  } = useOcr();
  const fileRef = useRef<HTMLInputElement>(null);

  // Firestore
  const { user, profile, canQuery } = useAuthorization();
  const useFirestore = isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && !!db && canQuery;
  const [fsServices, setFsServices] = useState<ReturnType<typeof createFirestoreServices> | null>(
    null,
  );
  const [firestoreReady, setFirestoreReady] = useState(false);

  // Estados UI
  const [showNoOCNotice, setShowNoOCNotice] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [savedReceptionId, setSavedReceptionId] = useState<string | null>(null);

  // Códigos QR generados
  const [codigosQR, setCodigosQR] = useState<string[]>([]);

  useEffect(() => {
    if (useFirestore && db) {
      const services = createFirestoreServices(db, ORG_ID);
      setFsServices(services);
      setFirestoreReady(true);
    }
  }, [useFirestore]);

  function calcularTarimas(cajas: number, cajasPorTarima: number): number {
    return Math.ceil(cajas / cajasPorTarima);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    clear();

    try {
      // Para órdenes de compra, usar tipo "oc" en lugar de "cfdi"
      await runOcr(file, "oc");
    } catch (err) {
      console.error("OCR error:", err);
    }
  }

  function procesarOCR() {
    if (!ocrResult?.parsed?.productos?.length) return;

    const receptionLines = ocrResponseToReceptionLines(ocrResult);
    const matchedLines = matchReceptionLinesToCatalog(receptionLines, catalogos.productos);
    const matchedProducts = matchedLines.map((line, index) => {
      const cajasPorTarima =
        catalogoConversionesDefault.find(
          (c) => c.producto.trim().toUpperCase() === line.nombre.trim().toUpperCase(),
        )?.cajasPorTarima || 10;
      return {
        ...line,
        lineId: `ocr-${Date.now()}-${index}`,
        unidad: line.unidad || "cajas",
        cajasPorTarima,
        tarimas: calcularTarimas(line.cantidad, cajasPorTarima),
        conversionMatch: line.estadoMatch === "confirmado",
        productConfirmed: false,
      };
    });

    setProductos(matchedProducts);
    if (ocrResult.parsed.proveedor) {
      setProveedor(ocrResult.parsed.proveedor);
    }
    // Buscar proveedor logístico si viene en OCR
  }

  useEffect(() => {
    if (ocrResult?.parsed?.productos?.length) {
      procesarOCR();
    }
  }, [ocrResult]);

  function agregarProductoManual() {
    setProductos((prev) => [
      ...prev,
      {
        lineId: `manual-${Date.now()}-${prev.length}`,
        productId: null,
        codigo: null,
        nombre: "",
        unidad: "cajas",
        cantidad: 0,
        cajasPorTarima: 0,
        tarimas: 0,
        conversionMatch: false,
        productConfirmed: false,
      },
    ]);
  }

  function actualizarProducto(index: number, campo: string, valor: any) {
    setProductos((prev) => {
      const next = [...prev];
      const numValor = typeof valor === "number" ? valor : parseInt(valor) || 0;
      if (campo === "nombre") {
        next[index] = {
          ...next[index],
          nombre: String(valor),
          productId: null,
          codigo: null,
          conversionMatch: false,
          productConfirmed: false,
        };
      } else {
        // Product identifiers and catalog metadata are strings. Coercing all
        // non-numeric fields through parseInt turned a selected product ID
        // into 0, so persistence discarded the otherwise valid line.
        const numericFields =
          campo === "cantidad" || campo === "cajasPorTarima" || campo === "tarimas";
        next[index] = {
          ...next[index],
          [campo]: numericFields ? numValor : valor,
        };
      }
      // Recalcular tarimas si cambió cantidad o cajasPorTarima
      if (campo === "cantidad" || campo === "cajasPorTarima") {
        const cajas = next[index].cantidad;
        const cpt = next[index].cajasPorTarima;
        next[index].tarimas = calcularTarimas(cajas, cpt);
      }
      return next;
    });
  }

  function eliminarProducto(index: number) {
    setProductos((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmarProducto(index: number) {
    const product = productos[index];
    if (!product?.productId || !product.nombre.trim()) {
      setNotices([
        `Producto ${index + 1}: seleccioná una opción válida del catálogo antes de confirmar`,
      ]);
      return;
    }
    setProductos((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, productConfirmed: true } : item,
      ),
    );
    setNotices([`Producto ${index + 1} confirmado`]);
    setTimeout(() => setNotices([]), 2500);
  }

  function generarCodigosQR(): string[] {
    const totalTarimas = productos.reduce((sum, p) => sum + p.tarimas, 0);
    const codigos: string[] = [];
    for (let i = 1; i <= totalTarimas; i++) {
      codigos.push(`${folio}-T${i.toString().padStart(3, "0")}`);
    }
    return codigos;
  }

  function totalTarimas(): number {
    return productos.reduce((sum, p) => sum + p.tarimas, 0);
  }

  function buildWhatsAppMessage(): string {
    const lines = [
      `🏭 *PROGRAMACIÓN RECEPCIÓN — BODEGA Exapa*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📋 Folio: ${folio}`,
      `📅 Fecha Recepción: ${fechaRecepcion}`,
      `🏢 Proveedor: ${proveedor || "—"}`,
      `🚚 Proveedor Logístico: ${proveedorLogistico || "—"}`,
      ``,
      `📦 *PRODUCTOS PROGRAMADOS:*`,
    ];
    productos.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.nombre}`);
      lines.push(`   Cajas: ${p.cantidad} | Tarimas: ${p.tarimas}`);
    });
    lines.push(``);
    lines.push(`📊 Total Tarimas: ${totalTarimas()}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`_Generado desde TarimaQR_`);
    return encodeURIComponent(lines.join("\n"));
  }

  function buildEmailBody(): string {
    return `Programación de Recepción\n\nFolio: ${folio}\nFecha: ${fechaRecepcion}\nProveedor: ${proveedor}\nLogística: ${proveedorLogistico}\n\nProductos:\n${productos.map((p, i) => `${i + 1}. ${p.nombre} - ${p.cantidad} cajas - ${p.tarimas} tarimas`).join("\n")}\n\nTotal Tarimas: ${totalTarimas()}`;
  }

  async function handleGuardar() {
    // Validar
    const missing: string[] = [];
    if (!proveedor.trim()) missing.push("Proveedor");
    if (!proveedorLogistico.trim()) missing.push("Proveedor Logístico");
    if (productos.length === 0) missing.push("Al menos un producto");

    if (missing.length > 0) {
      setNotices(missing);
      setTimeout(() => setNotices([]), 5000);
      return;
    }

    const unconfirmed = productos
      .map((product, index) =>
        !product.productConfirmed ? `Producto ${index + 1}: confirmá el producto` : null,
      )
      .filter((message): message is string => message !== null);
    if (unconfirmed.length > 0) {
      setNotices(unconfirmed);
      return;
    }

    const nextQrCodes = generarCodigosQR();
    let receptionId: string | null = null;

    // Guardar en Firestore si está habilitado
    if (useFirestore) {
      if (!firestoreReady || !fsServices || !user) {
        setNotices(["No se pudo iniciar una sesión válida para guardar"]);
        return;
      }

      const operationId = `op-reception-${Date.now()}`;
      const canonicalLines: ReceptionLineState[] = productos.map((product) => ({
        productId: product.productId,
        codigo: product.codigo,
        nombre: product.nombre,
        unidad: product.unidad,
        cantidad: product.cantidad,
        precio: 0,
        importe: 0,
        estadoMatch: product.conversionMatch ? "confirmado" : "sugerido",
      }));
      const lineErrors = canonicalLines.flatMap((line, index) => {
        const result = validateReceptionLine(line);
        return result.valid ? [] : [`Producto ${index + 1}: ${result.errors.join(", ")}`];
      });
      if (lineErrors.length > 0) {
        setNotices(lineErrors);
        return;
      }
      const persistence = mapReceptionFormToPersistence({
        products: canonicalLines.map((line) => ({
          productId: line.productId,
          codigo: line.codigo,
          nombre: line.nombre,
          unidad: line.unidad,
          cantidad: line.cantidad,
          importe: line.importe,
          estadoMatch: line.estadoMatch,
        })),
        warehouseId: profile?.warehouseId || WAREHOUSE_IDS.NORTH,
        supplierId: catalogos.proveedores.find((item) => item.nombre === proveedor)?.id,
        actorUserId: user.uid,
        operationId,
      });

      if (persistence.lines.length === 0) {
        setNotices(["Relaciona al menos un producto antes de guardar"]);
        return;
      }

      try {
        const reception = await fsServices.receptions.createReception(
          persistence.reception,
          persistence.lines,
          user.uid,
          operationId,
        );
        receptionId = reception.id;
      } catch (e) {
        console.error("Error guardando programación:", e);
        const error = e as {
          code?: unknown;
          message?: unknown;
        };
        const code = typeof error.code === "string" ? error.code : "";
        const message = typeof error.message === "string" ? error.message : "";
        const detail = code.includes("permission-denied")
          ? "No tenés permisos para guardar en el almacén seleccionado."
          : code.includes("invalid-argument")
            ? "Los datos de la recepción no cumplen el formato requerido."
            : message || "El servicio autorizado rechazó la operación.";
        setNotices([`No se pudo guardar la recepción: ${detail}`]);
        return;
      }
    }

    setSavedReceptionId(receptionId);
    setCodigosQR(nextQrCodes);
    setSaved(true);
    setStep(3);
  }

  async function handleEnviarWhatsApp() {
    if (!saved) return;

    try {
      // Generar el PDF como blob
      const { default: jsPDF } = await import("jspdf");
      const QRCode = (await import("qrcode")).default;

      const qrDataUrls: string[] = [];
      for (const codigo of codigosQR) {
        const dataUrl = await QRCode.toDataURL(codigo, {
          width: 120,
          margin: 2,
          errorCorrectionLevel: "H",
        });
        qrDataUrls.push(dataUrl);
      }

      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const checkSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      // ===== ENCABEZADO =====
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(22, 52, 63);
      pdf.text("PROGRAMACIÓN DE RECEPCIÓN — BODEGA Exapa", pageWidth / 2, y, {
        align: "center",
      });
      y += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(96, 112, 120);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Folio: ${folio}    |    Fecha Recepción: ${fechaRecepcion}`, pageWidth / 2, y, {
        align: "center",
      });
      y += 5;
      pdf.text(
        `Proveedor: ${proveedor || "—"}    |    Logística: ${proveedorLogistico || "—"}`,
        pageWidth / 2,
        y,
        { align: "center" },
      );
      y += 8;

      pdf.setDrawColor(220, 228, 231);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 6;

      // ===== TABLA DE PRODUCTOS =====
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(22, 52, 63);

      const colWidths = [65, 25, 25, 25, 25];
      const colStarts = [margin];
      for (let i = 1; i < colWidths.length; i++) {
        colStarts.push(colStarts[i - 1] + colWidths[i - 1]);
      }

      const headers = ["Producto", "Cajas", "C/T", "Tarimas", "Match"];
      headers.forEach((h, i) => {
        pdf.text(h, colStarts[i] + 2, y);
      });
      y += 5;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(23, 33, 38);

      productos.forEach((p) => {
        checkSpace(6);
        const matchText = p.conversionMatch ? "✓ Match" : "✗ Manual";
        const matchColor: [number, number, number] = p.conversionMatch
          ? [22, 132, 91]
          : [192, 57, 43];
        const nombre = p.nombre.length > 32 ? p.nombre.substring(0, 29) + "..." : p.nombre;

        pdf.text(nombre, colStarts[0] + 2, y);
        pdf.text(p.cantidad.toString(), colStarts[1] + colWidths[1] - 2, y, {
          align: "right",
        });
        pdf.text(p.cajasPorTarima.toString(), colStarts[2] + colWidths[2] - 2, y, {
          align: "right",
        });
        pdf.text(p.tarimas.toString(), colStarts[3] + colWidths[3] - 2, y, {
          align: "right",
        });
        pdf.setTextColor(...matchColor);
        pdf.text(matchText, colStarts[4] + colWidths[4] - 2, y, {
          align: "right",
        });
        pdf.setTextColor(23, 33, 38);
        y += 5;
      });

      y += 3;
      pdf.setDrawColor(220, 228, 231);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 4;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(22, 52, 63);
      pdf.text(`Total Tarimas: ${totalTarimas()}`, pageWidth - margin, y, {
        align: "right",
      });
      y += 10;

      // ===== CÓDIGOS QR =====
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(22, 52, 63);
      pdf.text("CÓDIGOS QR PARA ETIQUETAS (4 stickers por tarima)", pageWidth / 2, y, {
        align: "center",
      });
      y += 8;

      const stickersPerPage = 4;
      const stickerWidth = (pageWidth - 2 * margin) / 2;
      const stickerHeight = 70;

      for (let i = 0; i < codigosQR.length; i++) {
        const stickerIndex = i % stickersPerPage;
        const row = Math.floor(stickerIndex / 2);
        const col = stickerIndex % 2;

        if (stickerIndex === 0 && i > 0) {
          pdf.addPage();
          y = margin;
        }

        const x = margin + col * stickerWidth;
        const stickerY = y + row * stickerHeight;

        checkSpace(stickerHeight);

        pdf.setDrawColor(200, 212, 216);
        pdf.setLineWidth(0.3);
        pdf.rect(x, stickerY, stickerWidth - 2, stickerHeight - 2);

        const qrDataUrl = qrDataUrls[i];
        const qrSize = 35;
        const qrX = x + (stickerWidth - qrSize) / 2;
        const qrY = stickerY + 3;
        pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

        const textY = qrY + qrSize + 3;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(22, 52, 63);
        pdf.text(codigosQR[i], x + stickerWidth / 2, textY, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(96, 112, 120);
        const tarimaNum = Math.floor(i / 4) + 1;
        const stickerFace = i % 4 < 2 ? "Cara A" : "Cara B";
        const stickerCopy = i % 2 === 0 ? "Copia 1" : "Copia 2";
        pdf.text(
          `${stickerFace} · ${stickerCopy} · Tarima ${tarimaNum}`,
          x + stickerWidth / 2,
          textY + 4,
          { align: "center" },
        );

        const prodIdx = Math.floor(i / 4);
        if (productos[prodIdx]) {
          const p = productos[prodIdx];
          pdf.setFontSize(6);
          pdf.text(`Producto: ${p.nombre}`, x + 3, textY + 8);
          pdf.text(`Cajas: ${p.cantidad} | Tarimas: ${p.tarimas}`, x + 3, textY + 12);
          pdf.text(`Proveedor: ${proveedor}`, x + 3, textY + 16);
          pdf.text(`Fecha: ${fechaRecepcion}`, x + 3, textY + 20);
        }
      }

      // Obtener PDF como blob
      const pdfBlob = pdf.output("blob");
      const fileName = `Programacion_${folio}.pdf`;

      // Crear archivo para compartir
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });

      // Intentar Web Share API (móvil) - permite compartir archivos
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Programación Recepción ${folio}`,
          text: `Programación de recepción ${folio} - ${proveedor} - ${totalTarimas()} tarimas`,
          files: [file],
        });
        return;
      }

      // Fallback: Descargar PDF y abrir WhatsApp con mensaje de texto + instrucción
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Abrir WhatsApp con mensaje de referencia
      const mensaje = encodeURIComponent(
        `🏭 *PROGRAMACIÓN RECEPCIÓN — BODEGA Exapa*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📋 Folio: ${folio}\n` +
          `📅 Fecha: ${fechaRecepcion}\n` +
          `🏢 Proveedor: ${proveedor}\n` +
          `🚚 Logística: ${proveedorLogistico}\n` +
          `📊 Total Tarimas: ${totalTarimas()}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📎 *PDF adjunto descargado: ${fileName}*\n` +
          `Por favor adjunta el archivo PDF a este chat.\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `_Generado desde TarimaQR_`,
      );
      window.open(`https://wa.me/?text=${mensaje}`, "_blank");
    } catch (error) {
      console.error("Error generando PDF para WhatsApp:", error);
      // Fallback a solo texto
      window.open(`https://wa.me/?text=${buildWhatsAppMessage()}`, "_blank");
    }
  }

  async function handleEnviarEmail() {
    if (!saved) return;
    window.open(
      `mailto:?subject=Programación Recepción ${folio}&body=${encodeURIComponent(buildEmailBody())}`,
      "_blank",
    );
  }

  async function handleDescargarPDF() {
    if (!saved) return;

    // Importar jsPDF y qrcode dinámicamente
    const { default: jsPDF } = await import("jspdf");
    const QRCode = (await import("qrcode")).default;

    // Generar QR codes como data URLs usando qrcode library
    const qrDataUrls: string[] = [];
    for (const codigo of codigosQR) {
      const dataUrl = await QRCode.toDataURL(codigo, {
        width: 120,
        margin: 2,
        errorCorrectionLevel: "H",
      });
      qrDataUrls.push(dataUrl);
    }

    // Crear PDF
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    // Función para agregar nueva página si no hay espacio
    const checkSpace = (needed: number) => {
      if (y + needed > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    // ===== ENCABEZADO =====
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(22, 52, 63); // #16343f
    pdf.text("PROGRAMACIÓN DE RECEPCIÓN — BODEGA Exapa", pageWidth / 2, y, {
      align: "center",
    });
    y += 8;

    pdf.setFontSize(10);
    pdf.setTextColor(96, 112, 120); // #607078
    pdf.setFont("helvetica", "normal");
    pdf.text(`Folio: ${folio}    |    Fecha Recepción: ${fechaRecepcion}`, pageWidth / 2, y, {
      align: "center",
    });
    y += 5;
    pdf.text(
      `Proveedor: ${proveedor || "—"}    |    Logística: ${proveedorLogistico || "—"}`,
      pageWidth / 2,
      y,
      { align: "center" },
    );
    y += 8;

    // Línea separadora
    pdf.setDrawColor(220, 228, 231); // #dce4e7
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;

    // ===== TABLA DE PRODUCTOS =====
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(22, 52, 63);

    const colWidths = [65, 25, 25, 25, 25]; // Producto, Cajas, C/T, Tarimas, Match
    const colStarts = [margin];
    for (let i = 1; i < colWidths.length; i++) {
      colStarts.push(colStarts[i - 1] + colWidths[i - 1]);
    }

    const headers = ["Producto", "Cajas", "C/T", "Tarimas", "Match"];
    headers.forEach((h, i) => {
      pdf.text(h, colStarts[i] + 2, y);
    });
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(23, 33, 38); // #172126

    productos.forEach((p, idx) => {
      checkSpace(6);
      const matchText = p.conversionMatch ? "✓ Match" : "✗ Manual";
      const matchColor: [number, number, number] = p.conversionMatch
        ? [22, 132, 91]
        : [192, 57, 43]; // verde/rojo

      // Truncar nombre si es muy largo
      const nombre = p.nombre.length > 32 ? p.nombre.substring(0, 29) + "..." : p.nombre;

      pdf.text(nombre, colStarts[0] + 2, y);
      pdf.text(p.cantidad.toString(), colStarts[1] + colWidths[1] - 2, y, {
        align: "right",
      });
      pdf.text(p.cajasPorTarima.toString(), colStarts[2] + colWidths[2] - 2, y, { align: "right" });
      pdf.text(p.tarimas.toString(), colStarts[3] + colWidths[3] - 2, y, {
        align: "right",
      });

      pdf.setTextColor(...matchColor);
      pdf.text(matchText, colStarts[4] + colWidths[4] - 2, y, {
        align: "right",
      });
      pdf.setTextColor(23, 33, 38);
      y += 5;
    });

    // Total tarimas
    y += 3;
    pdf.setDrawColor(220, 228, 231);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(22, 52, 63);
    pdf.text(`Total Tarimas: ${totalTarimas()}`, pageWidth - margin, y, {
      align: "right",
    });
    y += 10;

    // ===== CÓDIGOS QR (4 stickers por tarima) =====
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(22, 52, 63);
    pdf.text("CÓDIGOS QR PARA ETIQUETAS (4 stickers por tarima)", pageWidth / 2, y, {
      align: "center",
    });
    y += 8;

    // 4 stickers por tarima: 2 filas x 2 columnas por página
    const stickersPerPage = 4;
    const stickerWidth = (pageWidth - 2 * margin) / 2;
    const stickerHeight = 70;

    for (let i = 0; i < codigosQR.length; i++) {
      const stickerIndex = i % stickersPerPage;
      const row = Math.floor(stickerIndex / 2);
      const col = stickerIndex % 2;

      if (stickerIndex === 0 && i > 0) {
        pdf.addPage();
        y = margin;
      }

      const x = margin + col * stickerWidth;
      const stickerY = y + row * stickerHeight;

      checkSpace(stickerHeight);

      // Borde del sticker
      pdf.setDrawColor(200, 212, 216); // #c8d4d8
      pdf.setLineWidth(0.3);
      pdf.rect(x, stickerY, stickerWidth - 2, stickerHeight - 2);

      // QR code usando data URL generado con qrcode library
      const qrDataUrl = qrDataUrls[i];
      const qrSize = 35;
      const qrX = x + (stickerWidth - qrSize) / 2;
      const qrY = stickerY + 3;
      pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

      // Texto debajo del QR
      const textY = qrY + qrSize + 3;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(22, 52, 63);
      pdf.text(codigosQR[i], x + stickerWidth / 2, textY, { align: "center" });

      // Info de sticker
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(96, 112, 120);
      const tarimaNum = Math.floor(i / 4) + 1;
      const stickerFace = i % 4 < 2 ? "Cara A" : "Cara B";
      const stickerCopy = i % 2 === 0 ? "Copia 1" : "Copia 2";
      pdf.text(
        `${stickerFace} · ${stickerCopy} · Tarima ${tarimaNum}`,
        x + stickerWidth / 2,
        textY + 4,
        { align: "center" },
      );

      // Datos del producto
      const prodIdx = Math.floor(i / 4);
      if (productos[prodIdx]) {
        const p = productos[prodIdx];
        pdf.setFontSize(6);
        pdf.text(`Producto: ${p.nombre}`, x + 3, textY + 8);
        pdf.text(`Cajas: ${p.cantidad} | Tarimas: ${p.tarimas}`, x + 3, textY + 12);
        pdf.text(`Proveedor: ${proveedor}`, x + 3, textY + 16);
        pdf.text(`Fecha: ${fechaRecepcion}`, x + 3, textY + 20);
      }
    }

    // Guardar
    pdf.save(`Programacion_${folio}.pdf`);
  }

  async function handleImprimir() {
    if (!saved) return;

    try {
      // Generar el mismo PDF que para descargar, pero abrir diálogo de impresión
      const { default: jsPDF } = await import("jspdf");
      const QRCode = (await import("qrcode")).default;

      const qrDataUrls: string[] = [];
      for (const codigo of codigosQR) {
        const dataUrl = await QRCode.toDataURL(codigo, {
          width: 120,
          margin: 2,
          errorCorrectionLevel: "H",
        });
        qrDataUrls.push(dataUrl);
      }

      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const checkSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      // ===== ENCABEZADO =====
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(22, 52, 63);
      pdf.text("PROGRAMACIÓN DE RECEPCIÓN — BODEGA Exapa", pageWidth / 2, y, {
        align: "center",
      });
      y += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(96, 112, 120);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Folio: ${folio}    |    Fecha Recepción: ${fechaRecepcion}`, pageWidth / 2, y, {
        align: "center",
      });
      y += 5;
      pdf.text(
        `Proveedor: ${proveedor || "—"}    |    Logística: ${proveedorLogistico || "—"}`,
        pageWidth / 2,
        y,
        { align: "center" },
      );
      y += 8;

      pdf.setDrawColor(220, 228, 231);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 6;

      // ===== TABLA DE PRODUCTOS =====
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(22, 52, 63);

      const colWidths = [65, 25, 25, 25, 25];
      const colStarts = [margin];
      for (let i = 1; i < colWidths.length; i++) {
        colStarts.push(colStarts[i - 1] + colWidths[i - 1]);
      }

      const headers = ["Producto", "Cajas", "C/T", "Tarimas", "Match"];
      headers.forEach((h, i) => {
        pdf.text(h, colStarts[i] + 2, y);
      });
      y += 5;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(23, 33, 38);

      productos.forEach((p) => {
        checkSpace(6);
        const matchText = p.conversionMatch ? "✓ Match" : "✗ Manual";
        const matchColor: [number, number, number] = p.conversionMatch
          ? [22, 132, 91]
          : [192, 57, 43];
        const nombre = p.nombre.length > 32 ? p.nombre.substring(0, 29) + "..." : p.nombre;

        pdf.text(nombre, colStarts[0] + 2, y);
        pdf.text(p.cantidad.toString(), colStarts[1] + colWidths[1] - 2, y, {
          align: "right",
        });
        pdf.text(p.cajasPorTarima.toString(), colStarts[2] + colWidths[2] - 2, y, {
          align: "right",
        });
        pdf.text(p.tarimas.toString(), colStarts[3] + colWidths[3] - 2, y, {
          align: "right",
        });
        pdf.setTextColor(...matchColor);
        pdf.text(matchText, colStarts[4] + colWidths[4] - 2, y, {
          align: "right",
        });
        pdf.setTextColor(23, 33, 38);
        y += 5;
      });

      y += 3;
      pdf.setDrawColor(220, 228, 231);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 4;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(22, 52, 63);
      pdf.text(`Total Tarimas: ${totalTarimas()}`, pageWidth - margin, y, {
        align: "right",
      });
      y += 10;

      // ===== CÓDIGOS QR =====
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(22, 52, 63);
      pdf.text("CÓDIGOS QR PARA ETIQUETAS (4 stickers por tarima)", pageWidth / 2, y, {
        align: "center",
      });
      y += 8;

      const stickersPerPage = 4;
      const stickerWidth = (pageWidth - 2 * margin) / 2;
      const stickerHeight = 70;

      for (let i = 0; i < codigosQR.length; i++) {
        const stickerIndex = i % stickersPerPage;
        const row = Math.floor(stickerIndex / 2);
        const col = stickerIndex % 2;

        if (stickerIndex === 0 && i > 0) {
          pdf.addPage();
          y = margin;
        }

        const x = margin + col * stickerWidth;
        const stickerY = y + row * stickerHeight;

        checkSpace(stickerHeight);

        pdf.setDrawColor(200, 212, 216);
        pdf.setLineWidth(0.3);
        pdf.rect(x, stickerY, stickerWidth - 2, stickerHeight - 2);

        const qrDataUrl = qrDataUrls[i];
        const qrSize = 35;
        const qrX = x + (stickerWidth - qrSize) / 2;
        const qrY = stickerY + 3;
        pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

        const textY = qrY + qrSize + 3;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(22, 52, 63);
        pdf.text(codigosQR[i], x + stickerWidth / 2, textY, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(96, 112, 120);
        const tarimaNum = Math.floor(i / 4) + 1;
        const stickerFace = i % 4 < 2 ? "Cara A" : "Cara B";
        const stickerCopy = i % 2 === 0 ? "Copia 1" : "Copia 2";
        pdf.text(
          `${stickerFace} · ${stickerCopy} · Tarima ${tarimaNum}`,
          x + stickerWidth / 2,
          textY + 4,
          { align: "center" },
        );

        const prodIdx = Math.floor(i / 4);
        if (productos[prodIdx]) {
          const p = productos[prodIdx];
          pdf.setFontSize(6);
          pdf.text(`Producto: ${p.nombre}`, x + 3, textY + 8);
          pdf.text(`Cajas: ${p.cantidad} | Tarimas: ${p.tarimas}`, x + 3, textY + 12);
          pdf.text(`Proveedor: ${proveedor}`, x + 3, textY + 16);
          pdf.text(`Fecha: ${fechaRecepcion}`, x + 3, textY + 20);
        }
      }

      // Abrir PDF en nueva ventana para imprimir
      const pdfBlob = pdf.output("blob");
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error("Error generando PDF para imprimir:", error);
      // Fallback
      window.print();
    }
  }

  function handleEditar() {
    setStep(1);
  }

  function handleContinuarRecepcion() {
    onFinish({
      recepcionId: savedReceptionId || `temp-${Date.now()}`,
      folio,
      proveedor,
      proveedorLogistico,
      fechaRecepcion,
      tarimas: totalTarimas(),
      productos: productos.map((p) => ({
        productId: p.productId,
        codigo: p.codigo,
        nombre: p.nombre,
        unidad: p.unidad,
        cantidad: p.cantidad,
        cajasPorTarima: p.cajasPorTarima,
        tarimas: p.tarimas,
      })),
      codigosQR,
    });
  }

  return (
    <div className="flex flex-col gap-[18px] items-start p-7 size-full overflow-y-auto">
      {/* Progress bar */}
      <div className="bg-[#dce4e7] flex flex-col h-2 items-start overflow-hidden rounded-full w-full shrink-0">
        <div
          className="bg-[#f2b84b] h-2 rounded-full"
          style={{ width: step === 1 ? "25%" : step === 2 ? "60%" : "100%" }}
        />
      </div>

      {/* Step 1: Cargar OC */}
      {step === 1 && (
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-5 rounded-[20px] w-full">
          <div className="flex items-center gap-4 w-full">
            <div
              className="bg-[#e7f0f2] flex items-center justify-center rounded-[18px] shrink-0"
              style={{ width: 72, height: 72 }}
            >
              <svg
                width="52"
                height="52"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3276a8"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <p
                className="font-extrabold text-[#172126] text-[24px] leading-tight"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                Programación de
                <br />
                Recepción de Mercancía
              </p>
              <p
                className="text-[#607078] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                Paso 1 · Cargar Orden de Compra
              </p>
            </div>
          </div>

          <p
            className="text-[#607078] text-[13px] w-full"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
          >
            Sube el PDF o imagen de la Orden de Compra. El OCR extraerá los datos automáticamente.
          </p>

          {/* File upload */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative flex flex-col items-center justify-center gap-2 rounded-[16px] cursor-pointer overflow-hidden transition-all w-full"
            style={{
              height: 200,
              background: previewDataUrl ? "transparent" : "#e7f0f2",
              border: previewDataUrl ? "none" : "2px dashed #3276a8",
            }}
          >
            {previewDataUrl ? (
              <>
                {isPdfPreview ? (
                  // PDF Preview: renderizar primera página como imagen
                  <PdfPreview fileUrl={previewDataUrl} fileName={previewFileName} />
                ) : (
                  // Image Preview
                  <img
                    src={previewDataUrl}
                    alt="OC"
                    className="size-full object-cover rounded-[16px]"
                  />
                )}
                <div className="absolute inset-0 bg-[rgba(22,52,63,0.4)] flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity rounded-[16px]">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span
                    className="text-white text-[11px] font-bold"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Cambiar archivo
                  </span>
                </div>
              </>
            ) : (
              <>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#3276a8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <p
                  className="font-bold text-[#3276a8] text-[13px] text-center px-4"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Cargar Orden de Compra
                </p>
                <p
                  className="text-[#607078] text-[11px] text-center px-4"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
                >
                  PDF, JPG, PNG · máx 10MB
                </p>
              </>
            )}
            <input
              id="programming-evidence-file"
              name="evidenceFile"
              aria-label="Cargar evidencia de recepción"
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Sin OC */}
          <button
            onClick={() => setShowNoOCNotice(true)}
            className="flex items-center gap-2 text-[#3276a8] font-bold text-[13px] underline w-full justify-center"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            No tengo Orden de Compra · Ingresar manualmente
          </button>

          {/* Formulario manual (si no hay OC) */}
          {showNoOCNotice && (
            <div className="bg-[#fff8e6] border border-[#f2b84b] rounded-[12px] p-4 w-full">
              <p
                className="font-bold text-[#7a5c00] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Ingreso manual de programación
              </p>
              <div className="flex flex-col gap-3 mt-3 w-full">
                <Select
                  id="programming-supplier"
                  name="supplier"
                  aria-label="Proveedor de mercancía"
                  value={proveedor}
                  onChange={setProveedor}
                  options={proveedoresMercancia}
                  placeholder="Seleccionar proveedor"
                />
                <Select
                  id="programming-logistics-supplier"
                  name="logisticsSupplier"
                  aria-label="Proveedor logístico"
                  value={proveedorLogistico}
                  onChange={setProveedorLogistico}
                  options={proveedoresLogistica}
                  placeholder="Seleccionar logística"
                />

                {/* Tabla de productos (misma que Paso 2) - Mobile Card Layout */}
                <p
                  className="font-bold text-[#172126] text-[15px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Productos programados
                </p>

                {/* Mobile: Card layout */}
                <div className="md:hidden space-y-3 w-full">
                  {productos.length === 0 ? (
                    <div
                      className="bg-[#f0f4f5] rounded-[12px] p-6 text-center text-[#607078]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      Sin productos. Agrega uno.
                    </div>
                  ) : (
                    productos.map((p, i) => (
                      <div
                        key={p.lineId ?? `line-${i}`}
                        className="bg-white border border-[#dce4e7] rounded-[12px] p-4"
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <span
                            className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                          >
                            Producto {i + 1}
                          </span>
                          <button
                            onClick={() => eliminarProducto(i)}
                            className="text-[#c0392b] p-2"
                            aria-label="Eliminar producto"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label
                              htmlFor={`programming-product-${p.lineId ?? i}-mobile`}
                              className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                              style={{ fontFamily: "'Inter', sans-serif" }}
                            >
                              Producto
                            </label>
                            <AutocompleteProducto
                              id={`programming-product-${p.lineId ?? i}-mobile`}
                              name={`products[${p.lineId ?? i}][name]`}
                              ariaLabel={`Producto ${i + 1}`}
                              value={p.nombre}
                              onChange={(value) => actualizarProducto(i, "nombre", value)}
                              onSelect={(producto) => {
                                actualizarProducto(i, "nombre", producto.nombre);
                                actualizarProducto(i, "productId", producto.id);
                                actualizarProducto(i, "codigo", producto.sku);
                                actualizarProducto(i, "unidad", producto.unidad || "cajas");
                                // Catalog selection confirms the product match;
                                // conversion availability is a separate concern.
                                actualizarProducto(i, "conversionMatch", true);
                                const conversion = catalogoConversionesDefault.find(
                                  (c) => c.producto === producto.nombre,
                                );
                                if (conversion) {
                                  actualizarProducto(
                                    i,
                                    "cajasPorTarima",
                                    conversion.cajasPorTarima,
                                  );
                                }
                              }}
                              catalogos={catalogos.productos}
                              placeholder="Escribe para buscar..."
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label
                                htmlFor={`programming-number-1`}
                                className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                Cajas
                              </label>
                              <input
                                id={`programming-number-1`}
                                name={`programmingNumber1`}
                                aria-label={`Valor numérico 1`}
                                type="number"
                                value={p.cantidad}
                                onChange={(e) =>
                                  actualizarProducto(i, "cantidad", parseInt(e.target.value) || 0)
                                }
                                className="bg-white border border-[#dce4e7] h-11 px-3 rounded-lg w-full text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                                inputMode="numeric"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`programming-number-2`}
                                className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                Cajas/Tarima
                              </label>
                              <input
                                id={`programming-number-2`}
                                name={`programmingNumber2`}
                                aria-label={`Valor numérico 2`}
                                type="number"
                                value={p.cajasPorTarima}
                                onChange={(e) =>
                                  actualizarProducto(
                                    i,
                                    "cajasPorTarima",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="bg-white border border-[#dce4e7] h-11 px-3 rounded-lg w-full text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                                inputMode="numeric"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label
                                className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                Tarimas
                              </label>
                              <div className="bg-[#f0f4f5] border border-[#dce4e7] h-11 px-3 rounded-lg w-full flex items-center">
                                <span
                                  className="font-black text-[#16343f] text-[15px]"
                                  style={{ fontFamily: "'Inter', sans-serif" }}
                                >
                                  {p.tarimas}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => confirmarProducto(i)}
                                className={`mt-2 rounded-lg px-2 py-1 text-[10px] font-bold ${
                                  p.productConfirmed
                                    ? "bg-[#e2f5ec] text-[#16845b]"
                                    : "bg-[#16343f] text-white"
                                }`}
                              >
                                {p.productConfirmed ? "Producto confirmado" : "Confirmar producto"}
                              </button>
                            </div>
                            <div>
                              <label
                                className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                Match
                              </label>
                              <span
                                className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                  p.conversionMatch
                                    ? "bg-[#e2f5ec] text-[#16845b]"
                                    : "bg-[#fdecea] text-[#c0392b]"
                                }`}
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                {p.conversionMatch ? "✓ Match" : "✗ Manual"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop: Table layout */}
                <div className="hidden md:block w-full overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f0f4f5] text-left">
                        <th
                          className="p-3 font-bold text-[#607078]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Producto
                        </th>
                        <th
                          className="p-3 font-bold text-[#607078]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Cajas
                        </th>
                        <th
                          className="p-3 font-bold text-[#607078]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Cajas/Tarima
                        </th>
                        <th
                          className="p-3 font-bold text-[#607078]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Tarimas
                        </th>
                        <th
                          className="p-3 font-bold text-[#607078]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Match
                        </th>
                        <th
                          className="p-3 font-bold text-[#607078]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-6 text-center text-[#607078]"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                          >
                            Sin productos. Agrega uno.
                          </td>
                        </tr>
                      ) : (
                        productos.map((p, i) => (
                          <tr
                            key={p.lineId ?? `line-${i}`}
                            className="border-b border-[#f0f4f5] last:border-0"
                          >
                            <td className="p-3">
                              <AutocompleteProducto
                                id={`programming-product-${p.lineId ?? i}-desktop`}
                                name={`products[${p.lineId ?? i}][name]`}
                                ariaLabel={`Producto ${i + 1}`}
                                value={p.nombre}
                                onChange={(value) => actualizarProducto(i, "nombre", value)}
                                onSelect={(producto) => {
                                  actualizarProducto(i, "nombre", producto.nombre);
                                  actualizarProducto(i, "productId", producto.id);
                                  actualizarProducto(i, "codigo", producto.sku);
                                  actualizarProducto(i, "unidad", producto.unidad || "cajas");
                                  actualizarProducto(i, "conversionMatch", true);
                                  const conversion = catalogoConversionesDefault.find(
                                    (c) => c.producto === producto.nombre,
                                  );
                                  if (conversion) {
                                    actualizarProducto(
                                      i,
                                      "cajasPorTarima",
                                      conversion.cajasPorTarima,
                                    );
                                  }
                                }}
                                catalogos={catalogos.productos}
                                placeholder="Escribe para buscar..."
                              />
                            </td>
                            <td className="p-3">
                              <input
                                id={`programming-number-3`}
                                name={`programmingNumber3`}
                                aria-label={`Valor numérico 3`}
                                type="number"
                                value={p.cantidad}
                                onChange={(e) =>
                                  actualizarProducto(i, "cantidad", parseInt(e.target.value) || 0)
                                }
                                className="bg-white border border-[#dce4e7] h-10 px-3 rounded-lg w-24 text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              />
                            </td>
                            <td className="p-3">
                              <input
                                id={`programming-number-4`}
                                name={`programmingNumber4`}
                                aria-label={`Valor numérico 4`}
                                type="number"
                                value={p.cajasPorTarima}
                                onChange={(e) =>
                                  actualizarProducto(
                                    i,
                                    "cajasPorTarima",
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className="bg-white border border-[#dce4e7] h-10 px-3 rounded-lg w-28 text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              />
                            </td>
                            <td
                              className="p-3 font-bold text-[#16343f]"
                              style={{ fontFamily: "'Inter', sans-serif" }}
                            >
                              {p.tarimas}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                  p.conversionMatch
                                    ? "bg-[#e2f5ec] text-[#16845b]"
                                    : "bg-[#fdecea] text-[#c0392b]"
                                }`}
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                {p.conversionMatch ? "✓ Match" : "✗ Manual"}
                              </span>
                            </td>
                            <td className="p-3">
                              <button
                                type="button"
                                onClick={() => confirmarProducto(i)}
                                className={`mr-2 rounded-lg px-2 py-1 text-[10px] font-bold ${
                                  p.productConfirmed
                                    ? "bg-[#e2f5ec] text-[#16845b]"
                                    : "bg-[#16343f] text-white"
                                }`}
                              >
                                {p.productConfirmed ? "Producto confirmado" : "Confirmar producto"}
                              </button>
                              <button
                                onClick={() => eliminarProducto(i)}
                                className="text-[#c0392b] hover:underline text-sm"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totales */}
                <div className="bg-[#f0f4f5] rounded-[12px] p-4 w-full">
                  <div className="flex justify-between">
                    <span
                      className="font-bold text-[#607078]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      Total Tarimas:
                    </span>
                    <span
                      className="font-black text-[#16343f] text-[20px]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      {totalTarimas()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex flex-col gap-3 w-full md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-[3px] items-start w-full md:w-auto">
              <p
                className="font-bold text-[#607078] text-[11px] uppercase"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                FECHA Y HORA AUTOMÁTICAS
              </p>
              <p
                className="font-bold text-[#172126] text-[15px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                {fechaRecepcion}
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-3 w-full">
              <button
                onClick={onBack}
                className="flex gap-2 h-12 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer transition-colors border touch-target w-full md:w-auto"
                style={{ background: "white", borderColor: "#dce4e7" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#172126"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <p
                  className="font-bold text-sm md:text-[15px] whitespace-nowrap"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    color: "#172126",
                  }}
                >
                  Volver
                </p>
              </button>
              <button
                onClick={() => setStep(2)}
                className="bg-[#16343f] border border-[#16343f] flex gap-2 h-12 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target w-full md:w-auto"
              >
                <img alt="" className="size-5 md:size-[18px]" src={imgArrowRight} />
                <p
                  className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Continuar
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Revisar y Editar */}
      {step === 2 && (
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-5 rounded-[20px] w-full">
          <div className="flex items-center gap-4 w-full">
            <div
              className="bg-[#e7f0f2] flex items-center justify-center rounded-[18px] shrink-0"
              style={{ width: 72, height: 72 }}
            >
              <svg
                width="52"
                height="52"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3276a8"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <p
                className="font-extrabold text-[#172126] text-[24px] leading-tight"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                Revisar Programación
              </p>
              <p
                className="text-[#607078] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                Paso 2 · Verificar y ajustar datos
              </p>
            </div>
          </div>

          {/* Info cabecera */}
          <div className="bg-[#e7f0f2] rounded-[12px] p-4 w-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Folio
                </p>
                <p
                  className="font-bold text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {folio}
                </p>
              </div>
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Fecha
                </p>
                <p
                  className="font-bold text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {fechaRecepcion}
                </p>
              </div>
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Proveedor
                </p>
                <p
                  className="font-bold text-[#172126] truncate"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {proveedor}
                </p>
              </div>
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Logística
                </p>
                <p
                  className="font-bold text-[#172126] truncate"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {proveedorLogistico}
                </p>
              </div>
            </div>
          </div>

          {/* Proveedores */}
          <div className="flex flex-col gap-3 w-full">
            <Select
              id="programming-review-supplier"
              name="supplier"
              aria-label="Proveedor de mercancía"
              value={proveedor}
              onChange={setProveedor}
              options={proveedoresMercancia}
              placeholder="Seleccionar proveedor"
            />
            <Select
              id="programming-review-logistics-supplier"
              name="logisticsSupplier"
              aria-label="Proveedor logístico"
              value={proveedorLogistico}
              onChange={setProveedorLogistico}
              options={proveedoresLogistica}
              placeholder="Seleccionar logística"
            />
          </div>

          {/* Tabla productos */}
          <p
            className="font-bold text-[#172126] text-[15px]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            Productos programados
          </p>

          {/* Botón agregar producto - AL INICIO (visible siempre) */}
          <div className="flex justify-center md:justify-end w-full mb-4">
            {productos.length === 0 ? (
              <button
                onClick={agregarProductoManual}
                className="flex items-center gap-2 justify-center bg-[#e7f0f2] text-[#3276a8] font-bold h-12 px-4 rounded-[10px] w-full md:w-auto"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Agregar primer producto
              </button>
            ) : (
              <button
                onClick={agregarProductoManual}
                className="flex items-center gap-2 justify-center bg-[#e7f0f2] text-[#3276a8] font-bold h-12 px-4 rounded-[10px] w-full md:w-auto"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Agregar otro producto
              </button>
            )}
          </div>

          {/* Mobile: Card layout */}
          <div className="md:hidden space-y-3 w-full">
            {productos.length === 0 ? (
              <div
                className="bg-[#f0f4f5] rounded-[12px] p-6 text-center text-[#607078]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Sin productos. Agrega uno.
              </div>
            ) : (
              productos.map((p, i) => (
                <div
                  key={p.lineId ?? `line-${i}`}
                  className="bg-white border border-[#dce4e7] rounded-[12px] p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span
                      className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      Producto {i + 1}
                    </span>
                    <button
                      onClick={() => eliminarProducto(i)}
                      className="text-[#c0392b] p-2"
                      aria-label="Eliminar producto"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor={`programming-review-product-${p.lineId ?? i}-mobile`}
                        className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                        style={{ fontFamily: "'Inter', sans-serif" }}
                      >
                        Producto
                      </label>
                      <AutocompleteProducto
                        id={`programming-review-product-${p.lineId ?? i}-mobile`}
                        name={`reviewProducts[${p.lineId ?? i}][name]`}
                        ariaLabel={`Producto ${i + 1}`}
                        value={p.nombre}
                        onChange={(value) => actualizarProducto(i, "nombre", value)}
                        onSelect={(producto) => {
                          actualizarProducto(i, "nombre", producto.nombre);
                          actualizarProducto(i, "productId", producto.id);
                          actualizarProducto(i, "codigo", producto.sku);
                          actualizarProducto(i, "unidad", producto.unidad || "cajas");
                          actualizarProducto(i, "conversionMatch", true);
                          const conversion = catalogoConversionesDefault.find(
                            (c) => c.producto === producto.nombre,
                          );
                          if (conversion) {
                            actualizarProducto(i, "cajasPorTarima", conversion.cajasPorTarima);
                          }
                        }}
                        catalogos={catalogos.productos}
                        placeholder="Escribe para buscar..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`programming-number-5`}
                          className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Cajas
                        </label>
                        <input
                          id={`programming-number-5`}
                          name={`programmingNumber5`}
                          aria-label={`Valor numérico 5`}
                          type="number"
                          value={p.cantidad}
                          onChange={(e) =>
                            actualizarProducto(i, "cantidad", parseInt(e.target.value) || 0)
                          }
                          className="bg-white border border-[#dce4e7] h-11 px-3 rounded-lg w-full text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`programming-number-6`}
                          className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Cajas/Tarima
                        </label>
                        <input
                          id={`programming-number-6`}
                          name={`programmingNumber6`}
                          aria-label={`Valor numérico 6`}
                          type="number"
                          value={p.cajasPorTarima}
                          onChange={(e) =>
                            actualizarProducto(i, "cajasPorTarima", parseInt(e.target.value) || 0)
                          }
                          className="bg-white border border-[#dce4e7] h-11 px-3 rounded-lg w-full text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label
                          className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Tarimas
                        </label>
                        <div className="bg-[#f0f4f5] border border-[#dce4e7] h-11 px-3 rounded-lg w-full flex items-center">
                          <span
                            className="font-black text-[#16343f] text-[15px]"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                          >
                            {p.tarimas}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => confirmarProducto(i)}
                          className={`mt-2 rounded-lg px-2 py-1 text-[10px] font-bold ${
                            p.productConfirmed
                              ? "bg-[#e2f5ec] text-[#16845b]"
                              : "bg-[#16343f] text-white"
                          }`}
                        >
                          {p.productConfirmed ? "Producto confirmado" : "Confirmar producto"}
                        </button>
                      </div>
                      <div>
                        <label
                          className="text-[11px] font-bold text-[#607078] uppercase tracking-wide"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Match
                        </label>
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            p.conversionMatch
                              ? "bg-[#e2f5ec] text-[#16845b]"
                              : "bg-[#fdecea] text-[#c0392b]"
                          }`}
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          {p.conversionMatch ? "✓ Match" : "✗ Manual"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f0f4f5] text-left">
                  <th
                    className="p-3 font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Producto
                  </th>
                  <th
                    className="p-3 font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Cajas
                  </th>
                  <th
                    className="p-3 font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Cajas/Tarima
                  </th>
                  <th
                    className="p-3 font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Tarimas
                  </th>
                  <th
                    className="p-3 font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Match
                  </th>
                  <th
                    className="p-3 font-bold text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-6 text-center text-[#607078]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      Sin productos. Agrega uno o carga una OC.
                    </td>
                  </tr>
                ) : (
                  productos.map((p, i) => (
                    <tr
                      key={p.lineId ?? `line-${i}`}
                      className="border-b border-[#f0f4f5] last:border-0"
                    >
                      <td className="p-3">
                        <AutocompleteProducto
                          id={`programming-review-product-${p.lineId ?? i}-desktop`}
                          name={`reviewProducts[${p.lineId ?? i}][name]`}
                          ariaLabel={`Producto ${i + 1}`}
                          value={p.nombre}
                          onChange={(value) => actualizarProducto(i, "nombre", value)}
                          onSelect={(producto) => {
                            actualizarProducto(i, "nombre", producto.nombre);
                            actualizarProducto(i, "productId", producto.id);
                            actualizarProducto(i, "codigo", producto.sku);
                            actualizarProducto(i, "unidad", producto.unidad || "cajas");
                            actualizarProducto(i, "conversionMatch", true);
                            // Buscar cajasPorTarima en catalogoConversionesDefault
                            const conversion = catalogoConversionesDefault.find(
                              (c) => c.producto === producto.nombre,
                            );
                            if (conversion) {
                              actualizarProducto(i, "cajasPorTarima", conversion.cajasPorTarima);
                            }
                          }}
                          catalogos={catalogos.productos}
                          placeholder="Escribe para buscar..."
                        />
                      </td>
                      <td className="p-3">
                        <input
                          id={`programming-number-7`}
                          name={`programmingNumber7`}
                          aria-label={`Valor numérico 7`}
                          type="number"
                          value={p.cantidad}
                          onChange={(e) =>
                            actualizarProducto(i, "cantidad", parseInt(e.target.value) || 0)
                          }
                          className="bg-white border border-[#dce4e7] h-10 px-3 rounded-lg w-24 text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          id={`programming-number-8`}
                          name={`programmingNumber8`}
                          aria-label={`Valor numérico 8`}
                          type="number"
                          value={p.cajasPorTarima}
                          onChange={(e) =>
                            actualizarProducto(i, "cajasPorTarima", parseInt(e.target.value) || 0)
                          }
                          className="bg-white border border-[#dce4e7] h-10 px-3 rounded-lg w-28 text-[#172126] text-[13px] outline-none focus:border-[#3276a8]"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        />
                      </td>
                      <td
                        className="p-3 font-bold text-[#16343f]"
                        style={{ fontFamily: "'Inter', sans-serif" }}
                      >
                        {p.tarimas}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            p.conversionMatch
                              ? "bg-[#e2f5ec] text-[#16845b]"
                              : "bg-[#fdecea] text-[#c0392b]"
                          }`}
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          {p.conversionMatch ? "✓ Match" : "✗ Manual"}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => confirmarProducto(i)}
                          className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                            p.productConfirmed
                              ? "bg-[#e2f5ec] text-[#16845b]"
                              : "bg-[#16343f] text-white"
                          }`}
                        >
                          {p.productConfirmed ? "Producto confirmado" : "Confirmar producto"}
                        </button>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => eliminarProducto(i)}
                          className="text-[#c0392b] hover:underline text-sm"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="bg-[#f0f4f5] rounded-[12px] p-4 w-full">
            <div className="flex justify-between">
              <span
                className="font-bold text-[#607078]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Total Tarimas:
              </span>
              <span
                className="font-black text-[#16343f] text-[20px]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {totalTarimas()}
              </span>
            </div>
          </div>

          {/* Notices */}
          {notices.length > 0 && (
            <div className="bg-[#fff8e6] border border-[#f2b84b] flex gap-3 items-start p-[14px] rounded-[12px] w-full">
              <span className="text-[#f2b84b] text-[16px] shrink-0 mt-[1px]">⚠</span>
              <div className="flex flex-col gap-1">
                <p
                  className="font-bold text-[#7a5c00] text-[13px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Faltan datos requeridos:
                </p>
                <ul className="flex flex-col gap-[2px]">
                  {notices.map((n) => (
                    <li
                      key={n}
                      className="text-[#7a5c00] text-[12px]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      · {n}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col gap-3 w-full md:flex-row md:items-end md:justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex gap-2 h-12 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer transition-colors border touch-target w-full md:w-auto"
              style={{ background: "white", borderColor: "#dce4e7" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#172126"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <p
                className="font-bold text-sm md:text-[15px] whitespace-nowrap"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  color: "#172126",
                }}
              >
                Atrás
              </p>
            </button>
            <button
              onClick={handleGuardar}
              className="bg-[#16343f] border border-[#16343f] flex gap-2 h-12 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target w-full md:w-auto"
            >
              <img alt="" className="size-5 md:size-[18px]" src={imgArrowRight} />
              <p
                className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Generar Códigos
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Códigos listos para imprimir/enviar */}
      {step === 3 && (
        <div className="bg-white shadow-[0px_8px_12px_rgba(22,52,63,0.08)] flex flex-col gap-[14px] items-start p-5 rounded-[20px] w-full">
          <div className="flex items-center gap-4 w-full">
            <div
              className="bg-[#e2f5ec] flex items-center justify-center rounded-[18px] shrink-0"
              style={{ width: 72, height: 72 }}
            >
              <svg
                width="52"
                height="52"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16845b"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
                <path d="M22 10l-6 6-4-4" />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <p
                className="font-extrabold text-[#172126] text-[24px] leading-tight"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
              >
                Códigos Generados
              </p>
              <p
                className="text-[#607078] text-[13px]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
              >
                Paso 3 · Imprimir / Enviar / Continuar
              </p>
            </div>
          </div>

          <div className="bg-[#e2f5ec] border border-[#16845b] rounded-[12px] p-4 w-full">
            <p
              className="font-bold text-[#16845b] text-[13px]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              ✅ Programación guardada — {codigosQR.length} códigos QR listos
            </p>
          </div>

          {/* Resumen */}
          <div className="bg-[#f0f4f5] rounded-[12px] p-4 w-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Folio
                </p>
                <p
                  className="font-bold text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {folio}
                </p>
              </div>
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Fecha
                </p>
                <p
                  className="font-bold text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {fechaRecepcion}
                </p>
              </div>
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Tarimas
                </p>
                <p
                  className="font-bold text-[#16343f] text-[20px]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {totalTarimas()}
                </p>
              </div>
              <div>
                <p className="text-[#607078]" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Códigos
                </p>
                <p
                  className="font-bold text-[#16845b] text-[20px]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {codigosQR.length}
                </p>
              </div>
            </div>
          </div>

          {/* Vista previa códigos QR (simplificada) */}
          <div className="w-full">
            <p
              className="font-bold text-[#172126] text-[15px] mb-3"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Códigos QR generados (4 por tarima en hoja carta)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
              {codigosQR.slice(0, 20).map((qr, i) => (
                <div
                  key={qr}
                  className="bg-white border border-[#dce4e7] rounded-[12px] p-3 text-center"
                >
                  <div
                    className="bg-[#e7f0f2] rounded-[8px] aspect-square flex items-center justify-center mb-2"
                    style={{ fontSize: 10 }}
                  >
                    📱 {qr}
                  </div>
                  <p
                    className="text-[11px] font-bold text-[#172126]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Tarima {i + 1}
                  </p>
                  <p
                    className="text-[10px] text-[#607078]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    4 stickers
                  </p>
                </div>
              ))}
              {codigosQR.length > 20 && (
                <div
                  className="bg-white border border-[#dce4e7] rounded-[12px] p-3 text-center text-[#607078] text-sm"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  + {codigosQR.length - 20} más...
                </div>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-col gap-3 w-full">
            {/* Primera fila: 4 botones - mobile: stacked, desktop: row */}
            <div className="flex flex-col md:flex-row gap-3 w-full">
              <button
                onClick={handleImprimir}
                className="flex items-center gap-2 h-12 px-4 rounded-[14px] cursor-pointer transition-colors border touch-target flex-1 min-w-[140px]"
                style={{
                  background: "#16343f",
                  borderColor: "#16343f",
                  color: "white",
                }}
              >
                <img src={imgPrint} alt="" className="size-5" />
                <span className="font-bold text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Imprimir
                </span>
              </button>
              <button
                onClick={handleDescargarPDF}
                className="flex items-center gap-2 h-12 px-4 rounded-[14px] cursor-pointer transition-colors border touch-target flex-1 min-w-[140px]"
                style={{ background: "white", borderColor: "#dce4e7" }}
              >
                <img src={imgDownload} alt="" className="size-5" />
                <span
                  className="font-bold text-sm text-[#172126]"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  Descargar PDF
                </span>
              </button>
              <button
                onClick={handleEnviarWhatsApp}
                className="flex items-center gap-2 h-12 px-4 rounded-[14px] cursor-pointer transition-colors border touch-target flex-1 min-w-[140px]"
                style={{
                  background: "#25D366",
                  borderColor: "#25D366",
                  color: "white",
                }}
              >
                <img src={imgWhatsApp} alt="" className="size-5" />
                <span className="font-bold text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
                  WhatsApp
                </span>
              </button>
              <button
                onClick={handleEnviarEmail}
                className="flex items-center gap-2 h-12 px-4 rounded-[14px] cursor-pointer transition-colors border touch-target flex-1 min-w-[140px]"
                style={{
                  background: "#3276a8",
                  borderColor: "#3276a8",
                  color: "white",
                }}
              >
                <img src={imgEmail} alt="" className="size-5" />
                <span className="font-bold text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Email
                </span>
              </button>
            </div>

            {/* Segunda fila: Editar + Continuar */}
            <div className="flex flex-col gap-3 w-full md:flex-row md:items-end md:justify-between">
              <button
                onClick={handleEditar}
                className="flex gap-2 h-12 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer transition-colors border touch-target w-full md:w-auto"
                style={{
                  background: "white",
                  borderColor: "#f2b84b",
                  color: "#f2b84b",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f2b84b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <p
                  className="font-bold text-sm md:text-[15px] whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  ↩️ Editar Programación
                </p>
              </button>
              <button
                onClick={handleContinuarRecepcion}
                className="bg-[#16343f] border border-[#16343f] flex gap-2 h-12 md:h-[52px] items-center justify-center px-4 md:px-5 rounded-[14px] cursor-pointer hover:bg-[#1e4456] transition-colors touch-target w-full md:w-auto"
              >
                <img alt="" className="size-5 md:size-[18px]" src={imgArrowRight} />
                <p
                  className="font-bold text-white text-sm md:text-[15px] whitespace-nowrap"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  Continuar a Recepción Física ▶
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
