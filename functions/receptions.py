"""Trusted, idempotent reception commands.

Reception writes are intentionally kept behind callable functions.  The
callables use an operation document as a transaction receipt, deterministic
entity ids, and an optional optimistic version precondition.  Admin SDK writes
bypass Firestore rules, so every authorization and ownership check is repeated
here.
"""

from hashlib import sha256
import json
import os
from datetime import date, datetime, time, timezone

from firebase_functions import https_fn
from firebase_functions.options import CorsOptions
from firebase_admin import firestore

from rbac import (
    ORG_ID, _actor, _canonical_warehouse_id, _error, _validate_operation_id,
    _warehouse_allowed,
)

# CORS configuration for production domain
ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"
_EMULATOR_ORIGINS = {
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
}
_FUNCTIONS_EMULATOR = os.environ.get("FUNCTIONS_EMULATOR", "").lower() in {
    "1",
    "true",
}
CORS_OPTS = CorsOptions(
    cors_origins=[ALLOWED_ORIGIN, *_EMULATOR_ORIGINS]
    if _FUNCTIONS_EMULATOR
    else [ALLOWED_ORIGIN],
)


MAX_LINES = 500
MAX_PLANNED_PALLETS = 999
MAX_EVIDENCE_URL = 4096


def _data(req):
    return req.data if isinstance(req.data, dict) else {}


def _string(value, name, max_len=256, required=True):
    if value is None and not required:
        return None
    if not isinstance(value, str) or (required and not value) or len(value) > max_len:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid")
    return value


