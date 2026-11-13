import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from firebase_admin import firestore
from firebase_functions import https_fn

import rbac
from rbac import _actor, _membership, _validate_inventory_import_write_count


class InventoryImportTransactionBudgetTests(unittest.TestCase):
    def test_almacenista_is_a_valid_active_scoped_membership(self):
        from unittest.mock import Mock

        snapshot = Mock(exists=True)
        snapshot.to_dict.return_value = {
            "userId": "warehouse-user",
            "organizationId": "org_exepa_001",
            "status": "ACTIVE",
            "role": "ALMACENISTA",
            "warehouseId": "wh_tehuacan_1",
        }
        database = Mock()
        database.document.return_value.get.return_value = snapshot

        self.assertEqual(_membership(database, "warehouse-user")["role"], "ALMACENISTA")

    def test_import_allows_at_most_499_movement_writes_plus_operation_record(self):
        _validate_inventory_import_write_count(499)
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_inventory_import_write_count(500)
        self.assertEqual(raised.exception.code, "resource-exhausted")


class _Snapshot:
    def __init__(self, data=None):
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return self._data


class _Reference:
    def __init__(self, path, documents):
        self.path = path
        self.id = path.rsplit("/", 1)[-1]
        self._documents = documents

    def get(self):
        return _Snapshot(self._documents.get(self.path))


class _Collection:
    def __init__(self, path):
        self.path = path

    def document(self, document_id=None):
        return _Reference(f"{self.path}/{document_id or 'generated'}", {})


class _Transaction:
    def __init__(self, documents, movements=()):
        self._documents = documents
        self._movements = list(movements)
        self.reads = []
        self.sets = []
        self.updates = []

    def get(self, reference):
        self.reads.append(reference)
        if isinstance(reference, _Collection):
            return [
                movement if isinstance(movement, _Snapshot) else _Snapshot(movement)
                for movement in self._movements
            ]
        if isinstance(reference, firestore.Query):
            limit = getattr(reference, "_limit", None)
            movements = self._movements if limit is None else self._movements[:limit]
            return [
                movement if isinstance(movement, _Snapshot) else _Snapshot(movement)
                for movement in movements
            ]
        return _Snapshot(self._documents.get(reference.path))

    def set(self, reference, data):
        self.sets.append((reference, data))

    def update(self, reference, data):
        self.updates.append((reference, data))


class _Database:
    def __init__(self, documents, transaction):
        self._documents = documents
        self._transaction = transaction

    def document(self, path):
        return _Reference(path, self._documents)

    def collection(self, collection_id):
        return _Collection(collection_id)

    def transaction(self):
        return self._transaction


class MembershipRoleGateTests(unittest.TestCase):
    """Regression coverage for SUPER_ADMIN as a real Firestore membership role."""

    def _database_with_membership(self, uid, member):
        documents = {
            f"organizations/{rbac.ORG_ID}/users/{uid}": member,
        }
        return _Database(documents, _Transaction(documents))

    def _active_member(self, uid, role):
        return {
            "userId": uid,
            "organizationId": rbac.ORG_ID,
            "status": "ACTIVE",
            "role": role,
            "warehouseId": "wh_tehuacan_1",
        }

    def test_super_admin_membership_is_accepted_by_the_membership_gate(self):
        uid = "super-admin-1"
        database = self._database_with_membership(
            uid, self._active_member(uid, "SUPER_ADMIN")
        )

        member = _membership(database, uid)

        self.assertEqual(member["role"], "SUPER_ADMIN")
        self.assertEqual(member["status"], "ACTIVE")
        self.assertEqual(member["organizationId"], rbac.ORG_ID)

    def test_actor_returns_super_admin_membership_without_the_auth_claim(self):
        uid = "super-admin-2"
        database = self._database_with_membership(
            uid, self._active_member(uid, "SUPER_ADMIN")
        )
        request = SimpleNamespace(auth=SimpleNamespace(uid=uid, token={}))

        actor = _actor(request, database)

        self.assertEqual(actor["role"], "SUPER_ADMIN")
        self.assertEqual(actor["userId"], uid)
        self.assertEqual(actor["organizationId"], rbac.ORG_ID)
        self.assertEqual(actor["status"], "ACTIVE")

    def test_previously_accepted_membership_roles_are_still_accepted(self):
        for role in ("ALMACENISTA", "ADMIN"):
            with self.subTest(role=role):
                uid = f"member-{role.lower()}"
                database = self._database_with_membership(
                    uid, self._active_member(uid, role)
                )

                self.assertEqual(_membership(database, uid)["role"], role)

    def test_inactive_super_admin_membership_is_still_rejected(self):
        uid = "super-admin-3"
        member = self._active_member(uid, "SUPER_ADMIN")
        member["status"] = "INACTIVE"
        database = self._database_with_membership(uid, member)

        with self.assertRaises(https_fn.HttpsError) as raised:
            _membership(database, uid)

        self.assertEqual(raised.exception.code, "failed-precondition")
        self.assertEqual(raised.exception.message, "Active organization membership required")

    def test_unknown_membership_role_is_still_rejected(self):
        uid = "member-unknown-role"
        database = self._database_with_membership(
            uid, self._active_member(uid, "ROOT")
        )

        with self.assertRaises(https_fn.HttpsError) as raised:
            _membership(database, uid)

        self.assertEqual(raised.exception.code, "failed-precondition")
        self.assertEqual(raised.exception.message, "Active organization membership required")


