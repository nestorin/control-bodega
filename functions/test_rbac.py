import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from firebase_admin import firestore
from firebase_functions import https_fn

import rbac
from rbac import _membership, _validate_inventory_import_write_count


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
        self.sets = []
        self.updates = []

    def get(self, reference):
        if isinstance(reference, _Collection):
            return list(self._movements)
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
