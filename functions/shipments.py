"""Authoritative shipment confirmation transaction for Firestore."""
from firebase_functions import https_fn
from firebase_functions.options import CorsOptions
from firebase_admin import firestore, initialize_app

initialize_app()

ORG_ID = "org_exepa_001"
WAREHOUSE_IDS = {"wh_tehuacan_1", "wh_tehuacan_2"}
ALLOWED_ROLES = {"OPERATOR", "SUPERVISOR", "AUDITOR", "ADMIN"}

# CORS configuration for production domain
ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"
CORS_OPTS = CorsOptions(cors_origins=[ALLOWED_ORIGIN])


def _error(message: str) -> https_fn.HttpsError:
    return https_fn.HttpsError("failed-precondition", message)


def _validate_completion_status(status: object) -> None:
    if status != "IN_PROGRESS":
        raise _error("Only IN_PROGRESS shipments can be completed")


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


@https_fn.on_call(cors=CORS_OPTS)
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
        membership = transaction.get(membership_ref)
        if not membership.exists:
            raise _error("Organization membership required")
        member = membership.to_dict() or {}
        if (
            member.get("userId") != uid
            or member.get("organizationId") != ORG_ID
            or member.get("status") != "ACTIVE"
            or member.get("role") not in ALLOWED_ROLES
        ):
            raise _error("Active organization membership required")

        shipment_snapshot = transaction.get(shipment_ref)
        if not shipment_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Shipment not found")
        shipment = shipment_snapshot.to_dict() or {}
        if shipment.get("organizationId") != ORG_ID:
            raise _error("Shipment organization is invalid")
        warehouse_id = shipment.get("warehouseId")
        if warehouse_id not in WAREHOUSE_IDS:
            raise _error("Shipment warehouse is not canonical")
        if member.get("role") != "ADMIN" and member.get("warehouseId") != warehouse_id:
            raise https_fn.HttpsError("permission-denied", "Warehouse access denied")

        confirmation = transaction.get(confirmation_ref)
        if confirmation.exists:
            previous = confirmation.to_dict() or {}
            if previous.get("operationId") == operation_id:
                return {"shipmentId": shipment_id, "status": "COMPLETED", "idempotent": True}
            raise _error("Shipment confirmation already has another operation")
        _validate_completion_status(shipment.get("status"))

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
            transaction.get(lock_ref)

        # Firestore Python transactions support query reads; stock and pallets
        # are therefore re-read before any writes in the same transaction.
        for product_id, required in requested.items():
            movement_query = (
                db.collection(f"organizations/{ORG_ID}/inventory_movements")
                .where("warehouseId", "==", warehouse_id)
                .where("productId", "==", product_id)
            )
            available = 0
            for movement in transaction.get(movement_query):
                item = movement.to_dict() or {}
                if item.get("direction") == "IN" or item.get("movementType") in {"RECEIPT", "TRANSFER"}:
                    available += int(item.get("quantity", 0))
                elif item.get("direction") == "OUT" or item.get("movementType") == "SHIPMENT":
                    available -= int(item.get("quantity", 0))
            if available < required:
                raise _error(f"Insufficient stock for {product_id}")

        if pallet_ids:
            pallet_query = (
                db.collection_group("pallets")
                .where("organizationId", "==", ORG_ID)
                .where("warehouseId", "==", warehouse_id)
                .where("id", "in", pallet_ids[:30])
            )
            pallet_snapshots = list(transaction.get(pallet_query))
            pallets_by_id = {
                (snapshot.to_dict() or {}).get("id"): snapshot.to_dict() or {}
                for snapshot in pallet_snapshots
            }
            pallet_refs_by_id = {
                (snapshot.to_dict() or {}).get("id"): snapshot.reference
                for snapshot in pallet_snapshots
            }
            found = set(pallets_by_id)
            if found != set(pallet_ids):
                raise _error("One or more pallets are missing or belong to another warehouse")
            _validate_scanned_pallet_products(lines, pallets_by_id)
            _claim_scanned_pallets(
                transaction, lines, pallets_by_id, pallet_refs_by_id, shipment_id
            )

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

    return _transaction(db.transaction())
