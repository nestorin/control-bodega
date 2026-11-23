"""Authoritative shipment confirmation transaction for Firestore."""
from hashlib import sha256
from firebase_functions import https_fn
from firebase_admin import firestore, get_app, initialize_app

from firestore_transactions import read_document, read_documents
from http_cors import CORS_OPTS
from rbac import _warehouse_allowed

try:
    get_app()
except ValueError:
    initialize_app()

ORG_ID = "org_exepa_001"
WAREHOUSE_IDS = {"wh_tehuacan_1", "wh_tehuacan_2"}
WAREHOUSE_ALIASES = {
    "wh_tehuacan_1": {"wh_tehuacan_1", "Tehuacan-1", "ALM-001", "almacen-001", "warehouse-1"},
    "wh_tehuacan_2": {"wh_tehuacan_2", "Tehuacan-2", "ALM-002", "almacen-002", "warehouse-2"},
}
# SUPER_ADMIN is a real Firestore membership role: firestore.rules grants it the
# same authority as ADMIN, receptions.py already accepts it, and production
# memberships carry it.
ALLOWED_ROLES = {"OPERATOR", "SUPERVISOR", "AUDITOR", "ADMIN", "SUPER_ADMIN"}

def _error(message: str) -> https_fn.HttpsError:
    return https_fn.HttpsError("failed-precondition", message)


def _lot_projection_id(warehouse_id, product_id, lot, expiry_date):
    """Match the deterministic lot projection id created by receptions."""
    projection_key = "\0".join((warehouse_id, product_id, lot, expiry_date))
    return f"lot-{sha256(projection_key.encode('utf-8')).hexdigest()[:32]}"


def _validate_completion_status(status: object) -> None:
    if status != "IN_PROGRESS":
        raise _error("Only IN_PROGRESS shipments can be completed")


def _validate_shipment_evidence(shipment: dict, shipment_id: str, warehouse_id: str) -> None:
    evidence = shipment.get("evidencePhotos")
    if not isinstance(evidence, dict):
        raise _error("Shipment evidence is required")
    required = {"trailerBox", "internalSeal", "externalSeal", "signedDocument", "invoice", "carrier"}
    if any(not isinstance(evidence.get(field), str) or not evidence.get(field) for field in required):
        raise _error("Shipment evidence is incomplete")
    loaded = evidence.get("loadedTrailer")
    if not isinstance(loaded, list) or not loaded or any(not isinstance(path, str) for path in loaded):
        raise _error("Loaded trailer evidence is required")
    prefix = f"organizations/{ORG_ID}/warehouses/{warehouse_id}/shipments/{shipment_id}/evidence/"
    image_paths = [*loaded, *(evidence[field] for field in required if field != "carrier")]
    if any(not path.startswith(prefix) or path.startswith("blob:") for path in image_paths):
        raise _error("Shipment evidence path is invalid")


def _validate_scanned_pallet_products(lines: list, pallets_by_id: dict) -> None:
    for line in lines:
        for pallet_id in line["palletsScanned"]:
            pallet = pallets_by_id.get(pallet_id)
            if pallet is not None and pallet.get("productId") != line["productId"]:
                raise _error("Scanned pallet product does not match its shipment line")


def _claim_scanned_pallets(
    transaction, lines: list, pallets_by_id: dict, pallet_refs_by_id: dict, shipment_id: str
) -> None:
    pallet_ids = [pallet_id for line in lines for pallet_id in line["palletsScanned"]]
    for pallet_id in pallet_ids:
        pallet = pallets_by_id[pallet_id]
        if "shipmentId" in pallet:
            raise _error("A scanned pallet has already been assigned to a shipment")
    for pallet_id in pallet_ids:
        transaction.update(pallet_refs_by_id[pallet_id], {"shipmentId": shipment_id})


