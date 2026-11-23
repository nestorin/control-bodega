import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from firebase_functions import https_fn

import labeling


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

    def collection(self, collection_id):
        return _Collection(f"{self.path}/{collection_id}", self._documents)

    def get(self):
        return _Snapshot(self._documents.get(self.path))


class _Query:
    def __init__(self, path, filters):
        self.path = path
        self.filters = filters


class _Collection:
    def __init__(self, path, documents):
        self.path = path
        self._documents = documents
        self._sequence = 0

    def document(self, document_id=None):
        if document_id is None:
            self._sequence += 1
            document_id = f"generated-{self._sequence}"
        return _Reference(f"{self.path}/{document_id}", self._documents)

    def where(self, field_path, op_string, value):
        return _Query(self.path, [(field_path, op_string, value)])


class _Transaction:
    def __init__(self, documents):
        self.documents = documents
        self.sets = []
        self.updates = []

    def get(self, reference):
        if isinstance(reference, _Query):
            for path, data in self.documents.items():
                if path.startswith(f"{reference.path}/") and all(
                    op_string == "==" and data.get(field_path) == value
                    for field_path, op_string, value in reference.filters
                ):
                    yield _Snapshot(data)
            return
        data = self.documents.get(reference.path)
        yield _Snapshot(data)

    def set(self, reference, data):
        self.sets.append((reference, data))
        self.documents[reference.path] = data

    def update(self, reference, data):
        self.updates.append((reference.path, data))
        self.documents[reference.path] = {**self.documents[reference.path], **data}


class _Database:
    def __init__(self, documents):
        self.documents = documents
        self.transaction_value = _Transaction(documents)

    def collection(self, collection_id):
        return _Collection(collection_id, self.documents)

    def document(self, path):
        return _Reference(path, self.documents)

    def transaction(self):
        return self.transaction_value


