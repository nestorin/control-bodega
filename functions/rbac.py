"""Trusted RBAC and inventory mutation boundaries.

All writes in this module use the Admin SDK and therefore bypass Firestore
rules. The callable validates the caller and the complete business boundary
before entering a transaction.
"""

from firebase_functions import https_fn
from firebase_functions.options import CorsOptions
from firebase_admin import firestore, get_app, initialize_app
import re

try:
    get_app()
except ValueError:
    initialize_app()


ORG_ID = "org_exepa_001"
WAREHOUSE_IDS = {"wh_tehuacan_1", "wh_tehuacan_2"}
MAX_TRANSACTION_WRITES = 500
WAREHOUSE_ALIASES = {
    "almacen-001": "wh_tehuacan_1", "almacen-002": "wh_tehuacan_2",
    "alm_norte": "wh_tehuacan_1", "alm_sur": "wh_tehuacan_2",
    "ALM-001": "wh_tehuacan_1", "ALM-002": "wh_tehuacan_2",
    "warehouse-1": "wh_tehuacan_1", "warehouse-2": "wh_tehuacan_2",
}
ROLES = {
    "OPERATOR", "SUPERVISOR", "AUDITOR", "ADMIN",
    "AUXILIAR_ALMACENISTA", "GERENTE_ALMACEN",
}
# PENDING is gone: open sign-up provisions ACTIVE profiles directly, so there
# is no approval queue for an admin to move anyone out of.
MEMBERSHIP_STATUSES = {"ACTIVE", "INACTIVE"}

# CORS configuration for production domain
ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"
CORS_OPTS = CorsOptions(cors_origins=[ALLOWED_ORIGIN])


def _error(message: str) -> https_fn.HttpsError:
    return https_fn.HttpsError("failed-precondition", message)


def _auth_uid(req: https_fn.CallableRequest) -> str:
    if req.auth is None:
        raise https_fn.HttpsError("unauthenticated", "Authentication required")
    return req.auth.uid


def _is_super_admin(req: https_fn.CallableRequest) -> bool:
    """SUPER_ADMIN is a custom Auth claim, never a Firestore membership role."""
    token = getattr(req.auth, "token", None) if req.auth is not None else None
    return isinstance(token, dict) and token.get("superAdmin") is True


def _validate_operation_id(value: object) -> str:
    # operationId is also used as a Firestore document id. Reject path
    # separators and other characters here; otherwise the SDK raises a raw
    # ValueError which Firebase Callable surfaces as the opaque "internal [0]".
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_:-]{1,128}", value):
        raise https_fn.HttpsError("invalid-argument", "operationId is invalid")
    return value


def _membership(db, uid: str) -> dict:
    snapshot = db.document(f"organizations/{ORG_ID}/users/{uid}").get()
    member = snapshot.to_dict() if snapshot.exists else None
    if (
        not isinstance(member, dict)
        or member.get("userId") != uid
        or member.get("organizationId") != ORG_ID
        or member.get("status") != "ACTIVE"
        or member.get("role") not in ROLES
    ):
        raise _error("Active organization membership required")
    return member


def _warehouse_allowed(member: dict, warehouse_id: object) -> bool:
    warehouse_id = WAREHOUSE_ALIASES.get(warehouse_id, warehouse_id)
    if warehouse_id not in WAREHOUSE_IDS:
        return False
    if member.get("role") in {"ADMIN", "SUPER_ADMIN"}:
        return True
    if _canonical_warehouse_id(member.get("warehouseId")) == warehouse_id:
        return True
    return isinstance(member.get("warehouseIds"), list) and any(
        _canonical_warehouse_id(item) == warehouse_id for item in member["warehouseIds"]
    )


def _canonical_warehouse_id(value: str) -> str:
    return WAREHOUSE_ALIASES.get(value, value)


def _validate_inventory_import_write_count(movement_count: int) -> None:
    if movement_count + 1 > MAX_TRANSACTION_WRITES:
        raise https_fn.HttpsError(
            "resource-exhausted", "Inventory import exceeds the atomic write limit"
        )