class InventoryImportQueryRegressionTests(unittest.TestCase):
    def _run_import(self, mode, rows, movements):
        uid = "admin-1"
        warehouse_id = "wh_tehuacan_1"
        documents = {
            f"organizations/{rbac.ORG_ID}/users/{uid}": {
                "userId": uid,
                "organizationId": rbac.ORG_ID,
                "status": "ACTIVE",
                "role": "ADMIN",
                "warehouseId": warehouse_id,
            },
        }
        transaction = _Transaction(documents, movements)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid=uid, token={}),
            data={
                "operationId": f"import-{mode.lower()}-1",
                "mode": mode,
                "rows": rows,
            },
        )

        with (
            patch.object(rbac.firestore, "client", return_value=_Database(documents, transaction)),
            patch.object(rbac.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            result = inspect.unwrap(rbac.import_inventory)(request)

        query_reads = [read for read in transaction.reads if isinstance(read, firestore.Query)]
        self.assertEqual(len(query_reads), 1)
        read_arg = query_reads[0]
        self.assertIsInstance(read_arg, firestore.Query)
        self.assertNotIsInstance(read_arg, firestore.CollectionReference)
        return result, transaction

    def _movement_writes(self, transaction):
        return [
            write for write in transaction.sets
            if write[0].path.startswith(f"organizations/{rbac.ORG_ID}/inventory_movements/")
        ]

    def test_import_inventory_reads_movements_with_a_firestore_query(self):
        result, transaction = self._run_import(
            "ADD",
            [{"productId": "product-1", "warehouseId": "wh_tehuacan_1", "quantity": 3}],
            [],
        )

        self.assertFalse(result["idempotent"])
        self.assertEqual(result["movementCount"], 1)

    def test_import_inventory_add_writes_expected_inventory_movement(self):
        result, transaction = self._run_import(
            "ADD",
            [{"productId": "product-1", "warehouseId": "wh_tehuacan_1", "quantity": 3}],
            [{
                "warehouseId": "wh_tehuacan_1",
                "productId": "product-1",
                "direction": "IN",
                "quantity": 5,
            }],
        )

        self.assertFalse(result["idempotent"])
        self.assertEqual(result["movementCount"], 1)
        movement_writes = self._movement_writes(transaction)
        self.assertEqual(len(movement_writes), 1)
        _, movement = movement_writes[0]
        self.assertEqual(movement["direction"], "IN")
        self.assertEqual(movement["quantity"], 3)
        self.assertEqual(movement["movementType"], "ADJUSTMENT")

    def test_import_inventory_replace_writes_expected_inventory_movements(self):
        result, transaction = self._run_import(
            "REPLACE",
            [{"productId": "product-1", "warehouseId": "wh_tehuacan_1", "quantity": 3}],
            [
                {
                    "warehouseId": "wh_tehuacan_1",
                    "productId": "product-1",
                    "direction": "IN",
                    "quantity": 5,
                },
                {
                    "warehouseId": "wh_tehuacan_1",
                    "productId": "product-2",
                    "direction": "IN",
                    "quantity": 4,
                },
            ],
        )

        self.assertFalse(result["idempotent"])
        self.assertEqual(result["movementCount"], 2)
        movement_writes = sorted(
            self._movement_writes(transaction),
            key=lambda write: write[1]["productId"],
        )
        self.assertEqual(len(movement_writes), 2)
        _, product_one_movement = movement_writes[0]
        self.assertEqual(product_one_movement["productId"], "product-1")
        self.assertEqual(product_one_movement["direction"], "OUT")
        self.assertEqual(product_one_movement["quantity"], 2)
        self.assertEqual(product_one_movement["movementType"], "ADJUSTMENT")
        _, product_two_movement = movement_writes[1]
        self.assertEqual(product_two_movement["productId"], "product-2")
        self.assertEqual(product_two_movement["direction"], "OUT")
        self.assertEqual(product_two_movement["quantity"], 4)
        self.assertEqual(product_two_movement["movementType"], "ADJUSTMENT")

    def test_import_inventory_rejects_movement_collection_at_read_limit(self):
        uid = "admin-1"
        warehouse_id = "wh_tehuacan_1"
        documents = {
            f"organizations/{rbac.ORG_ID}/users/{uid}": {
                "userId": uid,
                "organizationId": rbac.ORG_ID,
                "status": "ACTIVE",
                "role": "ADMIN",
                "warehouseId": warehouse_id,
            },
        }
        movements = [
            {
                "warehouseId": warehouse_id,
                "productId": f"product-{index}",
                "direction": "IN",
                "quantity": 1,
            }
            for index in range(rbac.MAX_TRANSACTION_READS + 1)
        ]
        transaction = _Transaction(documents, movements)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid=uid, token={}),
            data={
                "operationId": "import-read-limit-1",
                "mode": "ADD",
                "rows": [{"productId": "product-1", "warehouseId": warehouse_id, "quantity": 3}],
            },
        )

        with (
            patch.object(rbac.firestore, "client", return_value=_Database(documents, transaction)),
            patch.object(rbac.firestore, "transactional", side_effect=lambda callback: callback),
            self.assertRaises(https_fn.HttpsError) as raised,
        ):
            inspect.unwrap(rbac.import_inventory)(request)

        self.assertEqual(raised.exception.code, "resource-exhausted")
        self.assertIn(str(rbac.MAX_TRANSACTION_READS), raised.exception.message)
        self.assertEqual(transaction.sets, [])