class CreateBatchCallableTests(unittest.TestCase):
    def setUp(self):
        self.uid = "pilot-supervisor"
        self.documents = {
            f"organizations/{labeling.ORG_ID}/users/{self.uid}": {
                "userId": self.uid,
                "organizationId": labeling.ORG_ID,
                "status": "ACTIVE",
                "role": "SUPERVISOR",
                "warehouseId": labeling.PILOT_WAREHOUSE_ID,
            }
        }
        self.database = _Database(self.documents)

    def payload(self, **overrides):
        payload = {
            "warehouseId": labeling.PILOT_WAREHOUSE_ID,
            "idempotencyKey": "123e4567-e89b-12d3-a456-426614174000",
            "labelingCompanyId": "labeling-co-1",
            "labelingCompanyName": "Labeling Co",
            "receiverName": "Receiver Name",
            "deliveredByName": "Warehouse Driver",
            "lines": [{
                "trackingKey": "product-1|LOT-1|2027-01-01",
                "productId": "product-1",
                "productSnapshot": {"id": "product-1", "sku": "SKU-1", "name": "Product One"},
                "lotKey": "LOT-1",
                "lotSnapshot": "LOT-1",
                "expiryKey": "2027-01-01",
                "expiryDate": "2027-01-01",
                "estimatedBoxes": 10,
                "estimatedPallets": 1,
            }],
        }
        payload.update(overrides)
        return payload

    def request(self, payload):
        return SimpleNamespace(auth=SimpleNamespace(uid=self.uid, token={}), data=payload)

    def invoke(self, payload):
        with (
            patch.object(labeling.firestore, "client", return_value=self.database),
            patch.object(labeling.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            return inspect.unwrap(labeling.createBatch)(self.request(payload))

    def test_rejects_warehouse_outside_pilot_scope(self):
        with self.assertRaises(https_fn.HttpsError) as raised:
            self.invoke(self.payload(warehouseId="wh_tehuacan_1"))

        self.assertEqual(raised.exception.code, "permission-denied")
        self.assertEqual(self.database.transaction_value.sets, [])

    def test_requires_uuid_idempotency_key(self):
        with self.assertRaises(https_fn.HttpsError) as raised:
            self.invoke(self.payload(idempotencyKey=None))

        self.assertEqual(raised.exception.code, "invalid-argument")
        self.assertEqual(raised.exception.message, "idempotencyKey is invalid")
        self.assertEqual(self.database.transaction_value.sets, [])

    def test_reuses_matching_idempotency_key_without_duplicate_writes(self):
        first = self.invoke(self.payload())
        writes_after_first = len(self.database.transaction_value.sets)

        repeated = self.invoke(self.payload())

        self.assertFalse(first["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertEqual(repeated["batchId"], first["batchId"])
        self.assertEqual(len(self.database.transaction_value.sets), writes_after_first)

    def test_rejects_changed_payload_for_existing_idempotency_key(self):
        self.invoke(self.payload())

        with self.assertRaises(https_fn.HttpsError) as raised:
            self.invoke(self.payload(receiverName="Different Receiver"))

        self.assertEqual(raised.exception.code, "already-exists")
        self.assertEqual(raised.exception.message, "IDEMPOTENCY_KEY_REUSED")

    def test_creates_draft_batch_lines_audit_and_idempotency_receipt(self):
        result = self.invoke(self.payload())

        self.assertEqual(result, {
            "batchId": "generated-1",
            "correlationId": "generated-1",
            "version": 1,
            "idempotent": False,
        })
        writes = {reference.path: data for reference, data in self.database.transaction_value.sets}
        batch = writes[f"organizations/{labeling.ORG_ID}/labelingBatches/generated-1"]
        self.assertEqual(batch["status"], "draft")
        self.assertEqual(batch["version"], 1)
        self.assertEqual(batch["estimatedTotals"], {"boxes": 10, "pallets": 1})
        self.assertEqual(batch["createdBy"], self.uid)
        self.assertIn(
            f"organizations/{labeling.ORG_ID}/labelingBatches/generated-1/lines/generated-1",
            writes,
        )
        self.assertIn(
            f"organizations/{labeling.ORG_ID}/auditEvents/generated-1",
            writes,
        )
        receipt = writes[
            f"organizations/{labeling.ORG_ID}/labelingIdempotency/123e4567-e89b-12d3-a456-426614174000"
        ]
        self.assertEqual(receipt["operation"], "createBatch")
        self.assertEqual(receipt["resourceId"], result["batchId"])


if __name__ == "__main__":
    unittest.main()

class AddBatchLineCallableTests(unittest.TestCase):
    def setUp(self):
        self.uid = "pilot-supervisor"
        self.batch_id = "batch-1"
        self.batch_path = f"organizations/{labeling.ORG_ID}/labelingBatches/{self.batch_id}"
        self.documents = {
            f"organizations/{labeling.ORG_ID}/users/{self.uid}": {
                "userId": self.uid,
                "organizationId": labeling.ORG_ID,
                "status": "ACTIVE",
                "role": "SUPERVISOR",
                "warehouseId": labeling.PILOT_WAREHOUSE_ID,
            },
            self.batch_path: {
                "organizationId": labeling.ORG_ID,
                "warehouseId": labeling.PILOT_WAREHOUSE_ID,
                "status": "draft",
                "version": 1,
                "estimatedTotals": {"boxes": 0, "pallets": 0},
            },
        }
        self.database = _Database(self.documents)

    def payload(self, **overrides):
        payload = {
            "requestId": "123e4567-e89b-12d3-a456-426614174001",
            "batchId": self.batch_id,
            "expectedVersion": 1,
            "line": {
                "trackingKey": "product-2|LOT-2|2027-02-01",
                "productId": "product-2",
                "productSnapshot": {"id": "product-2", "sku": "SKU-2", "name": "Product Two"},
                "lotKey": "LOT-2",
                "lotSnapshot": "LOT-2",
                "expiryKey": "2027-02-01",
                "expiryDate": "2027-02-01",
                "estimatedBoxes": 20,
                "estimatedPallets": 2,
            },
        }
        payload.update(overrides)
        return payload

    def request(self, payload):
        return SimpleNamespace(auth=SimpleNamespace(uid=self.uid, token={}), data=payload)

    def invoke(self, payload):
        with (
            patch.object(labeling.firestore, "client", return_value=self.database),
            patch.object(labeling.firestore, "transactional", side_effect=lambda callback: callback),
        ):
            return inspect.unwrap(labeling.addBatchLine)(self.request(payload))

    def test_adds_line_updates_version_and_writes_audit(self):
        result = self.invoke(self.payload())

        self.assertEqual(result, {
            "batchId": self.batch_id,
            "lineId": "generated-1",
            "correlationId": self.batch_id,
            "version": 2,
            "idempotent": False,
        })
        self.assertEqual(self.database.transaction_value.updates, [(
            self.batch_path,
            {
                "estimatedTotals": {"boxes": 20, "pallets": 2},
                "version": 2,
                "updatedAt": labeling.firestore.SERVER_TIMESTAMP,
            },
        )])
        writes = {reference.path: data for reference, data in self.database.transaction_value.sets}
        line = writes[f"{self.batch_path}/lines/generated-1"]
        self.assertEqual(line["batchId"], self.batch_id)
        self.assertEqual(line["trackingKey"], "product-2|LOT-2|2027-02-01")
        audit = writes[f"organizations/{labeling.ORG_ID}/auditEvents/generated-1"]
        self.assertEqual(audit["action"], "ADD_LINE")
        self.assertEqual(audit["actorUserId"], self.uid)

    def test_rejects_missing_batch(self):
        self.documents.pop(self.batch_path)

        with self.assertRaises(https_fn.HttpsError) as raised:
            self.invoke(self.payload())

        self.assertEqual(raised.exception.code, "not-found")
        self.assertEqual(self.database.transaction_value.sets, [])

    def test_rejects_non_draft_batch(self):
        self.documents[self.batch_path]["status"] = "planned"

        with self.assertRaises(https_fn.HttpsError) as raised:
            self.invoke(self.payload())

        self.assertEqual(raised.exception.code, "failed-precondition")
        self.assertEqual(raised.exception.message, "Batch is not draft")

    def test_reuses_matching_request_id_without_duplicate_writes(self):
        first = self.invoke(self.payload())
        writes_after_first = len(self.database.transaction_value.sets)
        updates_after_first = len(self.database.transaction_value.updates)

        repeated = self.invoke(self.payload())

        self.assertFalse(first["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertEqual(repeated["lineId"], first["lineId"])
        self.assertEqual(len(self.database.transaction_value.sets), writes_after_first)
        self.assertEqual(len(self.database.transaction_value.updates), updates_after_first)

    def test_rejects_member_without_pilot_warehouse_scope(self):
        self.documents[f"organizations/{labeling.ORG_ID}/users/{self.uid}"]["warehouseId"] = "wh_tehuacan_1"

        with self.assertRaises(https_fn.HttpsError) as raised:
            self.invoke(self.payload())

        self.assertEqual(raised.exception.code, "permission-denied")
        self.assertEqual(self.database.transaction_value.sets, [])