@https_fn.on_call(cors=CORS_OPTS, enforce_app_check=True)
def confirm_shipment(req: https_fn.CallableRequest):
    """Confirm a shipment with membership, stock and pallet checks in one transaction."""
    if req.auth is None:
        raise https_fn.HttpsError("unauthenticated", "Authentication required")
    data = req.data or {}
    shipment_id = data.get("shipmentId")
    operation_id = data.get("operationId")
    if not isinstance(shipment_id, str) or not shipment_id:
        raise https_fn.HttpsError("invalid-argument", "shipmentId is required")
    if not isinstance(operation_id, str) or not operation_id:
        raise https_fn.HttpsError("invalid-argument", "operationId is required")
    if len(operation_id) > 128:
        raise https_fn.HttpsError("invalid-argument", "operationId is too long")

    db = firestore.client()
    uid = req.auth.uid
    shipment_ref = db.document(f"organizations/{ORG_ID}/shipments/{shipment_id}")
    membership_ref = db.document(f"organizations/{ORG_ID}/users/{uid}")
    confirmation_ref = db.document(
        f"organizations/{ORG_ID}/shipment_confirmations/{shipment_id}"
    )

    @firestore.transactional
    def _transaction(transaction):
        membership = read_document(transaction, membership_ref)
        if membership is None or not membership.exists:
            raise _error("Organization membership required")
        member = membership.to_dict() or {}
        if (
            member.get("userId") != uid
            or member.get("organizationId") != ORG_ID
            or member.get("status") != "ACTIVE"
            or member.get("role") not in ALLOWED_ROLES
        ):
            raise _error("Active organization membership required")

        shipment_snapshot = read_document(transaction, shipment_ref)
        if shipment_snapshot is None or not shipment_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Shipment not found")
        shipment = shipment_snapshot.to_dict() or {}
        if shipment.get("organizationId") != ORG_ID:
            raise _error("Shipment organization is invalid")
        warehouse_id = shipment.get("warehouseId")
        if warehouse_id not in WAREHOUSE_IDS:
            raise _error("Shipment warehouse is not canonical")
        # The Firestore rules grant ADMIN and SUPER_ADMIN global warehouse access,
        # the inventory callables already implement that, and production memberships
        # rely on it, so reuse the same scope rule here.
        if not _warehouse_allowed(member, warehouse_id):
            raise https_fn.HttpsError("permission-denied", "Warehouse access denied")

        confirmation = read_document(transaction, confirmation_ref)
        if confirmation is not None and confirmation.exists:
            previous = confirmation.to_dict() or {}
            if previous.get("operationId") == operation_id:
                return {"shipmentId": shipment_id, "status": "COMPLETED", "idempotent": True}
            raise _error("Shipment confirmation already has another operation")
        _validate_completion_status(shipment.get("status"))
        _validate_shipment_evidence(shipment, shipment_id, warehouse_id)

        lines = shipment.get("lines")
        if not isinstance(lines, list) or not lines or len(lines) > 30:
            raise _error("Shipment lines are invalid")
        requested = {}
        pallet_ids = []
        for line in lines:
            if not isinstance(line, dict):
                raise _error("Shipment line is invalid")
            product_id = line.get("productId")
            quantity = line.get("quantity")
            scanned = line.get("palletsScanned")
            if (
                not isinstance(product_id, str)
                or not product_id
                or len(product_id) > 128
                or isinstance(quantity, bool)
                or not isinstance(quantity, int)
                or quantity < 1
                or quantity > 30
                or not isinstance(scanned, list)
                or len(scanned) > 30
                or any(not isinstance(pallet_id, str) or not pallet_id or len(pallet_id) > 128 for pallet_id in scanned)
            ):
                raise _error("Shipment line has invalid types or limits")
            if len(scanned) != quantity:
                raise _error(f"Product {product_id}: scanned pallets mismatch")
            requested[product_id] = requested.get(product_id, 0) + quantity
            pallet_ids.extend(scanned)
        if len(pallet_ids) != len(set(pallet_ids)):
            raise _error("Duplicate pallet scan")

        if len(pallet_ids) > 30:
            raise _error("Shipment exceeds the Firestore pallet validation limit")

        product_ids = sorted(requested)
        lock_refs = [
            db.document(
                f"organizations/{ORG_ID}/inventory_locks/{warehouse_id}_{product_id}"
            )
            for product_id in product_ids
        ]
        # Deterministic lock documents serialize confirmations for the same
        # warehouse/product pairs and are read before any transaction writes.
        for lock_ref in lock_refs:
            read_document(transaction, lock_ref)

        # Firestore Python transactions support query reads; stock and pallets
        # are therefore re-read before any writes in the same transaction.
        for product_id, required in requested.items():
            movement_query = (
                db.collection(f"organizations/{ORG_ID}/inventory_movements")
                .where("warehouseId", "==", warehouse_id)
                .where("productId", "==", product_id)
            )
            available = 0
            for movement in read_documents(transaction, movement_query):
                item = movement.to_dict() or {}
                if item.get("direction") == "IN" or item.get("movementType") in {"RECEIPT", "TRANSFER"}:
                    available += int(item.get("quantity", 0))
                elif item.get("direction") == "OUT" or item.get("movementType") == "SHIPMENT":
                    available -= int(item.get("quantity", 0))
            if available < required:
                raise _error(f"Insufficient stock for {product_id}")

        if pallet_ids:
            # The scanner submits printed QR identifiers (TQR-...). Resolve
            # those directly; legacy callers may still submit internal pallet ids.
            if all(pallet_id.startswith("TQR-") for pallet_id in pallet_ids):
                pallet_query = db.collection_group("pallets").where(
                    "qrIdentifier", "in", pallet_ids[:30]
                )
                pallet_snapshots = [
                    snapshot for snapshot in read_documents(transaction, pallet_query)
                    if (snapshot.to_dict() or {}).get("organizationId") == ORG_ID
                    and (snapshot.to_dict() or {}).get("warehouseId") in WAREHOUSE_ALIASES[warehouse_id]
                ]
            else:
                pallet_query = (
                    db.collection_group("pallets")
                    .where("organizationId", "==", ORG_ID)
                    .where("warehouseId", "==", warehouse_id)
                    .where("id", "in", pallet_ids[:30])
                )
                pallet_snapshots = read_documents(transaction, pallet_query)
            pallets_by_id = {
                key: item
                for snapshot in pallet_snapshots
                for item in [snapshot.to_dict() or {}]
                for key in (item.get("id"), item.get("qrIdentifier"))
                if key
            }
            pallet_refs_by_id = {
                key: snapshot.reference
                for snapshot in pallet_snapshots
                for item in [snapshot.to_dict() or {}]
                for key in (item.get("id"), item.get("qrIdentifier"))
                if key
            }
            found = set(pallets_by_id)
            if found != set(pallet_ids):
                raise _error("One or more pallets are missing or belong to another warehouse")
            _validate_scanned_pallet_products(lines, pallets_by_id)
            _claim_scanned_pallets(
                transaction, lines, pallets_by_id, pallet_refs_by_id, shipment_id
            )

        # Keep the lot read model aligned with the authoritative movement
        # ledger. Each scanned pallet contributes its boxes to the shipment.
        lot_deltas = {}
        lot_refs = {}
        for pallet_id in pallet_ids:
            pallet = pallets_by_id[pallet_id]
            lot = pallet.get("lot")
            expiry = pallet.get("expiryDate")
            product_id = pallet.get("productId")
            quantity = pallet.get("quantity")
            if not all(isinstance(value, str) and value for value in (lot, product_id)):
                raise _error("Scanned pallet is missing lot traceability")
            if hasattr(expiry, "to_datetime"):
                expiry = expiry.to_datetime().date().isoformat()
            elif hasattr(expiry, "isoformat"):
                expiry = expiry.date().isoformat() if hasattr(expiry, "date") else expiry.isoformat()
            if not isinstance(expiry, str) or not expiry:
                raise _error("Scanned pallet is missing expiry traceability")
            projection_id = _lot_projection_id(warehouse_id, product_id, lot, expiry)
            lot_refs[projection_id] = db.document(
                f"organizations/{ORG_ID}/lotes_caducidades/{projection_id}"
            )
            lot_deltas[projection_id] = lot_deltas.get(projection_id, 0) + int(quantity or 0)
        for projection_id, delta in lot_deltas.items():
            lot_snapshot = read_document(transaction, lot_refs[projection_id])
            if lot_snapshot is None or not lot_snapshot.exists:
                raise _error("Lot projection not found for scanned pallet")
            current_boxes = int((lot_snapshot.to_dict() or {}).get("cajas", 0))
            if current_boxes < delta:
                raise _error("Lot projection has insufficient boxes")
            transaction.update(lot_refs[projection_id], {
                "cajas": current_boxes - delta,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })

        transaction.update(shipment_ref, {"status": "COMPLETED"})
        for lock_ref in lock_refs:
            transaction.set(lock_ref, {
                "organizationId": ORG_ID,
                "warehouseId": warehouse_id,
                "updatedBy": uid,
                "operationId": operation_id,
            }, merge=True)
        for line in lines:
            movement_ref = db.collection(f"organizations/{ORG_ID}/inventory_movements").document()
            transaction.set(movement_ref, {
                "organizationId": ORG_ID,
                "warehouseId": warehouse_id,
                "productId": line.get("productId"),
                "movementType": "SHIPMENT",
                "direction": "OUT",
                "quantity": int(line.get("quantity", 0)),
                "unit": line.get("unit", "pallet"),
                "operationId": operation_id,
                "actorUserId": uid,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "occurredAt": firestore.SERVER_TIMESTAMP,
            })
        transaction.set(confirmation_ref, {
            "shipmentId": shipment_id,
            "operationId": operation_id,
            "actorUserId": uid,
            "warehouseId": warehouse_id,
        })
        audit_ref = db.collection(f"organizations/{ORG_ID}/audit_events").document()
        transaction.set(audit_ref, {
            "organizationId": ORG_ID,
            "warehouseId": warehouse_id,
            "entityType": "shipment",
            "entityId": shipment_id,
            "action": "COMPLETE",
            "actorUserId": uid,
            "operationId": operation_id,
        })
        return {"shipmentId": shipment_id, "status": "COMPLETED", "idempotent": False}


