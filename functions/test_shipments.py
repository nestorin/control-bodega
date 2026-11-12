import importlib
import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from firebase_admin import firestore
from firebase_functions import https_fn

import shipments
from shipments import (
    _claim_scanned_pallets,
    _validate_completion_status,
    _validate_scanned_pallet_products,
)


class ShipmentCompletionValidationTests(unittest.TestCase):
    def test_only_in_progress_shipments_can_be_completed(self):
        _validate_completion_status("IN_PROGRESS")
        for status in ("PROGRAMMED", "COMPLETED", "CANCELLED", None):
            with self.subTest(status=status):
                with self.assertRaises(https_fn.HttpsError) as raised:
                    _validate_completion_status(status)
                self.assertEqual(raised.exception.code, "failed-precondition")

    def test_scanned_pallet_product_must_match_its_shipment_line(self):
        lines = [{"productId": "product-1", "palletsScanned": ["pallet-1"]}]
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_scanned_pallet_products(
                lines, {"pallet-1": {"id": "pallet-1", "productId": "product-2"}}
            )
        self.assertEqual(raised.exception.code, "failed-precondition")

    def test_matching_scanned_pallet_product_is_accepted(self):
        _validate_scanned_pallet_products(
            [{"productId": "product-1", "palletsScanned": ["pallet-1"]}],
            {"pallet-1": {"id": "pallet-1", "productId": "product-1"}},
        )

    def test_second_shipment_cannot_claim_a_pallet_already_claimed_by_another(self):
        class Transaction:
            def __init__(self):
                self.updates = []

            def update(self, reference, data):
                self.updates.append((reference, data))

        transaction = Transaction()
        with self.assertRaises(https_fn.HttpsError) as raised:
            _claim_scanned_pallets(
                transaction,
                [{"palletsScanned": ["pallet-1"]}],
                {"pallet-1": {"shipmentId": "shipment-1"}},
                {"pallet-1": "pallet-reference"},
                "shipment-2",
            )

        self.assertEqual(raised.exception.code, "failed-precondition")
        self.assertEqual(transaction.updates, [])

    def test_first_shipment_atomically_marks_an_unclaimed_pallet(self):
        class Transaction:
            def __init__(self):
                self.updates = []

            def update(self, reference, data):
                self.updates.append((reference, data))

        transaction = Transaction()
        _claim_scanned_pallets(
            transaction,
            [{"palletsScanned": ["pallet-1"]}],
            {"pallet-1": {}},
            {"pallet-1": "pallet-reference"},
            "shipment-1",
        )
        self.assertEqual(
            transaction.updates,
            [("pallet-reference", {"shipmentId": "shipment-1"})],
        )


class ShipmentMovementTimestampTests(unittest.TestCase):
    def test_confirm_shipment_movement_write_includes_required_timestamps(self):
        class Snapshot:
            def __init__(self, data=None, reference=None):
                self.exists = data is not None
                self._data = data
                self.reference = reference

            def to_dict(self):
                return self._data

        class Reference:
            def __init__(self, path):
                self.path = path
                self.id = path.rsplit("/", 1)[-1]

            def collection(self, collection_id):
                return Collection(f"{self.path}/{collection_id}")

            def document(self, document_id=None):
                return Reference(f"{self.path}/{document_id or 'generated'}")

        class Collection:
            def __init__(self, path):
                self.path = path

            def document(self, document_id=None):
                return Reference(f"{self.path}/{document_id or 'generated'}")

            def where(self, *_args):
                return Query(self.path)

        class CollectionGroup:
            def __init__(self, group_id):
                self.path = group_id

            def where(self, *_args):
                return Query(self.path)

        class Query:
            def __init__(self, path):
                self.path = path

            def where(self, *_args):
                return self

            def limit(self, _count):
                return self

        class Transaction:
            def __init__(self, documents, queries):
                self.documents = documents
                self.queries = queries
                self.sets = []
                self.updates = []

            def get(self, reference):
                if isinstance(reference, Query):
                    return list(self.queries.get(reference.path, []))
                return self.documents.get(reference.path, Snapshot())

            def set(self, reference, data, **_kwargs):
                self.sets.append((reference, data))

            def update(self, reference, data):
                self.updates.append((reference, data))

        class Database:
            def __init__(self, transaction):
                self._transaction = transaction

            def document(self, path):
                return Reference(path)

            def collection(self, collection_id):
                return Collection(collection_id)

            def collection_group(self, group_id):
                return CollectionGroup(group_id)

            def transaction(self):
                return self._transaction

        org_id = shipments.ORG_ID
        shipment_id = "shipment-1"
        warehouse_id = "wh_tehuacan_1"
        product_id = "product-1"
        pallet_id = "pallet-1"
        documents = {
            f"organizations/{org_id}/users/operator-1": Snapshot({
                "userId": "operator-1",
                "organizationId": org_id,
                "status": "ACTIVE",
                "role": "OPERATOR",
                "warehouseId": warehouse_id,
            }),
            f"organizations/{org_id}/shipments/{shipment_id}": Snapshot({
                "organizationId": org_id,
                "warehouseId": warehouse_id,
                "status": "IN_PROGRESS",
                "lines": [{
                    "productId": product_id,
                    "quantity": 1,
                    "unit": "pallet",
                    "palletsScanned": [pallet_id],
                }],
            }),
        }
        queries = {
            f"organizations/{org_id}/inventory_movements": [
                Snapshot({"direction": "IN", "quantity": 5}),
            ],
            "pallets": [
                Snapshot(
                    {"id": pallet_id, "productId": product_id},
                    Reference(f"organizations/{org_id}/pallets/{pallet_id}"),
                ),
            ],
        }
        transaction = Transaction(documents, queries)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid="operator-1"),
            data={"shipmentId": shipment_id, "operationId": "shipment-operation-1"},
        )

        with (
            patch.object(shipments.firestore, "client", return_value=Database(transaction)),
            patch.object(shipments.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            result = inspect.unwrap(shipments.confirm_shipment)(request)

        self.assertFalse(result["idempotent"])
        movement_writes = [
            write for write in transaction.sets
            if write[0].path.startswith(f"organizations/{org_id}/inventory_movements/")
        ]
        self.assertEqual(len(movement_writes), 1)
        _, movement = movement_writes[0]
        self.assertIn("createdAt", movement)
        self.assertIn("updatedAt", movement)
        self.assertIn("occurredAt", movement)
        self.assertIs(movement["createdAt"], firestore.SERVER_TIMESTAMP)
        self.assertIs(movement["updatedAt"], firestore.SERVER_TIMESTAMP)
        self.assertIs(movement["occurredAt"], firestore.SERVER_TIMESTAMP)


class ShipmentModuleInitializationTests(unittest.TestCase):
    def test_reimporting_the_module_does_not_fail_when_the_default_app_exists(self):
        import firebase_admin

        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app()

        # The module must guard its app initialization: a bare initialize_app()
        # raises ValueError when another module already created the default app.
        importlib.reload(shipments)
        importlib.reload(shipments)


if __name__ == "__main__":
    unittest.main()