def _version(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise https_fn.HttpsError("invalid-argument", "expectedVersion is invalid")
    return value


def _normalize_planned_pallets(reception_id, lines, planned_pallets):
    if not isinstance(planned_pallets, list) or not planned_pallets or len(planned_pallets) > MAX_PLANNED_PALLETS:
        raise https_fn.HttpsError("invalid-argument", "plannedPallets is invalid")

    allocated_by_line = [0] * len(lines)
    normalized = []
    for index, pallet in enumerate(planned_pallets):
        if not isinstance(pallet, dict):
            raise https_fn.HttpsError("invalid-argument", "Invalid planned pallet")
        pallet_number = pallet.get("palletNumber")
        line_index = pallet.get("lineIndex")
        quantity = pallet.get("quantity")
        if isinstance(pallet_number, bool) or not isinstance(pallet_number, int) or pallet_number != index + 1:
            raise https_fn.HttpsError("invalid-argument", "planned pallet numbers must be sequential")
        if isinstance(line_index, bool) or not isinstance(line_index, int) or not 0 <= line_index < len(lines):
            raise https_fn.HttpsError("invalid-argument", "planned pallet lineIndex is invalid")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1 or quantity > 100000:
            raise https_fn.HttpsError("invalid-argument", "planned pallet quantity is invalid")

        product_id = _string(pallet.get("productId"), "planned productId", 128)
        product_name = _string(pallet.get("productName"), "planned productName", 256)
        unit = _string(pallet.get("unit", "cajas"), "planned unit", 32)
        line = lines[line_index]
        if product_id != line["productId"] or unit != line["unit"]:
            raise https_fn.HttpsError("invalid-argument", "planned pallet does not match its reception line")

        qr_identifier = f"TQR-{reception_id}-{pallet_number:03d}"
        normalized.append({
            "palletId": f"pallet-{reception_id}-{pallet_number:03d}",
            "receptionId": reception_id,
            "palletNumber": pallet_number,
            "lineIndex": line_index,
            "productId": product_id,
            "productName": product_name,
            "quantity": quantity,
            "unit": unit,
            "qrIdentifier": qr_identifier,
            "status": "PLANNED",
            "activated": False,
        })
        allocated_by_line[line_index] += quantity

    if any(allocated_by_line[index] != line["quantity"] for index, line in enumerate(lines)):
        raise https_fn.HttpsError("invalid-argument", "planned pallet quantities must match reception lines")
    return normalized


def _digest(payload):
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return sha256(encoded.encode("utf-8")).hexdigest()


def _refs(db, operation_id):
    # Firestore collection paths must have an odd number of segments. The
    # organization root is a document reference, not collection("organizations/{id}").
    root = db.collection("organizations").document(ORG_ID)
    return root.collection("reception_operations").document(operation_id), root


def _check_actor(req, db, warehouse_id):
    actor = _actor(req, db)
    if actor.get("role") not in {
        "OPERATOR", "SUPERVISOR", "ADMIN", "AUXILIAR_ALMACENISTA",
        "GERENTE_ALMACEN", "SUPER_ADMIN",
    }:
        raise https_fn.HttpsError("permission-denied", "Reception write denied")
    if not _warehouse_allowed(actor, warehouse_id):
        raise https_fn.HttpsError("permission-denied", "Warehouse access denied")
    return actor


def _operation_result(snapshot, kind, digest):
    previous = snapshot.to_dict() or {}
    if previous.get("kind") != kind or previous.get("payloadDigest") != digest:
        raise _error("operationId collision")
    return previous.get("result", {})


def _transaction_snapshot(transaction, reference):
    """Read one document across supported Firestore transaction APIs."""
    result = transaction.get(reference)
    if hasattr(result, "exists"):
        return result
    return next(iter(result), None)


def _planned_pallet(reception, qr):
    planned = reception.get("plannedPallets")
    if not isinstance(planned, list):
        raise https_fn.HttpsError("failed-precondition", "Reception has no canonical pallet plan")
    return next((item for item in planned if item.get("qrIdentifier") == qr), None)


def _validate_planned_scan(reception, qr):
    if reception.get("status") not in {"DRAFT", "IN_PROGRESS"}:
        raise _error("Reception is not writable")
    planned = _planned_pallet(reception, qr)
    if planned is None:
        raise https_fn.HttpsError("invalid-argument", "QR is not in this reception plan")
    if planned.get("status") not in {"PLANNED", "IN_CAPTURE"} or planned.get("activated"):
        raise _error("QR is already active or consumed")
    return planned


def _validate_capture_ready(planned, lot, expiry_date):
    saved_lot = _string(planned.get("lot"), "lot", 128)
    saved_expiry = _iso_expiry(planned.get("expiryDate"), required=True)
    if lot != saved_lot or expiry_date != saved_expiry:
        raise https_fn.HttpsError("failed-precondition", "Capture checkpoint is missing or changed")
    return saved_lot, saved_expiry


def _iso_expiry(value, required=False):
    if value is None and not required:
        return None
    if not isinstance(value, str) or len(value) != 10:
        raise https_fn.HttpsError("invalid-argument", "expiryDate must use YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise https_fn.HttpsError("invalid-argument", "expiryDate is invalid") from exc
    return value


def _expiry_timestamp(value):
    return datetime.combine(date.fromisoformat(value), time.min, tzinfo=timezone.utc)


@https_fn.on_call(cors=CORS_OPTS)
def validate_reception_pallet_scan(req: https_fn.CallableRequest):
    """Read-only server validation; recognizing a planned code never activates it."""
    data = _data(req)
    reception_id = _string(data.get("receptionId"), "receptionId", 160)
    qr = _string(data.get("qrIdentifier"), "qrIdentifier", 256)
    warehouse_id = _canonical_warehouse_id(_string(data.get("warehouseId"), "warehouseId", 128))
    db = firestore.client()
    _check_actor(req, db, warehouse_id)
    root = db.collection("organizations").document(ORG_ID)
    snapshot = root.collection("receptions").document(reception_id).get()
    if not snapshot.exists:
        raise https_fn.HttpsError("not-found", "Reception not found")
    reception = snapshot.to_dict() or {}
    if reception.get("organizationId") != ORG_ID or reception.get("warehouseId") != warehouse_id:
        raise https_fn.HttpsError("permission-denied", "Reception warehouse mismatch")
    planned = _validate_planned_scan(reception, qr)
    return {
        "receptionId": reception_id,
        "palletId": planned.get("palletId"),
        "qrIdentifier": qr,
        "status": planned.get("status"),
        "lot": planned.get("lot"),
        "expiryDate": planned.get("expiryDate"),
        "activated": False,
    }


@https_fn.on_call(cors=CORS_OPTS)
def save_reception_pallet_capture(req: https_fn.CallableRequest):
    """Persist resumable capture data without registering inventory."""
    data = _data(req)
    operation_id = _validate_operation_id(data.get("operationId"))
    reception_id = _string(data.get("receptionId"), "receptionId", 160)
    qr = _string(data.get("qrIdentifier"), "qrIdentifier", 256)
    lot = _string(data.get("lot"), "lot", 128, False)
    expiry_date = _iso_expiry(data.get("expiryDate"))
    db = firestore.client()
    root = db.collection("organizations").document(ORG_ID)
    reception_ref = root.collection("receptions").document(reception_id)
    operation_ref, _ = _refs(db, operation_id)
    payload = {"receptionId": reception_id, "qrIdentifier": qr, "lot": lot, "expiryDate": expiry_date}
    digest = _digest(payload)

    @firestore.transactional
    def txn(transaction):
        previous = _transaction_snapshot(transaction, operation_ref)
        if previous is not None and previous.exists:
            return _operation_result(previous, "save_reception_pallet_capture", digest)
        reception_snapshot = _transaction_snapshot(transaction, reception_ref)
        if reception_snapshot is None or not reception_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Reception not found")
        reception = reception_snapshot.to_dict() or {}
        warehouse_id = reception.get("warehouseId")
        actor = _check_actor(req, db, warehouse_id)
        if reception.get("organizationId") != ORG_ID or reception.get("status") not in {"DRAFT", "IN_PROGRESS"}:
            raise _error("Reception is not writable")
        planned = _planned_pallet(reception, qr)
        if planned is None:
            raise https_fn.HttpsError("invalid-argument", "QR is not in this reception plan")
        if planned.get("status") not in {"PLANNED", "IN_CAPTURE"}:
            raise _error("QR is already active or consumed")
        next_planned = []
        for item in reception.get("plannedPallets", []):
            if item.get("qrIdentifier") == qr:
                next_planned.append({**item, "status": "IN_CAPTURE", "activated": False,
                    "lot": lot, "expiryDate": expiry_date})
            else:
                next_planned.append(item)
        version = reception.get("version", 0)
        now = firestore.SERVER_TIMESTAMP
        transaction.update(reception_ref, {"plannedPallets": next_planned,
            "status": "IN_PROGRESS", "version": version + 1, "updatedAt": now})
        audit_ref = root.collection("audit_events").document()
        transaction.set(audit_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "entityType": "reception_pallet", "entityId": planned.get("palletId", qr),
            "action": "CAPTURE_CHECKPOINT", "actorUserId": actor["userId"],
            "operationId": operation_id, "occurredAt": now, "schemaVersion": 1})
        result = {"receptionId": reception_id, "palletId": planned.get("palletId"),
            "qrIdentifier": qr, "status": "IN_CAPTURE", "idempotent": False}
        transaction.set(operation_ref, {"kind": "save_reception_pallet_capture",
            "payloadDigest": digest, "result": result, "actorUserId": actor["userId"],
            "createdAt": now})
        return result

    return txn(db.transaction())


@https_fn.on_call(cors=CORS_OPTS)
def create_reception(req: https_fn.CallableRequest):
    data = _data(req)
    operation_id = _validate_operation_id(data.get("operationId"))
    warehouse_id = _canonical_warehouse_id(_string(data.get("warehouseId"), "warehouseId", 128))
    lines = data.get("lines")
    if not isinstance(lines, list) or not lines or len(lines) > MAX_LINES:
        raise https_fn.HttpsError("invalid-argument", "lines is invalid")
    actor = _check_actor(req, firestore.client(), warehouse_id)
    db = firestore.client()
    normalized_lines = []
    for index, line in enumerate(lines):
        if not isinstance(line, dict):
            raise https_fn.HttpsError("invalid-argument", "Invalid reception line")
        product_id = _string(line.get("productId"), "productId", 128)
        quantity = line.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1 or quantity > 100000:
            raise https_fn.HttpsError("invalid-argument", "Invalid reception quantity")
        normalized_lines.append({
            "index": index, "productId": product_id, "quantity": quantity,
            "unit": _string(line.get("unit", "cajas"), "unit", 32),
            "lot": _string(line.get("lot"), "lot", 128, False),
        })
    operation_ref, root = _refs(db, operation_id)
    reception_id = f"reception-{operation_id}"
    scheduled_date = _string(data.get("scheduledDate"), "scheduledDate", 32, False)
    evidence_date = datetime.now(timezone.utc).date().strftime("%Y%m%d")
    if scheduled_date:
        iso_parts = scheduled_date.split("-")
        localized_parts = scheduled_date.split("/")
        if len(iso_parts) == 3 and len(iso_parts[0]) == 4:
            evidence_date = "".join(iso_parts)
        elif len(localized_parts) == 3 and len(localized_parts[2]) == 4:
            evidence_date = localized_parts[2] + localized_parts[1].zfill(2) + localized_parts[0].zfill(2)
    evidence_id = f"EV-{evidence_date}-{sha256(reception_id.encode('utf-8')).hexdigest()[:6].upper()}"
    raw_plan = data.get("plannedPallets")
    planned_pallets = (
        _normalize_planned_pallets(reception_id, normalized_lines, raw_plan)
        if raw_plan is not None
        else None
    )
    payload = {
        "warehouseId": warehouse_id,
        "lines": normalized_lines,
        "supplierId": _string(data.get("supplierId"), "supplierId", 128, False),
        "purchaseOrderId": _string(data.get("purchaseOrderId"), "purchaseOrderId", 128, False),
        "purchaseOrderNumber": _string(data.get("purchaseOrderNumber"), "purchaseOrderNumber", 128, False),
        "folio": _string(data.get("folio"), "folio", 128, False) or reception_id,
        "scheduledDate": scheduled_date,
        "evidenceId": evidence_id,
        "supplierCode": _string(data.get("supplierCode"), "supplierCode", 64, False),
        "supplierName": _string(data.get("supplierName"), "supplierName", 256, False),
        "logisticsProvider": _string(data.get("logisticsProvider"), "logisticsProvider", 256, False),
        "productName": ", ".join(dict.fromkeys(pallet["productName"] for pallet in planned_pallets or [])),
        "plannedPallets": planned_pallets,
    }
    digest = _digest(payload)
    reception_ref = root.collection("receptions").document(reception_id)

    @firestore.transactional
    def txn(transaction):
        previous = _transaction_snapshot(transaction, operation_ref)
        if previous is not None and previous.exists:
            return _operation_result(previous, "create_reception", digest)
        existing = _transaction_snapshot(transaction, reception_ref)
        if existing is not None and existing.exists:
            current = existing.to_dict() or {}
            if current.get("operationId") != operation_id:
                raise _error("reception id collision")
            result = {
                "receptionId": reception_id,
                "folio": current.get("folio", payload["folio"]),
                "scheduledDate": current.get("scheduledDate"),
                "evidenceId": current.get("evidenceId", evidence_id),
                "purchaseOrderId": current.get("purchaseOrderId"),
                "purchaseOrderNumber": current.get("purchaseOrderNumber"),
                "supplierCode": current.get("supplierCode"),
                "supplierName": current.get("supplierName"),
                "logisticsProvider": current.get("logisticsProvider"),
                "productName": current.get("productName"),
                "palletCount": current.get("palletCount", len(current.get("plannedPallets", []))),
                "plannedPallets": current.get("plannedPallets", []),
                "idempotent": True,
            }
            transaction.set(operation_ref, {"kind": "create_reception", "payloadDigest": digest,
                "result": result, "actorUserId": actor["userId"], "createdAt": firestore.SERVER_TIMESTAMP})
            return result
        now = firestore.SERVER_TIMESTAMP
        transaction.set(reception_ref, {
            "id": reception_id, "organizationId": ORG_ID, "warehouseId": warehouse_id,
            "status": "DRAFT", "operationId": operation_id, "actorUserId": actor["userId"],
            "supplierId": payload["supplierId"], "purchaseOrderId": payload["purchaseOrderId"],
            "purchaseOrderNumber": payload["purchaseOrderNumber"],
            "folio": payload["folio"], "scheduledDate": payload["scheduledDate"],
            "evidenceId": evidence_id,
            "supplierCode": payload["supplierCode"],
            "supplierName": payload["supplierName"],
            "logisticsProvider": payload["logisticsProvider"],
            "productName": payload["productName"],
            "palletCount": len(planned_pallets or []),
            **({"plannedPallets": planned_pallets} if planned_pallets is not None else {}),
            "version": 0, "createdAt": now, "updatedAt": now,
        })
        for line in normalized_lines:
            line_id = f"line-{operation_id}-{line['index']}"
            transaction.set(
                root.collection("receptions").document(reception_id).collection("lines").document(line_id),
                {
                "id": line_id, "organizationId": ORG_ID, "receptionId": reception_id,
                "productId": line["productId"], "quantity": line["quantity"],
                "unit": line["unit"], "lot": line["lot"], "palletsCreated": 0,
                "createdAt": now, "updatedAt": now,
                },
            )
        audit_ref = root.collection("audit_events").document()
        transaction.set(audit_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "entityType": "reception", "entityId": reception_id, "action": "CREATE",
            "actorUserId": actor["userId"], "operationId": operation_id,
            "occurredAt": now, "schemaVersion": 1})
        result = {
            "receptionId": reception_id,
            "folio": payload["folio"],
            "scheduledDate": payload["scheduledDate"],
            "evidenceId": evidence_id,
            "purchaseOrderId": payload["purchaseOrderId"],
            "purchaseOrderNumber": payload["purchaseOrderNumber"],
            "supplierCode": payload["supplierCode"],
            "supplierName": payload["supplierName"],
            "logisticsProvider": payload["logisticsProvider"],
            "productName": payload["productName"],
            "palletCount": len(planned_pallets or []),
            "plannedPallets": planned_pallets or [],
            "idempotent": False,
        }
        transaction.set(operation_ref, {"kind": "create_reception", "payloadDigest": digest,
            "result": result, "actorUserId": actor["userId"], "createdAt": now})
        return result

    return txn(db.transaction())