class InventoryMovementTimestampTests(unittest.TestCase):
    def test_adjust_inventory_movement_write_includes_created_and_updated_timestamps(self):
        uid = "operator-1"
        warehouse_id = "wh_tehuacan_1"
        product_id = "product-1"
        documents = {
            f"organizations/{rbac.ORG_ID}/users/{uid}": {
                "userId": uid,
                "organizationId": rbac.ORG_ID,
                "status": "ACTIVE",
                "role": "OPERATOR",
                "warehouseId": warehouse_id,
            },
        }
        transaction = _Transaction(documents)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid=uid, token={}),
            data={
                "operationId": "adjust-operation-1",
                "warehouseId": warehouse_id,
                "productId": product_id,
                "movementType": "RECEIPT",
                "quantity": 3,
            },
        )

        with (
            patch.object(rbac.firestore, "client", return_value=_Database(documents, transaction)),
            patch.object(rbac.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            result = inspect.unwrap(rbac.adjust_inventory)(request)

        self.assertFalse(result["idempotent"])
        movement_writes = [
            write for write in transaction.sets
            if write[0].path.startswith(f"organizations/{rbac.ORG_ID}/inventory_movements/")
        ]
        self.assertEqual(len(movement_writes), 1)
        _, movement = movement_writes[0]
        self.assertIn("createdAt", movement)
        self.assertIn("updatedAt", movement)
        self.assertIn("occurredAt", movement)
        self.assertIs(movement["createdAt"], firestore.SERVER_TIMESTAMP)
        self.assertIs(movement["updatedAt"], firestore.SERVER_TIMESTAMP)
        self.assertIs(movement["occurredAt"], firestore.SERVER_TIMESTAMP)

    def test_import_inventory_movement_write_includes_created_and_updated_timestamps(self):
        uid = "admin-1"
        warehouse_id = "wh_tehuacan_1"
        product_id = "product-1"
        documents = {
            f"organizations/{rbac.ORG_ID}/users/{uid}": {
                "userId": uid,
                "organizationId": rbac.ORG_ID,
                "status": "ACTIVE",
                "role": "ADMIN",
                "warehouseId": warehouse_id,
            },
        }
        transaction = _Transaction(documents)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid=uid, token={}),
            data={
                "operationId": "import-operation-1",
                "mode": "REPLACE",
                "rows": [{
                    "productId": product_id,
                    "quantity": 4,
                    "warehouseId": warehouse_id,
                }],
            },
        )

        with (
            patch.object(rbac.firestore, "client", return_value=_Database(documents, transaction)),
            patch.object(rbac.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            result = inspect.unwrap(rbac.import_inventory)(request)

        self.assertFalse(result["idempotent"])
        self.assertEqual(result["movementCount"], 1)
        movement_writes = [
            write for write in transaction.sets
            if write[0].path.startswith(f"organizations/{rbac.ORG_ID}/inventory_movements/")
        ]
        self.assertEqual(len(movement_writes), 1)
        _, movement = movement_writes[0]
        self.assertIn("createdAt", movement)
        self.assertIn("updatedAt", movement)
        self.assertIn("occurredAt", movement)
        self.assertIs(movement["createdAt"], firestore.SERVER_TIMESTAMP)
        self.assertIs(movement["updatedAt"], firestore.SERVER_TIMESTAMP)
        self.assertIs(movement["occurredAt"], firestore.SERVER_TIMESTAMP)


if __name__ == "__main__":
    unittest.main()
