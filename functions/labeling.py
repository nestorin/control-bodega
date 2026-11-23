"""Server-authoritative labeling batch commands for the pilot warehouse.

The Admin SDK bypasses Firestore rules, so authorization, pilot scope, payload
validation, idempotency, and audit persistence are enforced before and inside
the transaction.
"""

from datetime import date
from hashlib import sha256
import json
import uuid

from firebase_functions import https_fn
from firebase_admin import firestore

from firestore_transactions import read_document, read_documents
from http_cors import CORS_OPTS
from rbac import ORG_ID, _actor, _canonical_warehouse_id, _error, _warehouse_allowed

PILOT_WAREHOUSE_ID = "piloto-1"
CREATE_BATCH_KIND = "labeling_create_batch"
MAX_BATCH_LINES = 497  # batch, audit, and idempotency receipt share Firestore's 500-write limit.
CREATE_BATCH_ROLES = {"SUPERVISOR", "ADMIN", "GERENTE_ALMACEN", "SUPER_ADMIN"}


def _data(req):
    return req.data if isinstance(req.data, dict) else {}


def _string(value, name, max_len=256):
    if not isinstance(value, str) or not value.strip() or len(value) > max_len:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid")
    return value.strip()


def _positive_int(value, name, maximum=100000):
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= maximum:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid")
    return value


def _uuid(value, name):
    if not isinstance(value, str) or len(value) > 64:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid")
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid") from exc
    if str(parsed) != value.lower():
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid")
    return value.lower()


def _idempotency_key(value):
    return _uuid(value, "idempotencyKey")


def _request_id(value):
    return _uuid(value, "requestId")


def _document_id(value, name):
    value = _string(value, name, 128)
    if "/" in value:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid")
    return value


