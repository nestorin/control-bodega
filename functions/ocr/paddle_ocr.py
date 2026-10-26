"""Módulo OCR con PaddleOCR + parsing para facturas mexicanas (CFDI)."""
import re
import io
import base64
import unicodedata
from typing import Dict, List, Optional, Any
from PIL import Image
import numpy as np

# Inicialización perezosa (solo cuando se necesite)
_ocr_instance = None
_PRODUCT_HEADER_RE = re.compile(
    r"^(nombre|art[ií]culo|precio|u\.?\s*med|unidades?|importe|descto?\.?|subtotal|total|iva)$",
    re.I,
)

def get_ocr():
    """Singleton: carga modelos una sola vez."""
    global _ocr_instance
    if _ocr_instance is None:
        from paddleocr import PaddleOCR
        import os
        
        # Configurar directorio de cache escribible para Cloud Run
        cache_dir = "/tmp/.paddleocr"
        os.makedirs(cache_dir, exist_ok=True)
        os.environ["PADDLEOCR_HOME"] = cache_dir
        
        _ocr_instance = PaddleOCR(
            use_angle_cls=True,
            lang='latin',          # latin = español, inglés, portugués, etc.
            use_gpu=False,
            show_log=False,
            det_model_dir=os.path.join(cache_dir, "det"),
            rec_model_dir=os.path.join(cache_dir, "rec"),
            cls_model_dir=os.path.join(cache_dir, "cls"),
        )
    return _ocr_instance