def _actor(req: https_fn.CallableRequest, db) -> dict:
    uid = _auth_uid(req)
    if _is_super_admin(req):
        return {"userId": uid, "role": "SUPER_ADMIN", "organizationId": ORG_ID, "status": "ACTIVE"}
    return _membership(db, uid)


@https_fn.on_call(cors=CORS_OPTS)
def adjust_inventory(req: https_fn.CallableRequest):
    """Create one validated receipt/transfer movement and its audit event."""
    uid = _auth_uid(req)
    data = req.data if isinstance(req.data, dict) else {}
    operation_id = _validate_operation_id(data.get("operationId"))
    warehouse_id = data.get("warehouseId")
    product_id = data.get("productId")
    movement_type = data.get("movementType")
    quantity = data.get("quantity")
    if (
        not isinstance(warehouse_id, str)
        or not isinstance(product_id, str)
        or not product_id
        or len(product_id) > 128
        or movement_type not in {"RECEIPT", "TRANSFER"}
        or isinstance(quantity, bool)
        or not isinstance(quantity, int)
        or quantity < 1
        or quantity > 100000
    ):
        raise https_fn.HttpsError("invalid-argument", "Invalid inventory adjustment")

    db = firestore.client()
    member = _actor(req, db)
    if member.get("role") not in {
        "OPERATOR", "SUPERVISOR", "ADMIN", "AUXILIAR_ALMACENISTA", "GERENTE_ALMACEN",
        "SUPER_ADMIN",
    }:
        raise https_fn.HttpsError("permission-denied", "Inventory write denied")
    if not _warehouse_allowed(member, warehouse_id):
        raise https_fn.HttpsError("permission-denied", "Warehouse access denied")

    operation_ref = db.document(f"organizations/{ORG_ID}/inventory_operations/{operation_id}")

    @firestore.transactional
    def _transaction(transaction):
        previous = transaction.get(operation_ref)
        if previous.exists:
            result = previous.to_dict() or {}
            if result.get("kind") != "inventory_adjustment":
                raise _error("Operation id already used")
            return result.get("movementId"), True

        movement_ref = db.collection(f"organizations/{ORG_ID}/inventory_movements").document()
        audit_ref = db.collection(f"organizations/{ORG_ID}/audit_events").document()
        now = firestore.SERVER_TIMESTAMP
        transaction.set(movement_ref, {
            "organizationId": ORG_ID,
            "warehouseId": warehouse_id,
            "productId": product_id,
            "movementType": movement_type,
            "direction": "IN",
            "quantity": quantity,
            "unit": "cajas",
            "operationId": operation_id,
            "actorUserId": uid,
            "occurredAt": now,
        })
        transaction.set(audit_ref, {
            "organizationId": ORG_ID,
            "warehouseId": warehouse_id,
            "entityType": "inventory_movement",
            "entityId": movement_ref.id,
            "action": "CREATE",
            "actorUserId": uid,
            "operationId": operation_id,
            "occurredAt": now,
            "schemaVersion": 1,
        })
        transaction.set(operation_ref, {
            "kind": "inventory_adjustment",
            "movementId": movement_ref.id,
            "actorUserId": uid,
            "operationId": operation_id,
            "createdAt": now,
        })
        return movement_ref.id, False

    movement_id, idempotent = _transaction(db.transaction())
    return {"movementId": movement_id, "operationId": operation_id, "idempotent": idempotent}