def _version(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise https_fn.HttpsError("invalid-argument", "expectedVersion is invalid")
    return value


def _digest(payload):
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return sha256(encoded.encode("utf-8")).hexdigest()


def _iso_date(value, name):
    value = _string(value, name, 10)
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise https_fn.HttpsError("invalid-argument", f"{name} is invalid") from exc
    return value


def _line(line):
    if not isinstance(line, dict):
        raise https_fn.HttpsError("invalid-argument", "line is invalid")

    tracking_key = _string(line.get("trackingKey"), "trackingKey", 512)
    product_id = _string(line.get("productId"), "productId", 128)
    lot_key = _string(line.get("lotKey"), "lotKey", 128)
    expiry_key = _string(line.get("expiryKey"), "expiryKey", 32)
    if tracking_key != f"{product_id}|{lot_key}|{expiry_key}":
        raise https_fn.HttpsError("invalid-argument", "trackingKey does not match line components")

    product_snapshot = line.get("productSnapshot")
    if not isinstance(product_snapshot, dict):
        raise https_fn.HttpsError("invalid-argument", "productSnapshot is invalid")
    snapshot = {
        "id": _string(product_snapshot.get("id"), "productSnapshot.id", 128),
        "sku": _string(product_snapshot.get("sku"), "productSnapshot.sku", 128),
        "name": _string(product_snapshot.get("name"), "productSnapshot.name", 256),
    }
    if snapshot["id"] != product_id:
        raise https_fn.HttpsError("invalid-argument", "productSnapshot.id does not match productId")

    return {
        "trackingKey": tracking_key,
        "productId": product_id,
        "productSnapshot": snapshot,
        "lotKey": lot_key,
        "lotSnapshot": _string(line.get("lotSnapshot"), "lotSnapshot", 128),
        "expiryKey": expiry_key,
        "expiryDate": _iso_date(line.get("expiryDate"), "expiryDate"),
        "estimatedBoxes": _positive_int(line.get("estimatedBoxes"), "estimatedBoxes"),
        "estimatedPallets": _positive_int(line.get("estimatedPallets"), "estimatedPallets", 10000),
        "assignedBoxes": 0,
        "returnedBoxes": 0,
        "approvedLossBoxes": 0,
        "outputBoxes": 0,
        "pendingBoxes": 0,
    }


def _create_payload(data):
    warehouse_id = _canonical_warehouse_id(_string(data.get("warehouseId"), "warehouseId", 128))
    idempotency_key = _idempotency_key(data.get("idempotencyKey"))
    lines = data.get("lines")
    if not isinstance(lines, list) or not lines or len(lines) > MAX_BATCH_LINES:
        raise https_fn.HttpsError("invalid-argument", "lines is invalid")
    normalized_lines = [_line(line) for line in lines]
    if len({line["trackingKey"] for line in normalized_lines}) != len(normalized_lines):
        raise https_fn.HttpsError("invalid-argument", "trackingKey must be unique within a batch")

    return {
        "warehouseId": warehouse_id,
        "idempotencyKey": idempotency_key,
        "labelingCompanyId": _string(data.get("labelingCompanyId"), "labelingCompanyId", 128),
        "labelingCompanyName": _string(data.get("labelingCompanyName"), "labelingCompanyName", 256),
        "receiverName": _string(data.get("receiverName"), "receiverName", 256),
        "deliveredByName": _string(data.get("deliveredByName"), "deliveredByName", 256),
        "lines": normalized_lines,
    }


def _check_actor(req, db, warehouse_id=None):
    actor = _actor(req, db)
    if actor.get("role") not in CREATE_BATCH_ROLES:
        raise https_fn.HttpsError("permission-denied", "Labeling batch creation denied")
    if warehouse_id is not None and (
        warehouse_id != PILOT_WAREHOUSE_ID or not _warehouse_allowed(actor, warehouse_id)
    ):
        raise https_fn.HttpsError("permission-denied", "Warehouse access denied")
    return actor


def _operation_result_for(snapshot, kind, digest):
    previous = snapshot.to_dict() or {}
    if previous.get("kind") != kind or previous.get("payloadDigest") != digest:
        raise https_fn.HttpsError("already-exists", "IDEMPOTENCY_KEY_REUSED")
    result = previous.get("result")
    if not isinstance(result, dict):
        raise _error("Idempotency record is invalid")
    return result


def _operation_result(snapshot, digest):
    return _operation_result_for(snapshot, CREATE_BATCH_KIND, digest)


@https_fn.on_call(cors=CORS_OPTS, enforce_app_check=True)
def createBatch(req: https_fn.CallableRequest):
    """Create one draft batch and lines atomically for the authorized pilot warehouse."""
    if req.auth is None:
        raise https_fn.HttpsError("unauthenticated", "Authentication required")
    payload = _create_payload(_data(req))
    db = firestore.client()
    actor = _check_actor(req, db, payload["warehouseId"])
    root = db.collection("organizations").document(ORG_ID)
    operation_ref = root.collection("labelingIdempotency").document(payload["idempotencyKey"])
    payload_digest = _digest(payload)

    @firestore.transactional
    def _transaction(transaction):
        previous = read_document(transaction, operation_ref)
        if previous is not None and previous.exists:
            return _operation_result(previous, payload_digest), True

        batch_ref = root.collection("labelingBatches").document()
        audit_ref = root.collection("auditEvents").document()
        now = firestore.SERVER_TIMESTAMP
        estimated_totals = {
            "boxes": sum(line["estimatedBoxes"] for line in payload["lines"]),
            "pallets": sum(line["estimatedPallets"] for line in payload["lines"]),
        }
        transaction.set(batch_ref, {
            "organizationId": ORG_ID,
            "warehouseId": payload["warehouseId"],
            "labelingCompanyId": payload["labelingCompanyId"],
            "labelingCompanyName": payload["labelingCompanyName"],
            "receiverName": payload["receiverName"],
            "deliveredByName": payload["deliveredByName"],
            "status": "draft",
            "estimatedTotals": estimated_totals,
            "actualTotals": {"assigned": 0, "returned": 0, "loss": 0, "pending": 0, "output": 0},
            "openedAt": None,
            "closedAt": None,
            "version": 1,
            "evidenceRefs": [],
            "createdBy": req.auth.uid,
            "createdAt": now,
            "updatedAt": now,
        })
        for line in payload["lines"]:
            line_ref = batch_ref.collection("lines").document()
            transaction.set(line_ref, {
                **line,
                "organizationId": ORG_ID,
                "warehouseId": payload["warehouseId"],
                "batchId": batch_ref.id,
                "lineId": line_ref.id,
                "createdBy": req.auth.uid,
                "createdAt": now,
                "updatedAt": now,
            })
        result = {"batchId": batch_ref.id, "correlationId": batch_ref.id, "version": 1}
        transaction.set(audit_ref, {
            "organizationId": ORG_ID,
            "warehouseId": payload["warehouseId"],
            "entityType": "labeling_batch",
            "entityId": batch_ref.id,
            "action": "CREATE",
            "actorUserId": req.auth.uid,
            "actorRole": actor["role"],
            "correlationId": batch_ref.id,
            "idempotencyKey": payload["idempotencyKey"],
            "occurredAt": now,
            "schemaVersion": 1,
        })
        transaction.set(operation_ref, {
            "key": payload["idempotencyKey"],
            "kind": CREATE_BATCH_KIND,
            "operation": "createBatch",
            "payloadDigest": payload_digest,
            "resourceId": batch_ref.id,
            "result": result,
            "actorUserId": req.auth.uid,
            "createdAt": now,
        })
        return result, False

    result, idempotent = _transaction(db.transaction())
    return {**result, "idempotent": idempotent}


@https_fn.on_call(cors=CORS_OPTS, enforce_app_check=True)
def addBatchLine(req: https_fn.CallableRequest):
    """Append one unique planned line to a draft batch with optimistic locking."""
    if req.auth is None:
        raise https_fn.HttpsError("unauthenticated", "Authentication required")
    data = _data(req)
    request_id = _request_id(data.get("requestId"))
    batch_id = _document_id(data.get("batchId"), "batchId")
    expected_version = _version(data.get("expectedVersion"))
    line = _line(data.get("line"))
    payload = {
        "requestId": request_id,
        "batchId": batch_id,
        "expectedVersion": expected_version,
        "line": line,
    }
    payload_digest = _digest(payload)
    db = firestore.client()
    actor = _check_actor(req, db)
    root = db.collection("organizations").document(ORG_ID)
    batch_ref = root.collection("labelingBatches").document(batch_id)
    operation_ref = root.collection("labelingIdempotency").document(request_id)

    @firestore.transactional
    def _transaction(transaction):
        previous = read_document(transaction, operation_ref)
        if previous is not None and previous.exists:
            return _operation_result_for(previous, "labeling_add_batch_line", payload_digest), True

        batch_snapshot = read_document(transaction, batch_ref)
        if batch_snapshot is None or not batch_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Labeling batch not found")
        batch = batch_snapshot.to_dict() or {}
        warehouse_id = batch.get("warehouseId")
        if (
            batch.get("organizationId") != ORG_ID
            or warehouse_id != PILOT_WAREHOUSE_ID
            or not _warehouse_allowed(actor, warehouse_id)
        ):
            raise https_fn.HttpsError("permission-denied", "Warehouse access denied")
        if batch.get("status") != "draft":
            raise _error("Batch is not draft")
        if batch.get("version") != expected_version:
            raise https_fn.HttpsError("aborted", "VERSION_CONFLICT")

        existing = read_documents(
            transaction,
            batch_ref.collection("lines").where("trackingKey", "==", line["trackingKey"]),
        )
        if existing:
            raise https_fn.HttpsError("already-exists", "TRACKING_KEY_EXISTS")

        estimated_totals = batch.get("estimatedTotals")
        if (
            not isinstance(estimated_totals, dict)
            or isinstance(estimated_totals.get("boxes"), bool)
            or isinstance(estimated_totals.get("pallets"), bool)
            or not isinstance(estimated_totals.get("boxes"), int)
            or not isinstance(estimated_totals.get("pallets"), int)
            or estimated_totals["boxes"] < 0
            or estimated_totals["pallets"] < 0
        ):
            raise _error("Batch estimated totals are invalid")

        line_ref = batch_ref.collection("lines").document()
        audit_ref = root.collection("auditEvents").document()
        now = firestore.SERVER_TIMESTAMP
        next_version = expected_version + 1
        next_totals = {
            "boxes": estimated_totals["boxes"] + line["estimatedBoxes"],
            "pallets": estimated_totals["pallets"] + line["estimatedPallets"],
        }
        transaction.set(line_ref, {
            **line,
            "organizationId": ORG_ID,
            "warehouseId": warehouse_id,
            "batchId": batch_id,
            "lineId": line_ref.id,
            "createdBy": req.auth.uid,
            "createdAt": now,
            "updatedAt": now,
        })
        transaction.update(batch_ref, {
            "estimatedTotals": next_totals,
            "version": next_version,
            "updatedAt": now,
        })
        result = {
            "batchId": batch_id,
            "lineId": line_ref.id,
            "correlationId": batch_id,
            "version": next_version,
        }
        transaction.set(audit_ref, {
            "organizationId": ORG_ID,
            "warehouseId": warehouse_id,
            "entityType": "labeling_batch_line",
            "entityId": line_ref.id,
            "batchId": batch_id,
            "action": "ADD_LINE",
            "actorUserId": req.auth.uid,
            "actorRole": actor["role"],
            "correlationId": batch_id,
            "requestId": request_id,
            "previousVersion": expected_version,
            "version": next_version,
            "occurredAt": now,
            "schemaVersion": 1,
        })
        transaction.set(operation_ref, {
            "key": request_id,
            "kind": "labeling_add_batch_line",
            "operation": "addBatchLine",
            "payloadDigest": payload_digest,
            "resourceId": line_ref.id,
            "result": result,
            "actorUserId": req.auth.uid,
            "createdAt": now,
        })
        return result, False

    result, idempotent = _transaction(db.transaction())
    return {**result, "idempotent": idempotent}
