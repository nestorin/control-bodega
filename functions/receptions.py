"""Trusted, idempotent reception commands.

Reception writes are intentionally kept behind callable functions.  The
callables use an operation document as a transaction receipt, deterministic
entity ids, and an optional optimistic version precondition.  Admin SDK writes
bypass Firestore rules, so every authorization and ownership check is repeated
here.
"""

from hashlib import sha256
import json

from firebase_functions import https_fn
from firebase_functions.options import CorsOptions
from firebase_admin import firestore

from rbac import (
    ORG_ID, _actor, _canonical_warehouse_id, _error, _validate_operation_id,
    _warehouse_allowed,
)

# CORS configuration for production domain
ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"
CORS_OPTS = CorsOptions(cors_origins=[ALLOWED_ORIGIN])


MAX_LINES = 500
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
    payload = {"warehouseId": warehouse_id, "lines": normalized_lines,
               "supplierId": _string(data.get("supplierId"), "supplierId", 128, False),
               "purchaseOrderId": _string(data.get("purchaseOrderId"), "purchaseOrderId", 128, False)}
    digest = _digest(payload)
    operation_ref, root = _refs(db, operation_id)
    reception_id = f"reception-{operation_id}"
    reception_ref = root.collection("receptions").document(reception_id)

    @firestore.transactional
    def txn(transaction):
        previous = transaction.get(operation_ref)
        if previous.exists:
            return _operation_result(previous, "create_reception", digest)
        existing = transaction.get(reception_ref)
        if existing.exists:
            current = existing.to_dict() or {}
            if current.get("operationId") != operation_id:
                raise _error("reception id collision")
            result = {"receptionId": reception_id, "idempotent": True}
            transaction.set(operation_ref, {"kind": "create_reception", "payloadDigest": digest,
                "result": result, "actorUserId": actor["userId"], "createdAt": firestore.SERVER_TIMESTAMP})
            return result
        now = firestore.SERVER_TIMESTAMP
        transaction.set(reception_ref, {
            "id": reception_id, "organizationId": ORG_ID, "warehouseId": warehouse_id,
            "status": "DRAFT", "operationId": operation_id, "actorUserId": actor["userId"],
            "supplierId": payload["supplierId"], "purchaseOrderId": payload["purchaseOrderId"],
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
        result = {"receptionId": reception_id, "idempotent": False}
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
               "productId": product_id, "qrIdentifier": qr, "quantity": quantity}
    digest = _digest(payload)
    operation_ref, root = _refs(db, operation_id)
    reception_ref = root.collection("receptions").document(reception_id)
    pallet_id = f"pallet-{operation_id}"
    pallet_ref = reception_ref.collection("pallets").document(pallet_id)
    movement_ref = root.collection("inventory_movements").document(f"movement-{operation_id}")

    @firestore.transactional
    def txn(transaction):
        previous = transaction.get(operation_ref)
        if previous.exists:
            return _operation_result(previous, "register_reception_pallet", digest)
        reception_snapshot = transaction.get(reception_ref)
        if not reception_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Reception not found")
        reception = reception_snapshot.to_dict() or {}
        if reception.get("organizationId") != ORG_ID or reception.get("warehouseId") != warehouse_id:
            raise https_fn.HttpsError("permission-denied", "Reception warehouse mismatch")
        if reception.get("status") not in {"DRAFT", "IN_PROGRESS"}:
            raise _error("Reception is not writable")
        expected = _version(data.get("expectedVersion"))
        current_version = reception.get("version", 0)
        if expected is not None and current_version != expected:
            raise _error("Reception version precondition failed")
        if transaction.get(pallet_ref).exists:
            raise _error("pallet id collision")
        now = firestore.SERVER_TIMESTAMP
        transaction.set(pallet_ref, {"id": pallet_id, "organizationId": ORG_ID,
            "warehouseId": warehouse_id, "receptionId": reception_id, "qrIdentifier": qr,
            "status": "CREATED", "productId": product_id, "quantity": quantity,
            "unit": _string(data.get("unit", "cajas"), "unit", 32),
            "lot": _string(data.get("lot"), "lot", 128, False), "createdAt": now, "updatedAt": now})
        transaction.set(movement_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "palletId": pallet_id, "productId": product_id, "movementType": "RECEIPT",
            "direction": "IN", "quantity": quantity, "unit": "cajas", "operationId": operation_id,
            "actorUserId": actor["userId"], "occurredAt": now})
        transaction.update(reception_ref, {
            "version": current_version + 1,
            "status": "IN_PROGRESS" if reception.get("status") == "DRAFT" else reception.get("status"),
            "updatedAt": now,
        })
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
        snapshot = transaction.get(reception_ref)
        if not snapshot.exists:
            raise https_fn.HttpsError("not-found", "Reception not found")
        reception = snapshot.to_dict() or {}
        warehouse_id = reception.get("warehouseId")
        actor = _check_actor(req, db, warehouse_id)
        previous = transaction.get(operation_ref)
        if previous.exists:
            return _operation_result(previous, action, digest)
        expected = _version(data.get("expectedVersion"))
        current_version = reception.get("version", 0)
        if expected is not None and current_version != expected:
            raise _error("Reception version precondition failed")
        updates = {"version": current_version + 1, "updatedAt": firestore.SERVER_TIMESTAMP}
        if action == "confirm":
            if reception.get("status") != "IN_PROGRESS":
                raise _error("Only IN_PROGRESS receptions can be confirmed")
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