@https_fn.on_call(cors=CORS_OPTS)
def register_reception_pallet(req: https_fn.CallableRequest):
    data = _data(req)
    operation_id = _validate_operation_id(data.get("operationId"))
    reception_id = _string(data.get("receptionId"), "receptionId", 160)
    warehouse_id = _canonical_warehouse_id(_string(data.get("warehouseId"), "warehouseId", 128))
    product_id = _string(data.get("productId"), "productId", 128)
    qr = _string(data.get("qrIdentifier"), "qrIdentifier", 256)
    quantity = data.get("quantity")
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1 or quantity > 100000:
        raise https_fn.HttpsError("invalid-argument", "Invalid pallet quantity")
    db = firestore.client()
    actor = _check_actor(req, db, warehouse_id)
    payload = {"receptionId": reception_id, "warehouseId": warehouse_id,
               "productId": product_id, "qrIdentifier": qr, "quantity": quantity,
               "lot": data.get("lot"), "expiryDate": data.get("expiryDate")}
    digest = _digest(payload)
    operation_ref, root = _refs(db, operation_id)
    reception_ref = root.collection("receptions").document(reception_id)
    qr_suffix = qr.rsplit("-", 1)[-1]
    pallet_number = int(qr_suffix) if qr_suffix.isdigit() else None
    fallback_pallet_id = f"pallet-{reception_id}-{pallet_number:03d}" if pallet_number else f"pallet-{operation_id}"
    pallet_ref = reception_ref.collection("pallets").document(fallback_pallet_id)
    movement_id = f"movement-{reception_id}-{pallet_number:03d}" if pallet_number else f"movement-{operation_id}"
    movement_ref = root.collection("inventory_movements").document(movement_id)

    @firestore.transactional
    def txn(transaction):
        previous = _transaction_snapshot(transaction, operation_ref)
        if previous is not None and previous.exists:
            return _operation_result(previous, "register_reception_pallet", digest)
        reception_snapshot = _transaction_snapshot(transaction, reception_ref)
        if reception_snapshot is None or not reception_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Reception not found")
        reception = reception_snapshot.to_dict() or {}
        if reception.get("organizationId") != ORG_ID or reception.get("warehouseId") != warehouse_id:
            raise https_fn.HttpsError("permission-denied", "Reception warehouse mismatch")
        if reception.get("status") not in {"DRAFT", "IN_PROGRESS"}:
            raise _error("Reception is not writable")
        pallet_id = fallback_pallet_id
        planned_pallets = reception.get("plannedPallets")
        if not isinstance(planned_pallets, list):
            raise https_fn.HttpsError("failed-precondition", "Reception has no canonical pallet plan")
        planned_pallet = None
        if planned_pallets is not None:
            planned_pallet = next(
                (item for item in planned_pallets if item.get("qrIdentifier") == qr),
                None,
            )
            if planned_pallet is None:
                raise https_fn.HttpsError("invalid-argument", "QR is not in the reception pallet plan")
            if (
                planned_pallet.get("productId") != product_id
                or planned_pallet.get("quantity") != quantity
                or planned_pallet.get("unit") != _string(data.get("unit", "cajas"), "unit", 32)
            ):
                raise https_fn.HttpsError("invalid-argument", "Pallet does not match the reception plan")
            pallet_id = planned_pallet.get("palletId") or pallet_id
            pallet_ref = reception_ref.collection("pallets").document(pallet_id)
            if planned_pallet.get("receptionId", reception_id) != reception_id:
                raise https_fn.HttpsError("invalid-argument", "Planned pallet belongs to another reception")
            if planned_pallet.get("status") in {"ACTIVE", "RECEIVED"} or planned_pallet.get("activated"):
                existing_pallet = _transaction_snapshot(transaction, pallet_ref)
                existing_movement = _transaction_snapshot(transaction, movement_ref)
                if existing_pallet is not None and existing_pallet.exists and existing_movement is not None and existing_movement.exists:
                    result = {"palletId": pallet_id, "movementId": movement_ref.id, "idempotent": True}
                    transaction.set(operation_ref, {"kind": "register_reception_pallet", "payloadDigest": digest,
                        "result": result, "actorUserId": actor["userId"], "createdAt": firestore.SERVER_TIMESTAMP})
                    return result
                raise _error("QR activation is incomplete")
            if planned_pallet.get("status") not in {"IN_CAPTURE", "PLANNED"}:
                raise _error("QR cannot be activated from its current state")
            lot, expiry_date = _validate_capture_ready(
                planned_pallet,
                data.get("lot"),
                data.get("expiryDate"),
            )
            expiry_value = _expiry_timestamp(expiry_date)
        else:
            raise https_fn.HttpsError("failed-precondition", "Reception has no canonical pallet plan")
        expected = _version(data.get("expectedVersion"))
        current_version = reception.get("version", 0)
        if expected is not None and current_version != expected:
            raise _error("Reception version precondition failed")
        pallet_snapshot = _transaction_snapshot(transaction, pallet_ref)
        if pallet_snapshot is not None and pallet_snapshot.exists:
            raise _error("pallet id collision")
        now = firestore.SERVER_TIMESTAMP
        # Firestore transforms cannot appear inside array elements. Keep the
        # server transform on direct document fields and materialize the
        # activation instant before replacing the planned-pallet array.
        activated_at = datetime.now(timezone.utc)
        transaction.set(pallet_ref, {"id": pallet_id, "organizationId": ORG_ID,
            "warehouseId": warehouse_id, "receptionId": reception_id, "qrIdentifier": qr,
            "palletNumber": planned_pallet.get("palletNumber"),
            "status": "RECEIVED", "productId": product_id, "quantity": quantity,
            "unit": _string(data.get("unit", "cajas"), "unit", 32),
            "lot": lot, "expiryDate": expiry_value, "createdAt": now, "updatedAt": now})
        transaction.set(movement_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "palletId": pallet_id, "productId": product_id, "movementType": "RECEIPT",
            "direction": "IN", "quantity": quantity, "unit": _string(data.get("unit", "cajas"), "unit", 32),
            "lot": lot, "expiryDate": expiry_value, "operationId": operation_id,
            "actorUserId": actor["userId"], "occurredAt": now})
        reception_update = {
            "version": current_version + 1,
            "status": "IN_PROGRESS" if reception.get("status") == "DRAFT" else reception.get("status"),
            "updatedAt": now,
        }
        if planned_pallet is not None:
            reception_update["plannedPallets"] = [
                {**item, "status": "ACTIVE", "activated": True, "palletId": pallet_id,
                 "activatedAt": activated_at} if item.get("qrIdentifier") == qr else item
                for item in planned_pallets
            ]
        transaction.update(reception_ref, reception_update)
        audit_ref = root.collection("audit_events").document()
        transaction.set(audit_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "entityType": "pallet", "entityId": pallet_id, "action": "CREATE",
            "actorUserId": actor["userId"], "operationId": operation_id,
            "occurredAt": now, "schemaVersion": 1})
        result = {"palletId": pallet_id, "movementId": movement_ref.id, "idempotent": False}
        transaction.set(operation_ref, {"kind": "register_reception_pallet", "payloadDigest": digest,
            "result": result, "actorUserId": actor["userId"], "createdAt": now})
        return result

    return txn(db.transaction())


