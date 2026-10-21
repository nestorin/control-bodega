"""Firebase Functions Gen2 - Callable OCR con PaddleOCR."""
import json
import base64
import time
from typing import Dict, Tuple
from firebase_functions import https_fn
from firebase_functions.options import set_global_options, CorsOptions
from firebase_functions.params import SecretParam
from .paddle_ocr import extract_document, parse_cfdi, parse_orden_compra

# Config global: 2GB RAM, 120s timeout, región us-central1
set_global_options(region="us-central1", memory=2048, timeout_sec=120)

# CORS configuration for production domain
ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"
CORS_OPTS = CorsOptions(cors_origins=[ALLOWED_ORIGIN])

# ─────────────────────────────────────────────────────────────────────────────
# RATE LIMITING: 10 req/min por usuario (in-memory, suficiente para Cloud Run)
# ─────────────────────────────────────────────────────────────────────────────
_rate_limit_store: Dict[str, list] = {}
RATE_LIMIT_WINDOW_SEC = 60
RATE_LIMIT_MAX_REQUESTS = 10

def _check_rate_limit(uid: str) -> Tuple[bool, int]:
    """Retorna (allowed, remaining). Limpia entradas expiradas."""
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW_SEC
    
    if uid not in _rate_limit_store:
        _rate_limit_store[uid] = []
    
    # Filtrar timestamps dentro de la ventana
    _rate_limit_store[uid] = [ts for ts in _rate_limit_store[uid] if ts > window_start]
    
    current_count = len(_rate_limit_store[uid])
    if current_count >= RATE_LIMIT_MAX_REQUESTS:
        return False, 0
    
    _rate_limit_store[uid].append(now)
    return True, RATE_LIMIT_MAX_REQUESTS - current_count - 1


# ─────────────────────────────────────────────────────────────────────────────
# CALLABLE FUNCTION SEGURA (nueva - requiere auth + App Check)
# ─────────────────────────────────────────────────────────────────────────────
@https_fn.on_call()
def extract_ocr_secure(req: https_fn.CallableRequest) -> dict:
    """
    Callable Function segura para OCR.
    
    Input:
    {
      "fileBase64": "base64 string (sin prefijo data:...)",
      "mimeType": "application/pdf" | "image/jpeg" | "image/png",
      "tipo": "cfdi" | "oc"
    }
    
    Requiere:
    - App Check válido (enforced en firebase.json)
    - Usuario autenticado (req.auth != None)
    - Rate limit: 10 req/min por uid
    """
    # 1. Verificar autenticación
    if not req.auth:
        raise https_fn.HttpsError(
            "unauthenticated",
            "Usuario no autenticado. Inicia sesión para usar OCR."
        )
    
    uid = req.auth.uid
    
    # 2. Rate limiting
    allowed, remaining = _check_rate_limit(uid)
    if not allowed:
        raise https_fn.HttpsError(
            "resource-exhausted",
            f"Rate limit excedido. Máximo {RATE_LIMIT_MAX_REQUESTS} requests por minuto."
        )
    
    # 3. Validar input
    data = req.data
    file_base64 = data.get("fileBase64")
    mime_type = data.get("mimeType")
    doc_type = data.get("tipo", "cfdi")
    
    if not file_base64 or not isinstance(file_base64, str):
        raise https_fn.HttpsError("invalid-argument", "Campo 'fileBase64' requerido (string base64)")
    
    if not mime_type or mime_type not in ("application/pdf", "image/jpeg", "image/png"):
        raise https_fn.HttpsError("invalid-argument", "Campo 'mimeType' inválido. Use: application/pdf, image/jpeg, image/png")
    
    if doc_type not in ("cfdi", "oc"):
        raise https_fn.HttpsError("invalid-argument", "Campo 'tipo' inválido. Use: 'cfdi' o 'oc'")
    
    try:
        # Decodificar base64
        document_bytes = base64.b64decode(file_base64)
        
        # Ejecutar OCR
        ocr_result = extract_document(document_bytes, mime_type)
        
        # Parsing según tipo
        if doc_type == "cfdi":
            parsed = parse_cfdi(ocr_result["blocks"])
        elif doc_type == "oc":
            parsed = parse_orden_compra(ocr_result["blocks"])
        else:
            parsed = {"tipo_desconocido": doc_type}
        
        response = {
            "success": True,
            "ocr": {
                "blocks": ocr_result["blocks"],
                "full_text": ocr_result["full_text"]
            },
            "parsed": parsed,
            "tipo": doc_type
        }
        if ocr_result.get("preview"):
            response["preview"] = {
                "mimeType": "image/jpeg",
                "dataUrl": "data:image/jpeg;base64," + base64.b64encode(ocr_result["preview"]).decode("ascii"),
            }
        
        # Incluir rate limit info en headers para cliente
        return response
    
    except https_fn.HttpsError:
        raise
    except Exception as e:
        print(f"OCR Error: {e}")
        raise https_fn.HttpsError("internal", f"Error procesando OCR: {str(e)}")


@https_fn.on_request(cors=CORS_OPTS)
def health(req: https_fn.Request) -> https_fn.Response:
    """Health check para monitoreo."""
    return https_fn.Response(
        json.dumps({"status": "ok", "service": "paddle-ocr"}),
        status=200,
        mimetype="application/json"
    )