@https_fn.on_call(cors=CORS_OPTS)
def update_membership(req: https_fn.CallableRequest):
    """Admin-only membership mutation with last-admin protection."""
    uid = _auth_uid(req)
    data = req.data if isinstance(req.data, dict) else {}
    operation_id = _validate_operation_id(data.get("operationId"))
    target_uid = data.get("targetUid")
    role = data.get("role")
    status = data.get("status")
    warehouse_id = data.get("warehouseId")
    if not isinstance(target_uid, str) or not target_uid or len(target_uid) > 128:
        raise https_fn.HttpsError("invalid-argument", "targetUid is invalid")
    if role not in ROLES or status not in MEMBERSHIP_STATUSES:
        raise https_fn.HttpsError("invalid-argument", "Membership role or status is invalid")
    requested_warehouse_ids = data.get("warehouseIds")
    if requested_warehouse_ids is not None:
        if (
            not isinstance(requested_warehouse_ids, list)
            or len(requested_warehouse_ids) > len(WAREHOUSE_IDS)
            or len(set(requested_warehouse_ids)) != len(requested_warehouse_ids)
            or any(item not in WAREHOUSE_IDS for item in requested_warehouse_ids)
        ):
            raise https_fn.HttpsError("invalid-argument", "warehouseIds is invalid")
        requested_warehouse_ids = list(requested_warehouse_ids)
    elif warehouse_id is not None:
        requested_warehouse_ids = [warehouse_id]
    else:
        requested_warehouse_ids = []
    if warehouse_id is not None and warehouse_id not in WAREHOUSE_IDS:
        raise https_fn.HttpsError("invalid-argument", "warehouseId is invalid")
    if warehouse_id is not None and requested_warehouse_ids != [warehouse_id]:
        raise https_fn.HttpsError("invalid-argument", "warehouseId and warehouseIds disagree")
    if role == "ADMIN" and requested_warehouse_ids:
        raise https_fn.HttpsError("invalid-argument", "ADMIN must have global warehouse scope")
    if role != "ADMIN" and status == "ACTIVE" and not requested_warehouse_ids:
        raise https_fn.HttpsError("invalid-argument", "Active membership requires warehouse scope")
    compatibility_warehouse_id = (
        requested_warehouse_ids[0] if len(requested_warehouse_ids) == 1 else None
    )

    db = firestore.client()
    actor = _actor(req, db)
    if actor.get("role") not in {"ADMIN", "SUPER_ADMIN"}:
        raise https_fn.HttpsError("permission-denied", "Admin role required")
    target_ref = db.document(f"organizations/{ORG_ID}/users/{target_uid}")
    operation_ref = db.document(f"organizations/{ORG_ID}/membership_operations/{operation_id}")

    @firestore.transactional
    def _transaction(transaction):
        previous_operation = transaction.get(operation_ref)
        if previous_operation.exists:
            return {"idempotent": True}
        target_snapshot = transaction.get(target_ref)
        if not target_snapshot.exists:
            raise https_fn.HttpsError("not-found", "Membership not found")
        target = target_snapshot.to_dict() or {}
        if target.get("organizationId") != ORG_ID or target.get("userId") != target_uid:
            raise _error("Membership organization is invalid")

        is_last_admin = target.get("role") == "ADMIN" and target.get("status") == "ACTIVE"
        demoting = role != "ADMIN" or status != "ACTIVE"
        if is_last_admin and demoting:
            admins = transaction.get(
                db.collection(f"organizations/{ORG_ID}/users")
                .where("role", "==", "ADMIN")
                .where("status", "==", "ACTIVE")
            )
            if len(admins) <= 1:
                raise _error("The last active admin cannot be demoted or deactivated")

        transaction.update(target_ref, {
            "role": role,
            "status": status,
            "warehouseId": compatibility_warehouse_id,
            "warehouseIds": requested_warehouse_ids,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        audit_ref = db.collection(f"organizations/{ORG_ID}/audit_events").document()
        transaction.set(audit_ref, {
            "organizationId": ORG_ID,
            "entityType": "membership",
            "entityId": target_uid,
            "action": "UPDATE",
            "actorUserId": uid,
            "operationId": operation_id,
            "occurredAt": firestore.SERVER_TIMESTAMP,
            "schemaVersion": 1,
        })
        transaction.set(operation_ref, {
            "kind": "membership_update",
            "targetUid": target_uid,
            "actorUserId": uid,
            "operationId": operation_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return {"idempotent": False}

    return _transaction(db.transaction())


@https_fn.on_call(cors=CORS_OPTS)
def import_inventory(req: https_fn.CallableRequest):
    """Apply an idempotent inventory import through the trusted ledger."""
    uid = _auth_uid(req)
    data = req.data if isinstance(req.data, dict) else {}
    operation_id = _validate_operation_id(data.get("operationId"))
    mode = data.get("mode")
    rows = data.get("rows")
    if mode not in {"REPLACE", "ADD"} or not isinstance(rows, list) or not rows or len(rows) > 5000:
        raise https_fn.HttpsError("invalid-argument", "Invalid inventory import")
    db = firestore.client()
    member = _actor(req, db)
    if member.get("role") not in {"ADMIN", "SUPER_ADMIN", "GERENTE_ALMACEN"}:
        raise https_fn.HttpsError("permission-denied", "Inventory import denied")
    normalized = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("productId"), str) or not isinstance(row.get("warehouseId"), str):
            raise https_fn.HttpsError("invalid-argument", "Invalid inventory import row")
        quantity = row.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 0 or quantity > 100000:
            raise https_fn.HttpsError("invalid-argument", "Invalid inventory quantity")
        warehouse_id = row["warehouseId"]
        if not _warehouse_allowed(member, warehouse_id):
            raise https_fn.HttpsError("permission-denied", "Warehouse access denied")
        normalized.append((row["productId"], warehouse_id, quantity))

    operation_ref = db.document(f"organizations/{ORG_ID}/inventory_operations/{operation_id}")

    @firestore.transactional
    def _transaction(transaction):
        previous = transaction.get(operation_ref)
        if previous.exists:
            result = previous.to_dict() or {}
            if result.get("kind") != "inventory_import":
                raise _error("Operation id already used")
            return {"idempotent": True, "movementCount": result.get("movementCount", 0)}
        current = {}
        for snapshot in transaction.get(db.collection(f"organizations/{ORG_ID}/inventory_movements")):
            movement = snapshot.to_dict() or {}
            key = (movement.get("warehouseId"), movement.get("productId"))
            delta = movement.get("quantity", 0) if movement.get("direction") == "IN" else -movement.get("quantity", 0)
            current[key] = current.get(key, 0) + delta
        requested = {(warehouse_id, product_id): quantity for product_id, warehouse_id, quantity in normalized}
        if mode == "REPLACE":
            # A replacement defines the complete imported scope. Products that
            # existed in those warehouses but are absent from the file become 0.
            for warehouse_id, product_id in list(current):
                if warehouse_id in {row[1] for row in normalized} and (warehouse_id, product_id) not in requested:
                    requested[(warehouse_id, product_id)] = 0
        changes = []
        for (warehouse_id, product_id), target in requested.items():
            delta = target if mode == "ADD" else target - current.get((warehouse_id, product_id), 0)
            if delta == 0:
                continue
            changes.append((warehouse_id, product_id, delta))
        _validate_inventory_import_write_count(len(changes))
        movement_count = 0
        for warehouse_id, product_id, delta in changes:
            movement_ref = db.collection(f"organizations/{ORG_ID}/inventory_movements").document()
            transaction.set(movement_ref, {
                "organizationId": ORG_ID, "warehouseId": warehouse_id, "productId": product_id,
                "movementType": "ADJUSTMENT", "direction": "IN" if delta > 0 else "OUT",
                "quantity": abs(delta), "unit": "cajas", "operationId": f"{operation_id}:{movement_count}",
                "actorUserId": uid, "occurredAt": firestore.SERVER_TIMESTAMP,
            })
            movement_count += 1
        transaction.set(operation_ref, {"kind": "inventory_import", "mode": mode, "movementCount": movement_count, "actorUserId": uid, "operationId": operation_id, "createdAt": firestore.SERVER_TIMESTAMP})
        return {"idempotent": False, "movementCount": movement_count}

    return _transaction(db.transaction())