def _update_reception(req, action):
    data = _data(req)
    operation_id = _validate_operation_id(data.get("operationId"))
    reception_id = _string(data.get("receptionId"), "receptionId", 160)
    db = firestore.client()
    root = db.collection("organizations").document(ORG_ID)
    reception_ref = root.collection("receptions").document(reception_id)
    operation_ref = root.collection("reception_operations").document(operation_id)
    evidence = data.get("evidencePhotos")
    if action == "evidence":
        if not isinstance(evidence, dict) or any(not isinstance(v, str) or len(v) > MAX_EVIDENCE_URL for v in evidence.values() if v is not None):
            raise https_fn.HttpsError("invalid-argument", "evidencePhotos is invalid")
        payload = {"receptionId": reception_id, "evidencePhotos": evidence}
    else:
        payload = {"receptionId": reception_id, "action": action}
    digest = _digest(payload)

    @firestore.transactional
    def txn(transaction):
        snapshot = _transaction_snapshot(transaction, reception_ref)
        if snapshot is None or not snapshot.exists:
            raise https_fn.HttpsError("not-found", "Reception not found")
        reception = snapshot.to_dict() or {}
        warehouse_id = reception.get("warehouseId")
        actor = _check_actor(req, db, warehouse_id)
        previous = _transaction_snapshot(transaction, operation_ref)
        if previous is not None and previous.exists:
            return _operation_result(previous, action, digest)
        expected = _version(data.get("expectedVersion"))
        current_version = reception.get("version", 0)
        if expected is not None and current_version != expected:
            raise _error("Reception version precondition failed")
        updates = {"version": current_version + 1, "updatedAt": firestore.SERVER_TIMESTAMP}
        if action == "confirm":
            if reception.get("status") != "IN_PROGRESS":
                raise _error("Only IN_PROGRESS receptions can be confirmed")
            planned = reception.get("plannedPallets")
            if isinstance(planned, list) and any(
                pallet.get("status") not in {"ACTIVE", "RECEIVED"} for pallet in planned
            ):
                raise _error("Every planned pallet must be activated before confirming reception")
            updates.update({"status": "CONFIRMED", "receivedAt": firestore.SERVER_TIMESTAMP})
        elif action == "evidence":
            updates["evidencePhotos"] = evidence
        else:
            raise https_fn.HttpsError("invalid-argument", "Unknown reception action")
        transaction.update(reception_ref, updates)
        audit_ref = root.collection("audit_events").document()
        transaction.set(audit_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "entityType": "reception", "entityId": reception_id, "action": action.upper(),
            "actorUserId": actor["userId"], "operationId": operation_id,
            "occurredAt": firestore.SERVER_TIMESTAMP, "schemaVersion": 1})
        result = {"receptionId": reception_id, "version": current_version + 1, "idempotent": False}
        transaction.set(operation_ref, {"kind": action, "payloadDigest": digest, "result": result,
            "actorUserId": actor["userId"], "createdAt": firestore.SERVER_TIMESTAMP})
        return result

    return txn(db.transaction())


@https_fn.on_call(cors=CORS_OPTS)
def save_evidence(req: https_fn.CallableRequest):
    return _update_reception(req, "evidence")


@https_fn.on_call(cors=CORS_OPTS)
def confirm_reception(req: https_fn.CallableRequest):
    return _update_reception(req, "confirm")