@https_fn.on_call(cors=CORS_OPTS, enforce_app_check=True)
def save_shipment_evidence(req: https_fn.CallableRequest):
    """Persist shipment evidence photos (storage paths) to the shipment document."""
    if req.auth is None:
        raise https_fn.HttpsError("unauthenticated", "Authentication required")
    data = req.data or {}
    shipment_id = data.get("shipmentId")
    operation_id = data.get("operationId")
    evidence = data.get("evidencePhotos")
    if not isinstance(shipment_id, str) or not shipment_id:
        raise https_fn.HttpsError("invalid-argument", "shipmentId is required")
    if not isinstance(operation_id, str) or not operation_id:
        raise https_fn.HttpsError("invalid-argument", "operationId is required")
    if len(operation_id) > 128:
        raise https_fn.HttpsError("invalid-argument", "operationId is too long")
    if not isinstance(evidence, dict):
        raise https_fn.HttpsError("invalid-argument", "evidencePhotos is required")

    db = firestore.client()
    uid = req.auth.uid
    shipment_ref = db.document(f"organizations/{ORG_ID}/shipments/{shipment_id}")
    membership_ref = db.document(f"organizations/{ORG_ID}/users/{uid}")
    operation_ref = db.document(f"organizations/{ORG_ID}/shipment_operations/{operation_id}")

    @firestore.transactional
    def _transaction(transaction):
        membership = read_document(transaction, membership_ref)
        if membership is None or not membership.exists:
            raise _error("Organization membership required")
        member = membership.to_dict() or {}
        if (
            member.get("userId") != uid
            or member.get("organizationId") != ORG_ID
            or member.get("status") != "ACTIVE"
            or member.get("role") not in ALLOWED_ROLES
        ):
            raise _error("Active organization membership required")

        shipment_snapshot = read_document(transaction, shipment_ref)
        if shipment_snapshot is None or not shipment_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Shipment not found")
        shipment = shipment_snapshot.to_dict() or {}
        if shipment.get("organizationId") != ORG_ID:
            raise _error("Shipment organization is invalid")
        warehouse_id = shipment.get("warehouseId")
        if warehouse_id not in WAREHOUSE_IDS:
            raise _error("Shipment warehouse is not canonical")
        if not _warehouse_allowed(member, warehouse_id):
            raise https_fn.HttpsError("permission-denied", "Warehouse access denied")

        # Validate evidence paths
        required = {"trailerBox", "internalSeal", "externalSeal", "signedDocument", "invoice", "carrier"}
        if any(not isinstance(evidence.get(field), str) or not evidence.get(field) for field in required):
            raise _error("Shipment evidence is incomplete")
        loaded = evidence.get("loadedTrailer")
        if not isinstance(loaded, list) or not loaded or any(not isinstance(path, str) for path in loaded):
            raise _error("Loaded trailer evidence is required")
        prefix = f"organizations/{ORG_ID}/warehouses/{warehouse_id}/shipments/{shipment_id}/evidence/"
        image_paths = [*loaded, *(evidence[field] for field in required if field != "carrier")]
        if any(not path.startswith(prefix) or path.startswith("blob:") for path in image_paths):
            raise _error("Shipment evidence path is invalid")

        previous = read_document(transaction, operation_ref)
        if previous is not None and previous.exists:
            previous_data = previous.to_dict() or {}
            if previous_data.get("operationId") == operation_id:
                return {"shipmentId": shipment_id, "idempotent": True}
            raise _error("Shipment evidence already has another operation")

        transaction.update(shipment_ref, {"evidencePhotos": evidence, "updatedAt": firestore.SERVER_TIMESTAMP})
        audit_ref = db.collection(f"organizations/{ORG_ID}/audit_events").document()
        transaction.set(audit_ref, {"organizationId": ORG_ID, "warehouseId": warehouse_id,
            "entityType": "shipment", "entityId": shipment_id, "action": "SAVE_EVIDENCE",
            "actorUserId": uid, "operationId": operation_id})
        transaction.set(operation_ref, {"kind": "save_shipment_evidence", "result": {"shipmentId": shipment_id},
            "actorUserId": uid, "createdAt": firestore.SERVER_TIMESTAMP})
        return {"shipmentId": shipment_id, "idempotent": False}

    return _transaction(db.transaction())
