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


class _Snapshot:
    def __init__(self, data=None, reference=None):
        self.exists = data is not None
        self._data = data
        self.reference = reference

    def to_dict(self):
        return self._data


class _Reference:
    def __init__(self, path):
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    def collection(self, collection_id):
        return _Collection(f"{self.path}/{collection_id}")

    def document(self, document_id=None):
        return _Reference(f"{self.path}/{document_id or 'generated'}")


class _Collection:
    def __init__(self, path):
        self.path = path

    def document(self, document_id=None):
        return _Reference(f"{self.path}/{document_id or 'generated'}")

    def where(self, *_args):
        return _Query(self.path)


class _CollectionGroup:
    def __init__(self, group_id):
        self.path = group_id

    def where(self, *_args):
        return _Query(self.path)


class _Query:
    def __init__(self, path):
        self.path = path

    def where(self, *_args):
        return self

    def limit(self, _count):
        return self


class _Transaction:
    def __init__(self, documents, queries):
        self.documents = documents
        self.queries = queries
        self.sets = []
        self.updates = []

    def get(self, reference):
        if isinstance(reference, _Query):
            return list(self.queries.get(reference.path, []))
        return self.documents.get(reference.path, _Snapshot())

    def set(self, reference, data, **_kwargs):
        self.sets.append((reference, data))

    def update(self, reference, data):
        self.updates.append((reference, data))


class _Database:
    def __init__(self, transaction):
        self._transaction = transaction

    def document(self, path):
        return _Reference(path)

    def collection(self, collection_id):
        return _Collection(collection_id)

    def collection_group(self, group_id):
        return _CollectionGroup(group_id)

    def transaction(self):
        return self._transaction


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
        org_id = shipments.ORG_ID
        shipment_id = "shipment-1"
        warehouse_id = "wh_tehuacan_1"
        product_id = "product-1"
        pallet_id = "pallet-1"
        documents = {
            f"organizations/{org_id}/users/operator-1": _Snapshot({
                "userId": "operator-1",
                "organizationId": org_id,
                "status": "ACTIVE",
                "role": "OPERATOR",
                "warehouseId": warehouse_id,
            }),
            f"organizations/{org_id}/shipments/{shipment_id}": _Snapshot({
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
                _Snapshot({"direction": "IN", "quantity": 5}),
            ],
            "pallets": [
                _Snapshot(
                    {"id": pallet_id, "productId": product_id},
                    _Reference(f"organizations/{org_id}/pallets/{pallet_id}"),
                ),
            ],
        }
        transaction = _Transaction(documents, queries)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid="operator-1"),
            data={"shipmentId": shipment_id, "operationId": "shipment-operation-1"},
        )

        with (
            patch.object(shipments.firestore, "client", return_value=_Database(transaction)),
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


class ShipmentSuperAdminMembershipTests(unittest.TestCase):
    """Regression coverage for SUPER_ADMIN as a real Firestore membership role."""

    def _confirm_shipment_for_member(self, member, warehouse_id, uid):
        org_id = shipments.ORG_ID
        shipment_id = "shipment-1"
        product_id = "product-1"
        pallet_id = "pallet-1"
        documents = {
            f"organizations/{org_id}/users/{uid}": _Snapshot({
                "userId": uid,
                "organizationId": org_id,
                "status": "ACTIVE",
                **member,
            }),
            f"organizations/{org_id}/shipments/{shipment_id}": _Snapshot({
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
                _Snapshot({"direction": "IN", "quantity": 5}),
            ],
            "pallets": [
                _Snapshot(
                    {"id": pallet_id, "productId": product_id},
                    _Reference(f"organizations/{org_id}/pallets/{pallet_id}"),
                ),
            ],
        }
        transaction = _Transaction(documents, queries)
        request = SimpleNamespace(
            auth=SimpleNamespace(uid=uid),
            data={"shipmentId": shipment_id, "operationId": "shipment-operation-1"},
        )

        with (
            patch.object(shipments.firestore, "client", return_value=_Database(transaction)),
            patch.object(shipments.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            result = inspect.unwrap(shipments.confirm_shipment)(request)

        return result

    def test_confirm_shipment_accepts_a_super_admin_membership(self):
        result = self._confirm_shipment_for_member(
            {"role": "SUPER_ADMIN", "warehouseId": "wh_tehuacan_1"},
            "wh_tehuacan_1",
            "super-admin-1",
        )

        self.assertEqual(result["shipmentId"], "shipment-1")
        self.assertEqual(result["status"], "COMPLETED")
        self.assertFalse(result["idempotent"])

    def test_confirm_shipment_accepts_a_super_admin_membership_without_single_warehouse_id(self):
        result = self._confirm_shipment_for_member(
            {
                "role": "SUPER_ADMIN",
                "warehouseIds": ["wh_tehuacan_1", "wh_tehuacan_2"],
            },
            "wh_tehuacan_1",
            "super-admin-2",
        )

        self.assertEqual(result["shipmentId"], "shipment-1")
        self.assertEqual(result["status"], "COMPLETED")
        self.assertFalse(result["idempotent"])

    def test_confirm_shipment_accepts_a_super_admin_membership_without_any_warehouse_scope(self):
        for warehouse_id in ("wh_tehuacan_1", "wh_tehuacan_2"):
            with self.subTest(warehouse_id=warehouse_id):
                result = self._confirm_shipment_for_member(
                    {"role": "SUPER_ADMIN"},
                    warehouse_id,
                    "super-admin-3",
                )

                self.assertEqual(result["shipmentId"], "shipment-1")
                self.assertEqual(result["status"], "COMPLETED")
                self.assertFalse(result["idempotent"])

    def test_confirm_shipment_denies_a_scoped_membership_outside_its_warehouse(self):
        with self.assertRaises(https_fn.HttpsError) as raised:
            self._confirm_shipment_for_member(
                {"role": "OPERATOR", "warehouseId": "wh_tehuacan_1"},
                "wh_tehuacan_2",
                "operator-1",
            )

        self.assertEqual(raised.exception.code, "permission-denied")
        self.assertEqual(raised.exception.message, "Warehouse access denied")

    def test_confirm_shipment_accepts_a_membership_scoped_through_warehouse_ids(self):
        result = self._confirm_shipment_for_member(
            {
                "role": "OPERATOR",
                "warehouseId": "wh_tehuacan_2",
                "warehouseIds": ["wh_tehuacan_1"],
            },
            "wh_tehuacan_1",
            "operator-2",
        )

        self.assertEqual(result["shipmentId"], "shipment-1")
        self.assertEqual(result["status"], "COMPLETED")
        self.assertFalse(result["idempotent"])


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
