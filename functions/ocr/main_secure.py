"""Firebase Functions Gen2 - Endpoint OCR Seguro (Callable + App Check + Rate Limit)."""
import json
import base64
import time
from functools import wraps
from firebase_functions import https_fn
from firebase_functions.options import set_global_options, CorsOptions
from .paddle_ocr import extract_document, parse_cfdi, parse_orden_compra

# Config global: 2GB RAM, 120s timeout, región us-central1
set_global_options(region="us-central1", memory=2048, timeout_sec=120)

# CORS configuration for production domain
ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"
CORS_OPTS = CorsOptions(cors_origins=[ALLOWED_ORIGIN])

# ===== RATE LIMIT: 10 req/min por usuario (en memoria, para demo) =====
_rate_limit_store: dict[str, list[float]] = {}
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW_SEC = 60

def _check_rate_limit(user_id: str) -> bool:
    """Verifica rate limit. Retorna True si permitido, False si excedido."""
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW_SEC
    
    # Limpiar entradas antiguas
    if user_id in _rate_limit_store:
        _rate_limit_store[user_id] = [t for t in _rate_limit_store[user_id] if t > window_start]
    else:
        _rate_limit_store[user_id] = []
    
    # Verificar límite
    if len(_rate_limit_store[user_id]) >= RATE_LIMIT_MAX:
        return False
    
    # Registrar request
    _rate_limit_store[user_id].append(now)
    return True


def _has_valid_purchase_order(parsed: dict) -> bool:
    orders = parsed.get("ordenes") or [parsed]
    for order in orders:
        folio = order.get("folio")
        products = order.get("productos") or []
        if not isinstance(folio, str) or not folio.strip():
            continue
        if any(
            isinstance(product.get("nombre"), str)
            and product["nombre"].strip()
            and _positive_quantity(product.get("cantidad"))
            for product in products
        ):
            return True
    return False


def _positive_quantity(value) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False

# ===== DECORADOR DE AUTENTICACIÓN =====
def require_auth(func):
    """Decorator que verifica autenticación y App Check."""
    @wraps(func)
    def wrapper(req: https_fn.CallableRequest, *args, **kwargs):
        # Verificar App Check (Firebase lo hace automáticamente si está configurado)
        # Verificar autenticación
        if not req.auth:
            raise https_fn.HttpsError(
                "unauthenticated",
                "Se requiere autenticación. Inicia sesión para usar OCR."
            )
        
        # Rate limit por UID
        if not _check_rate_limit(req.auth.uid):
            raise https_fn.HttpsError(
                "resource-exhausted",
                f"Límite de {RATE_LIMIT_MAX} requests por minuto excedido. Intenta más tarde."
            )
        
        return func(req, *args, **kwargs)
    return wrapper

# ===== CALLABLE FUNCTION PRINCIPAL =====
@https_fn.on_call(cors=CORS_OPTS, enforce_app_check=True)
@require_auth
def extract_ocr_secure(req: https_fn.CallableRequest) -> dict:
    """
    Callable function segura para OCR.
    
    Input (data):
    - fileBase64: string (base64 del archivo)
    - mimeType: string (application/pdf, image/jpeg, image/png)
    - tipo: "cfdi" | "oc" (default: "cfdi")
    
    Output:
    - success: boolean
    - ocr: { blocks, full_text }
    - parsed: { folio, fecha, proveedor, total, productos[], ... }
    - tipo: string
    - preview?: { mimeType, dataUrl }
    - error?: string
    """
    try:
        data = req.data
        
        # Validar entrada
        file_base64 = data.get("fileBase64")
        mime_type = (data.get("mimeType") or "").lower()
        doc_type = data.get("tipo", "cfdi")
        
        if not file_base64:
            raise https_fn.HttpsError("invalid-argument", "Campo 'fileBase64' requerido")
        
        allowed_mime_types = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
        if mime_type not in allowed_mime_types:
            raise https_fn.HttpsError("invalid-argument", "Formato no soportado. Usa PDF, JPG, PNG o WEBP.")
        
        if doc_type not in ("cfdi", "oc"):
            raise https_fn.HttpsError("invalid-argument", "Tipo debe ser 'cfdi' o 'oc'")
        
        if not isinstance(file_base64, str) or len(file_base64) > 14 * 1024 * 1024:
            raise https_fn.HttpsError("invalid-argument", "Archivo demasiado grande o inválido (máx 10MB)")

        # Decodificar base64
        try:
            document_bytes = base64.b64decode(file_base64, validate=True)
        except Exception:
            raise https_fn.HttpsError("invalid-argument", "fileBase64 inválido (no es base64 válido)")
        
        # Validar tamaño (max 10MB)
        if not document_bytes or len(document_bytes) > 10 * 1024 * 1024:
            raise https_fn.HttpsError("invalid-argument", "Archivo demasiado grande (máx 10MB)")
        
        # Ejecutar OCR
        ocr_result = extract_document(document_bytes, mime_type)
        
        # Parsing según tipo
        if doc_type == "cfdi":
            parsed = parse_cfdi(ocr_result["blocks"])
        else:
            parsed = parse_orden_compra(ocr_result["blocks"])
            if not _has_valid_purchase_order(parsed):
                raise https_fn.HttpsError(
                    "invalid-argument",
                    "No se encontró una orden de compra válida. Verifica que el archivo tenga folio y productos legibles, o carga una orden compatible.",
                )
        
        response = {
            "success": True,
            "ocr": {
                "blocks": ocr_result["blocks"],
                "full_text": ocr_result["full_text"]
            },
            "parsed": parsed,
            "tipo": doc_type
        }
        
        # Preview transitorio (no se persiste en Firestore)
        if ocr_result.get("preview"):
            response["preview"] = {
                "mimeType": "image/jpeg",
                "dataUrl": "data:image/jpeg;base64," + base64.b64encode(ocr_result["preview"]).decode("ascii")
            }
        
        return response
    
    except https_fn.HttpsError:
        raise  # Re-lanzar errores conocidos
    except Exception as e:
        print(f"OCR Error for user {req.auth.uid if req.auth else 'unknown'}: {e}")
        raise https_fn.HttpsError("internal", "Error procesando OCR")


# ===== HEALTH CHECK (público, sin auth) =====
@https_fn.on_call(cors=CORS_OPTS)
def health(req: https_fn.CallableRequest) -> dict:
    return {"status": "ok", "service": "ocr-secure"}