def ocr_image(image_bytes: bytes) -> Dict[str, Any]:
    """Ejecuta OCR sobre una imagen y devuelve bloques estructurados."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(image)
    
    ocr = get_ocr()
    result = ocr.ocr(img_array, cls=True)
    
    blocks = []
    for page in result:
        if page:
            for line in page:
                bbox, (text, confidence) = line
                blocks.append({
                    "text": text,
                    "confidence": float(confidence),
                    "bbox": [[float(x), float(y)] for x, y in bbox]
                })
    
    return {
        "pages": 1,
        "blocks": blocks,
        "full_text": "\n".join([b["text"] for b in blocks])
    }


def _pdf_page_blocks(page: Any, page_index: int) -> List[Dict[str, Any]]:
    """Extract text spans with per-span coordinates from one PDF page."""
    blocks: List[Dict] = []
    for raw in page.get_text("dict").get("blocks", []):
        for line in raw.get("lines", []):
            for span in line.get("spans", []):
                value = str(span.get("text", "")).strip()
                if not value:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                blocks.append({
                    "text": value,
                    "confidence": 1.0,
                    "bbox": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                    "page": page_index + 1,
                })
    return blocks


def _has_usable_native_text_layer(blocks: List[Dict[str, Any]]) -> bool:
    """Treat short scanner watermarks and page labels as non-content text."""
    text = " ".join(block.get("text", "") for block in blocks)
    text = re.sub(r"(?i)escaneado\s+con\s+camscanner|scanned\s+with\s+camscanner", " ", text)
    tokens = re.findall(r"[A-Za-zÀ-ÿ0-9]+", text)
    return len(tokens) >= 3 and sum(len(token) for token in tokens) >= 12


def _pdf_blocks(pdf_bytes: bytes) -> tuple[List[Dict], Optional[bytes]]:
    """Extract text/coordinates from all PDF pages and create a small preview."""
    import fitz

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    blocks: List[Dict] = []
    preview: Optional[bytes] = None
    for page_index, page in enumerate(document):
        blocks.extend(_pdf_page_blocks(page, page_index))
        if page_index == 0:
            # 200 DPI keeps small text printable without retaining the source PDF.
            pix = page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72), alpha=False)
            preview = pix.tobytes("jpeg", jpg_quality=82)
    document.close()
    return blocks, preview


def extract_document(file_bytes: bytes, content_type: str) -> Dict[str, Any]:
    """Use native PDF text per page and run PaddleOCR only on pages without it."""
    if content_type == "application/pdf" or file_bytes[:4] == b"%PDF":
        import fitz

        document = fitz.open(stream=file_bytes, filetype="pdf")
        page_count = len(document)
        combined_blocks: List[Dict[str, Any]] = []
        preview: Optional[bytes] = None
        try:
            for page_index, page in enumerate(document):
                page_blocks = _pdf_page_blocks(page, page_index)
                if _has_usable_native_text_layer(page_blocks):
                    combined_blocks.extend(page_blocks)
                else:
                    # Image-only or effectively empty page: OCR only this page.
                    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
                    image_bytes = pix.tobytes("jpeg", jpg_quality=90)
                    page_result = ocr_image(image_bytes)
                    for block in page_result["blocks"]:
                        combined_blocks.append({**block, "page": page_index + 1})

                if page_index == 0:
                    # Preview represents the original first page, independent of OCR route.
                    pix = page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72), alpha=False)
                    preview = pix.tobytes("jpeg", jpg_quality=82)
        finally:
            document.close()
        return {
            "pages": page_count,
            "blocks": combined_blocks,
            "full_text": "\n".join(block["text"] for block in combined_blocks),
            "preview": preview,
        }

    image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    preview_buffer = io.BytesIO()
    image.save(preview_buffer, format="JPEG", quality=82, optimize=True, progressive=True)
    result = ocr_image(file_bytes)
    result["preview"] = preview_buffer.getvalue()
    return result


# ─────────────────────────────────────────────────────────────────────────────
# PARSING CFDI / FACTURAS MEXICANAS (CFDI 4.0)
# ─────────────────────────────────────────────────────────────────────────────

# Mexican RFC: 3-character legal entity or 4-character individual prefix,
# followed by YYMMDD and the 3-character homoclave.
RFC_PATTERN = re.compile(r"\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b", re.I)
UUID_PATTERN = re.compile(
    r"\b[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\b",
    re.I,
)

# Folio: puede tener prefijo + número, ej: "FAC-2024-001", "A-123", "12345", "OC-24891"
# Acepta "Folio", "Folia" (OCR typo), "Factura", "No.", "Número", "OC", "Orden"
# NO debe capturar "Subtotal", "Total" como folio
FOLIO_PATTERN = re.compile(
    r"(?:Folio|Folia|Factura|No\.?|N[úu]mero|OC|Orden\s*(?:de\s*)?compra)\s*[:\\-]?\s*([A-Z0-9\-\.]{3,})",
    re.I,
)

# Fecha: múltiples formatos comunes en OC
# ISO con T: 2024-01-15T14:30:00
# Solo fecha: 2024-01-15, 15/01/2024, 15-01-2024, 2024-01-15
FECHA_PATTERN = re.compile(
    r"(?:Fecha|Expedici[oó]n|Emisi[oó]n)\s*[:\\-]?\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\d{4}-\d{2}-\d{2})",
    re.I,
)

# Totales: buscar etiqueta + cantidad con $ o sin, decimales obligatorios
# Captura: "Total: $1,250.00", "Total 1250.00", "Importe Total: 1,250.00"
# NO captura: "Subtotal: 100.00" (Subtotal contiene "Total" pero NO es Total)
TOTAL_PATTERN = re.compile(
    r"(?:^|\s)(?:Total|Importe\s+Total)\s*[:]?\s*\$?\s*([\d,]+\.\d{2})",
    re.I | re.M,
)

# Subtotal e IVA
SUBTOTAL_PATTERN = re.compile(r"Subtotal\s*[:$]?\s*([\d,]+\.\d{2})", re.I)
IVA_PATTERN = re.compile(r"(?:IVA|Impuesto\s*(?:Trasladado|IVA)?)\s*[:$]?\s*([\d,]+\.\d{2})", re.I)

# Método de pago: PUE, PPD, etc. (catálogo SAT)
METODO_PAGO_PATTERN = re.compile(r"(?:M[eé]todo|Forma)\s*(?:de\s*)?Pago\s*[:\\-]?\s*(PUE|PPD|[A-Z]{3})", re.I)

# Uso CFDI: G01, G02, G03, etc. (catálogo SAT)
USO_CFDI_PATTERN = re.compile(r"Uso\s*CFDI\s*[:\\-]?\s*([A-Z]\d{2})", re.I)

# Serie + Folio combinado: "Serie A Folio 123" o "A-123"
# Acepta "Folio", "Folia" (OCR typo)
SERIE_FOLIO_PATTERN = re.compile(r"(?:Serie|Folio|Folia)\s*[:\\-]?\s*([A-Z0-9\-\.]+)", re.I)

def _search(pattern: re.Pattern, text: str) -> Optional[str]:
    m = pattern.search(text)
    if not m:
        return None
    return m.group(1) if pattern.groups else m.group(0)


def _find_all_rfcs(text: str) -> List[str]:
    """Encuentra todos los RFCs en el texto, ordenados por aparición."""
    return RFC_PATTERN.findall(text)


def _extract_folio(text: str) -> Optional[str]:
    """Extrae folio priorizando patrones específicos sobre genéricos."""
    # Primero busca "Folio: XXX" o "Factura: XXX"
    for pattern in [FOLIO_PATTERN, SERIE_FOLIO_PATTERN]:
        match = pattern.search(text)
        if match:
            val = match.group(1).strip()
            # Filtrar falsos positivos
            if val.upper() not in ("TOTAL", "SUBTOTAL", "IVA", "IMPUESTO", "IMPORTE", "FOLIA", "FOLIO"):
                return val
    return None


def _extract_total(text: str) -> Optional[str]:
    """Extrae el total priorizando 'Total' sobre 'Subtotal'."""
    # Busca "Total: $1,250.00" o "Importe Total: 1250.00"
    match = TOTAL_PATTERN.search(text)
    if match:
        return match.group(1).replace(",", "")
    return None


def _extract_fecha(text: str) -> Optional[str]:
    """Extrae fecha de expedición en formato ISO."""
    match = FECHA_PATTERN.search(text)
    if match:
        return match.group(1)
    # Fallback: busca cualquier fecha ISO en el texto
    iso_date = re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", text)
    return iso_date.group(0) if iso_date else None


def _extract_rfcs(text: str) -> tuple[Optional[str], Optional[str]]:
    """Extrae RFC emisor y receptor. El primero suele ser emisor, segundo receptor."""
    rfcs = _find_all_rfcs(text)
    if len(rfcs) >= 2:
        return rfcs[0], rfcs[1]
    elif len(rfcs) == 1:
        return rfcs[0], None
    return None, None


def parse_cfdi(blocks: List[Dict]) -> Dict[str, Optional[str]]:
    """Extrae campos clave de factura mexicana (CFDI 4.0) desde bloques OCR."""
    full_text = " ".join([b["text"] for b in blocks])
    
    rfc_emisor, rfc_receptor = _extract_rfcs(full_text)
    
    extracted = {
        "rfc_emisor": rfc_emisor,
        "rfc_receptor": rfc_receptor,
        "folio": _extract_folio(full_text),
        "fecha": _extract_fecha(full_text),
        "uuid": _search(UUID_PATTERN, full_text),
        "total": _extract_total(full_text),
        "subtotal": _search(SUBTOTAL_PATTERN, full_text),
        "iva": _search(IVA_PATTERN, full_text),
        "metodo_pago": _search(METODO_PAGO_PATTERN, full_text),
        "uso_cfdi": _search(USO_CFDI_PATTERN, full_text),
    }
    
    # Normalizar valores numéricos (quitar comas)
    for key in ("total", "subtotal", "iva"):
        if extracted[key]:
            extracted[key] = extracted[key].replace(",", "")
    
    # Líneas de productos (heurística: bloques con precio + cantidad + alta confianza)
    lineas = []
    for b in blocks:
        txt = b["text"]
        if (re.search(r"\d+[\\.,]\d{2}", txt) and 
            len(txt) > 8 and 
            b["confidence"] > 0.75 and
            not any(kw in txt.upper() for kw in ["TOTAL", "SUBTOTAL", "IVA", "IMPUESTO", "IMPORTE", "FOLIO", "FECHA", "RFC"])):
            lineas.append(txt)
    extracted["lineas_detectadas"] = lineas[:20]
    
    return extracted


def parse_orden_compra(blocks: List[Dict]) -> Dict[str, Any]:
    """Parse a purchase order, using the fixed Smart & Final table when present."""
    full_text = " ".join([b["text"] for b in blocks])

    fixed_order = _parse_smart_final_order(blocks)
    if fixed_order is not None:
        orders = []
        for raw_order in fixed_order["ordenes"]:
            orders.append({
                **raw_order,
                "productos": [
                    {
                        "linea": product.get("linea"),
                        "codigo": product.get("codigo"),
                        "nombre": product.get("nombre", ""),
                        "unidad": product.get("u_med"),
                        "cantidad": product.get("unidades"),
                        "precio": product.get("precio", 0.0),
                        "importe": product.get("importe", 0.0),
                        "confianza": product.get("confianza", 1.0),
                    }
                    for product in raw_order["productos"]
                ],
            })
        first_order = orders[0]
        parsed = {
            "folio": first_order["folio"],
            "fecha": first_order["fecha"],
            "total": first_order["total"],
            "proveedor": first_order["proveedor"] or _extract_proveedor(full_text, is_oc=True),
            "proveedor_posible": first_order["proveedor"] or _extract_proveedor(full_text, is_oc=True),
            "productos": first_order["productos"],
            "lineas_detectadas": first_order["lineas_detectadas"],
        }
        if len(orders) > 1:
            parsed["ordenes"] = orders
        return parsed
    
    # Extraer productos estructurados (misma lógica que CFDI)
    lines = _extract_product_lines(blocks)
    
    return {
        "folio": _search(FOLIO_PATTERN, full_text),
        "fecha": _search(FECHA_PATTERN, full_text),
        "total": _search(TOTAL_PATTERN, full_text),
        "proveedor": _extract_proveedor(full_text, is_oc=True),
        "proveedor_posible": _extract_proveedor(full_text, is_oc=True),  # compatibilidad hacia atrás
        "productos": [
            {
                "linea": line["linea"],
                "codigo": line["codigo"],
                "nombre": line["nombre"],
                "unidad": line["u_med"],
                "cantidad": line["unidades"],
                "precio": line["precio"],
                "importe": line["importe"],
                "confianza": line["confianza"],
            }
            for line in lines
        ],
        "lineas_detectadas": [  # compatibilidad hacia atrás
            b["text"] for b in blocks 
            if re.search(r"\d+[.,]\d{2}", b["text"]) and len(b["text"]) > 5
        ][:15]
    }


def _extract_proveedor(text: str, is_oc: bool = False) -> Optional[str]:
    """Intenta extraer nombre de proveedor.
    
    Para CFDI: busca línea antes de RFC
    Para OC: busca patrones como "Proveedor:", "Proveedor", o líneas arriba del folio
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    
    if is_oc:
        # Para OC: buscar "Proveedor:" o "Proveedor" explícito
        for i, line in enumerate(lines):
            match = re.search(r"(?:^|\s)Proveedor\s*[:\\-]?\s*(.+)", line, re.I)
            if match:
                candidate = match.group(1).strip()
                # Limpiar: solo tomar hasta el final de la línea, no incluir headers
                candidate = re.split(r"\s+(?:CANT|UNIDAD|DESCRIPCI[OÓ]N|PRECIO|IMPORTE|CODIGO|FECHA|FOLIO)", candidate, flags=re.I)[0]
                if candidate and len(candidate) > 2:
                    return candidate[:100]
        
        # Si no hay "Proveedor:", buscar líneas que parezcan nombres de empresa
        # (líneas antes del folio/fecha, que no sean headers)
        for i, line in enumerate(lines):
            if re.search(r"(OC|Orden|Folio|No\.|Fecha)", line, re.I):
                # Mirar líneas anteriores (hasta 3 arriba)
                for j in range(max(0, i-3), i):
                    candidate = lines[j]
                    if (len(candidate) > 3 and 
                        not re.search(r"(ORDEN|COMPRA|FOLIO|FECHA|TOTAL|SUBTOTAL|IVA|IMPORTE|CANT|UNIDAD|DESCRIPCION|PRECIO|IMPORTE|CODIGO|CANTIDAD)", candidate, re.I)):
                        return candidate[:100]
    
    # Fallback CFDI: buscar RFC y tomar línea anterior
    for i, line in enumerate(lines):
        if RFC_PATTERN.search(line) and i > 0:
            return lines[i-1].strip()[:100]
    
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Structured invoice rows.
# ─────────────────────────────────────────────────────────────────────────────
def _number(value: str) -> Optional[float]:
    try:
        return float(value.replace("$", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _row_y(block: Dict) -> float:
    bbox = block.get("bbox") or []
    return sum(point[1] for point in bbox) / len(bbox) if bbox else 0.0


def _group_rows(blocks: List[Dict], tolerance: float = 14.0) -> List[List[Dict]]:
    rows: List[List[Dict]] = []
    for block in sorted(blocks, key=lambda item: (_row_y(item), item.get("bbox", [[0]])[0][0])):
        y = _row_y(block)
        row = next((candidate for candidate in rows if abs(_row_y(candidate[0]) - y) <= tolerance), None)
        if row is None:
            rows.append([block])
        else:
            row.append(block)
    return [sorted(row, key=lambda item: item.get("bbox", [[0]])[0][0]) for row in rows]


def _normalized_layout_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", normalized.lower())


def _block_center_x(block: Dict[str, Any]) -> float:
    bbox = block.get("bbox") or []
    if bbox:
        return sum(point[0] for point in bbox) / len(bbox)
    return float(block.get("x", 0.0))


def _row_text(row: List[Dict[str, Any]]) -> str:
    return " ".join(block.get("text", "").strip() for block in row if block.get("text", "").strip())


def _candidate_folio(value: str) -> Optional[str]:
    """Select an order identifier, excluding dates and unrelated stamp text."""
    for token in re.findall(r"[A-Z0-9][A-Z0-9/-]{2,}", value, flags=re.I):
        compact = token.upper().replace("-", "").replace("/", "")
        if re.fullmatch(r"\d{4}", compact):
            continue
        if re.search(r"[A-Z]", compact) and re.search(r"\d", compact):
            return token.upper()
        if compact.isdigit() and len(compact) >= 5:
            return token
    return None


def _fixed_order_folio(rows: List[List[Dict[str, Any]]]) -> Optional[str]:
    for index, row in enumerate(rows):
        for block in row:
            text = block.get("text", "").strip()
            match = re.search(r"\bFolio\b\s*[:#-]?\s*(.+)$", text, flags=re.I)
            if match and (candidate := _candidate_folio(match.group(1))):
                return candidate

        label_blocks = [
            block for block in row
            if "folio" in _normalized_layout_text(block.get("text", ""))
        ]
        if not label_blocks:
            continue
        label_x = sum(_block_center_x(block) for block in label_blocks) / len(label_blocks)
        for next_row in rows[index + 1:index + 3]:
            candidates = sorted(
                next_row,
                key=lambda block: abs(_block_center_x(block) - label_x),
            )
            for block in candidates:
                if abs(_block_center_x(block) - label_x) > 110:
                    continue
                if candidate := _candidate_folio(block.get("text", "")):
                    return candidate
    return None


def _fixed_order_supplier(rows: List[List[Dict[str, Any]]]) -> Optional[str]:
    for index, row in enumerate(rows):
        for block in row:
            text = block.get("text", "").strip()
            match = re.search(r"\bProveedor\b\s*[:#-]?\s*(.+)$", text, flags=re.I)
            if match and match.group(1).strip():
                return match.group(1).strip()[:100]

        if not any("proveedor" in _normalized_layout_text(block.get("text", "")) for block in row):
            continue
        if index + 1 >= len(rows):
            continue
        value = _row_text(rows[index + 1])
        if value and _normalized_layout_text(value) not in {"proveedor", "factura", "condiciones"}:
            # In this layout the supplier is a dedicated cell. The address appears
            # on the following row and is deliberately not treated as the supplier.
            return value[:100]
    return None


def _fixed_header_columns(row: List[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    columns: Dict[str, float] = {}
    for block in row:
        text = block.get("text", "")
        normalized = _normalized_layout_text(text)
        if normalized.startswith("articulo"):
            columns.setdefault("code", _block_center_x(block))
        elif normalized.startswith("nombre"):
            columns.setdefault("name", _block_center_x(block))
        elif normalized in {"umed", "umedida", "unidadmedida"}:
            columns.setdefault("unit", _block_center_x(block))
        elif normalized in {"unidades", "unidad"}:
            columns.setdefault("quantity", _block_center_x(block))
        elif normalized.startswith("precio"):
            columns.setdefault("price", _block_center_x(block))
        elif normalized.startswith("importe"):
            columns.setdefault("amount", _block_center_x(block))

    if not all(name in columns for name in ("code", "name", "unit", "quantity")):
        return None
    ordered = [columns[name] for name in ("code", "name", "unit", "quantity")]
    if ordered != sorted(ordered) or len(set(ordered)) != len(ordered):
        return None
    return columns


def _interval_value(row: List[Dict[str, Any]], left: float, right: float) -> str:
    values = [
        block.get("text", "").strip()
        for block in row
        if left <= _block_center_x(block) < right and block.get("text", "").strip()
    ]
    return " ".join(values).strip()


def _smart_final_products_for_page(
    rows: List[List[Dict[str, Any]]],
    start_index: int,
    columns: Dict[str, float],
    first_line: int,
) -> List[Dict[str, Any]]:
    price_x = columns.get("price", columns["quantity"] + 120)
    amount_x = columns.get("amount", price_x + 120)
    code_name = (columns["code"] + columns["name"]) / 2
    name_unit = (columns["name"] + columns["unit"]) / 2
    unit_quantity = (columns["unit"] + columns["quantity"]) / 2
    quantity_price = (columns["quantity"] + price_x) / 2
    price_amount = (price_x + amount_x) / 2

    products: List[Dict[str, Any]] = []
    for row in rows[start_index:]:
        row_text = _row_text(row)
        normalized = _normalized_layout_text(row_text)
        if any(marker in normalized for marker in ("subtotal", "importe", "total", "iva")):
            if "total" in normalized or "subtotal" in normalized:
                break
            continue
        if _fixed_header_columns(row) is not None:
            continue

        code_text = _interval_value(row, float("-inf"), code_name)
        code_candidates = re.findall(r"[A-Z0-9][A-Z0-9/-]{2,}", code_text, flags=re.I)
        code = next(
            (
                candidate.upper() for candidate in code_candidates
                if re.search(r"[A-Z]", candidate) and re.search(r"\d", candidate)
            ),
            None,
        )
        name = _interval_value(row, code_name, name_unit)
        unit = _interval_value(row, name_unit, unit_quantity)
        quantity_text = _interval_value(row, unit_quantity, quantity_price)
        quantity_match = re.search(r"(?<![\w])\d+(?:[.,]\d+)?(?![\w])", quantity_text)
        quantity = _number(quantity_match.group(0)) if quantity_match else None
        if not (code and name and unit and quantity is not None and quantity > 0):
            continue

        price_text = _interval_value(row, quantity_price, price_amount)
        amount_text = _interval_value(row, price_amount, float("inf"))
        price = _number(price_text) or 0.0
        amount = _number(amount_text) or 0.0
        products.append({
            "linea": first_line + len(products),
            "codigo": code,
            "nombre": name[:240],
            "u_med": unit,
            "unidades": quantity,
            "precio": price,
            "importe": amount,
            "confianza": min(float(block.get("confidence", 1.0)) for block in row),
        })
    return products


def _parse_smart_final_order(blocks: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Parse Smart & Final pages and keep different purchase-order folios separate."""
    full_text = " ".join(block.get("text", "") for block in blocks)
    normalized_text = _normalized_layout_text(full_text)
    if "smart" not in normalized_text or "final" not in normalized_text:
        return None

    pages: Dict[int, List[Dict[str, Any]]] = {}
    for block in blocks:
        pages.setdefault(int(block.get("page", 1)), []).append(block)

    orders_by_folio: Dict[str, Dict[str, Any]] = {}
    fallback_columns: Optional[Dict[str, float]] = None
    for page_number in sorted(pages):
        # The fixed purchase-order form places table headers and values only
        # about 12 points apart vertically; a larger tolerance merges them.
        rows = _group_rows(pages[page_number], tolerance=6.0)
        folio = _fixed_order_folio(rows)
        supplier = _fixed_order_supplier(rows)
        page_text = " ".join(_row_text(row) for row in rows)
        page_products: List[Dict[str, Any]] = []
        columns = None
        header_index = None
        for index, row in enumerate(rows):
            columns = _fixed_header_columns(row)
            if columns is not None:
                header_index = index
                fallback_columns = columns
                break

        if header_index is not None and columns is not None:
            page_products = _smart_final_products_for_page(
                rows, header_index + 1, columns, 1
            )
        elif fallback_columns is not None:
            # Continuation pages can omit repeated table headings. Reuse only the
            # previous page's column map; a different folio still creates a new order.
            page_products = _smart_final_products_for_page(rows, 0, fallback_columns, 1)

        if not page_products:
            continue

        key = folio.upper() if folio else f"__page_{page_number}"
        if key not in orders_by_folio:
            orders_by_folio[key] = {
                "folio": folio,
                "fecha": _search(FECHA_PATTERN, page_text),
                "total": _search(TOTAL_PATTERN, page_text),
                "proveedor": supplier,
                "proveedor_posible": supplier,
                "productos": [],
                "lineas_detectadas": [],
            }

        order = orders_by_folio[key]
        order["proveedor"] = order["proveedor"] or supplier
        order["proveedor_posible"] = order["proveedor"]
        for product in page_products:
            product["linea"] = len(order["productos"]) + 1
            order["productos"].append(product)
            order["lineas_detectadas"].append(product["nombre"])

    orders = list(orders_by_folio.values())
    if not orders:
        return None
    return {"ordenes": orders}


def _extract_cliente(blocks: List[Dict]) -> Optional[str]:
    rows = _group_rows(blocks)
    for index, row in enumerate(rows):
        text = " ".join(block["text"] for block in row).strip()
        if re.search(r"\bCliente\b", text, re.I) and index + 1 < len(rows):
            same_row = re.sub(r"\bCliente\b", "", text, flags=re.I).strip(" :-")
            if same_row:
                return same_row[:160]
            candidate = " ".join(block["text"] for block in rows[index + 1]).strip()
            if candidate and not re.search(r"RFC|Direcci[oó]n|C[oó]digo", candidate, re.I):
                return candidate[:160]
    return None


def _extract_product_lines(blocks: List[Dict]) -> List[Dict[str, Any]]:
    """Parse every product row; never cap the result at four products.
    
    Handles two formats:
    1. Tabular: rows with quantity, price, amount columns (multiple blocks per row)
    2. Horizontal/inline: "CANT PRODUCTO CODIGO" on single line (one block per row)
    """
    rows = _group_rows(blocks)
    lines: List[Dict[str, Any]] = []
    for row in rows:
        block_texts = [block["text"].strip() for block in row if block.get("text", "").strip()]
        if not block_texts or any(_PRODUCT_HEADER_RE.match(value) for value in block_texts) and len(block_texts) <= 3:
            continue
        
        # Check if this row is horizontal format: single block with multiple space-separated tokens
        is_horizontal = len(row) == 1 and len(block_texts[0].split()) >= 4
        
        if is_horizontal:
            # Split the single block text into tokens for horizontal parsing
            values = block_texts[0].split()
        else:
            # Tabular: each block is a column
            values = block_texts
        
        if not values:
            continue
        
        # Try tabular parsing first (quantity/price/amount triplet)
        parsed = _try_parse_tabular_row(values, row)
        if parsed:
            lines.append(parsed)
            continue
            
        # Fallback: horizontal/inline format parsing
        parsed = _try_parse_horizontal_row(values)
        if parsed:
            lines.append(parsed)
            
    # Set line numbers
    for i, line in enumerate(lines):
        line["linea"] = i + 1
        
    return lines


def _try_parse_tabular_row(values: List[str], row: List[Dict]) -> Optional[Dict[str, Any]]:
    """Original tabular parsing: find quantity/price/amount triplet."""
    numeric = [(index, _number(value)) for index, value in enumerate(values)]
    numbers = [(index, value) for index, value in numeric if value is not None]
    if len(numbers) < 3:
        return None
    
    candidates = []
    for quantity_index, quantity in numbers:
        for price_index, price in numbers:
            for amount_index, amount in numbers:
                if len({quantity_index, price_index, amount_index}) < 3:
                    continue
                if quantity <= 0 or price < 0 or amount <= 0:
                    continue
                error = abs(quantity * price - amount)
                if error <= max(0.05, amount * 0.03):
                    span = max(quantity_index, price_index, amount_index) - min(quantity_index, price_index, amount_index)
                    candidates.append((span, amount_index, quantity_index, price_index, amount, quantity, price))
    if not candidates:
        return None
    _, amount_index, quantity_index, price_index, amount, quantity, price = sorted(candidates, key=lambda item: (item[2], item[1], item[0]))[0]
    if quantity is None or price is None or amount is None or quantity <= 0 or price < 0:
        return None
    if abs(quantity * price - amount) > max(0.05, amount * 0.03):
        return None
    
    before_quantity = [value for value in values[:quantity_index] if _number(value) is None and not _PRODUCT_HEADER_RE.match(value)]
    after_amount = [value for value in values[amount_index + 1:] if _number(value) is None and not _PRODUCT_HEADER_RE.match(value)]
    name_parts = after_amount or before_quantity
    if not name_parts:
        return None
    unit = next((value for value in before_quantity if re.search(r"caja|pieza|unidad|kg|litro|metro|pza", value, re.I)), None)
    code = next((value.upper() for value in before_quantity if re.fullmatch(r"[A-Z]{1,5}\d{2,10}", value.upper())), None)
    name = " ".join(value for value in name_parts if value != unit).strip()
    name = re.split(r"\s+(?:\d{6,8}/|Fracci[oó]n arancelaria|Unidad aduana|XBX/)", name, maxsplit=1, flags=re.I)[0].strip()
    
    return {
        "linea": 0,
        "codigo": code,
        "nombre": name[:240],
        "u_med": unit,
        "unidades": quantity,
        "precio": price,
        "importe": amount,
        "confianza": min(float(block.get("confidence", 1.0)) for block in row),
    }


def _try_parse_horizontal_row(values: List[str]) -> Optional[Dict[str, Any]]:
    """Parse horizontal/inline format: '10 CAJA PRODUCTO ABC123' or '10 PZA PRODUCTO 500.00'"""
    if len(values) < 2:
        return None
    
    # Pattern: CANTIDAD + (UNIDAD?) + NOMBRE + (CODIGO?) + (PRECIO?) + (IMPORTE?)
    # Find first number as potential quantity
    for i, value in enumerate(values):
        qty = _number(value)
        if qty is None or qty <= 0:
            continue
        
        # Look for unit after quantity
        unit = None
        name_start = i + 1
        if name_start < len(values):
            next_val = values[name_start]
            if re.search(r"caja|pieza|unidad|kg|litro|metro|pza|pz|und|un", next_val, re.I):
                unit = next_val
                name_start += 1
        
        # Remaining values form the product name + possible code + price + amount
        if name_start >= len(values):
            continue
        
        # Find potential code (alphanumeric like ABC123 or CC-600)
        code = None
        name_parts = []
        price = None
        amount = None
        
        # Track if we've seen a unit-like token after a number (e.g., "600 ML")
        # to avoid treating "600" as price when followed by ML/L/KG/G
        unit_suffixes = {"ml", "l", "kg", "g", "mg", "kl", "mm", "cm", "m", "oz", "lb"}
        
        for j in range(name_start, len(values)):
            val = values[j]
            val_upper = val.upper()
            val_lower = val.lower()
            
            # Check for code pattern (alphanumeric with optional dash: ABC123, CC-600, CC-2L)
            if code is None and re.fullmatch(r"[A-Z]{1,5}[-\d][A-Z0-9]{1,}", val_upper):
                code = val_upper
                continue
            
            # Check if this value is a number
            num = _number(val)
            if num is not None:
                # Check if next value is a unit suffix (e.g., "600" followed by "ML")
                # In that case, it's part of product name, not a price
                is_quantity_with_unit = (
                    j + 1 < len(values) and 
                    values[j + 1].lower() in unit_suffixes
                )
                
                if is_quantity_with_unit:
                    # This number + next token is a specification (e.g., "600 ML"), not a price
                    name_parts.append(val)
                    continue
                
                # Regular price/amount detection (at the end of the line)
                if price is None:
                    price = num
                elif amount is None:
                    amount = num
                continue
            
            name_parts.append(val)
        
        if not name_parts:
            continue
        
        name = " ".join(name_parts).strip()
        name = re.split(r"\s+(?:\d{6,8}/|Fracci[oó]n arancelaria|Unidad aduana|XBX/)", name, maxsplit=1, flags=re.I)[0].strip()
        
        # If no price found, use amount as price * qty heuristic or default
        if price is None and amount is not None and qty > 0:
            price = round(amount / qty, 2)
        elif price is None:
            price = 0.0
        if amount is None and price > 0 and qty > 0:
            amount = round(price * qty, 2)
        elif amount is None:
            amount = 0.0
        
        return {
            "linea": 0,
            "codigo": code,
            "nombre": name[:240],
            "u_med": unit,
            "unidades": qty,
            "precio": price,
            "importe": amount,
            "confianza": 0.6,  # Lower confidence for horizontal parsing
        }
    
    return None


def parse_cfdi(blocks: List[Dict]) -> Dict[str, Any]:
    """Extract header data and an arbitrary number of validated product rows."""
    full_text = "\n".join(block["text"] for block in blocks)
    rfc_emisor, rfc_receptor = _extract_rfcs(full_text)
    total = _extract_total(full_text)
    lines = _extract_product_lines(blocks)
    return {
        "rfc_emisor": rfc_emisor,
        "rfc_receptor": rfc_receptor,
        "folio": _extract_folio(full_text),
        "fecha": _extract_fecha(full_text),
        "uuid": _search(UUID_PATTERN, full_text),
        "cliente": _extract_cliente(blocks),
        "total": total.replace(",", "") if total else None,
        "subtotal": _search(SUBTOTAL_PATTERN, full_text),
        "iva": _search(IVA_PATTERN, full_text),
        "metodo_pago": _search(METODO_PAGO_PATTERN, full_text),
        "uso_cfdi": _search(USO_CFDI_PATTERN, full_text),
        "productos": lines,
        "lineas_detectadas": [line["nombre"] for line in lines],
    }
