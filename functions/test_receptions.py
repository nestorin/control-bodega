import unittest

from firebase_functions import https_fn

from receptions import (
    _canonical_warehouse_id,
    _digest,
    _operation_result,
    _normalize_planned_pallets,
    _iso_expiry,
    _validate_capture_ready,
    _validate_planned_scan,
    _transaction_snapshot,
    _validate_operation_id,
)


class ReceptionCommandContractTests(unittest.TestCase):
    def test_digest_is_stable_for_key_order(self):
        self.assertEqual(_digest({"b": 2, "a": 1}), _digest({"a": 1, "b": 2}))

    def test_legacy_warehouse_alias_is_canonicalized(self):
        self.assertEqual(_canonical_warehouse_id("alm_norte"), "wh_tehuacan_1")

    def test_operation_id_bounds_are_enforced(self):
        self.assertEqual(_validate_operation_id("receipt_01"), "receipt_01")
        self.assertEqual(_validate_operation_id("receipt_01:0"), "receipt_01:0")
        with self.assertRaises(https_fn.HttpsError):
            _validate_operation_id("x" * 129)
        with self.assertRaises(https_fn.HttpsError):
            _validate_operation_id("receipt/01")

    def test_replay_requires_same_kind_and_payload(self):
        class Snapshot:
            def to_dict(self):
                return {"kind": "create_reception", "payloadDigest": "digest", "result": {"receptionId": "r"}}

        self.assertEqual(_operation_result(Snapshot(), "create_reception", "digest"), {"receptionId": "r"})
        with self.assertRaises(https_fn.HttpsError):
            _operation_result(Snapshot(), "confirm", "digest")

    def test_transaction_snapshot_supports_single_snapshot_and_iterable_apis(self):
        class Snapshot:
            exists = True

        class Transaction:
            def __init__(self, result):
                self.result = result

            def get(self, _reference):
                return self.result

        snapshot = Snapshot()
        self.assertIs(_transaction_snapshot(Transaction(snapshot), "ref"), snapshot)
        self.assertIs(_transaction_snapshot(Transaction(iter([snapshot])), "ref"), snapshot)
        self.assertIsNone(_transaction_snapshot(Transaction(iter([])), "ref"))

    def test_planned_pallets_bind_assignments_to_stable_reception_qr_ids(self):
        lines = [
            {"productId": "prod-1", "quantity": 25, "unit": "cajas"},
            {"productId": "prod-2", "quantity": 6, "unit": "cajas"},
        ]
        requested = [
            {
                "palletNumber": 1,
                "lineIndex": 0,
                "productId": "prod-1",
                "productName": "Agua mineral",
                "quantity": 20,
                "unit": "cajas",
            },
            {
                "palletNumber": 2,
                "lineIndex": 0,
                "productId": "prod-1",
                "productName": "Agua mineral",
                "quantity": 5,
                "unit": "cajas",
            },
            {
                "palletNumber": 3,
                "lineIndex": 1,
                "productId": "prod-2",
                "productName": "Cereal",
                "quantity": 6,
                "unit": "cajas",
            },
        ]

        result = _normalize_planned_pallets("reception-op-20261024", lines, requested)

        self.assertEqual(
            [pallet["qrIdentifier"] for pallet in result],
            [
                "TQR-reception-op-20261024-001",
                "TQR-reception-op-20261024-002",
                "TQR-reception-op-20261024-003",
            ],
        )
        self.assertEqual([pallet["productId"] for pallet in result], ["prod-1", "prod-1", "prod-2"])
        self.assertEqual([pallet["quantity"] for pallet in result], [20, 5, 6])
        self.assertEqual(result[0]["status"], "PLANNED")
        self.assertFalse(result[0]["activated"])
        self.assertEqual(result[0]["receptionId"], "reception-op-20261024")
        self.assertEqual(result[0]["palletId"], "pallet-reception-op-20261024-001")

    def test_scan_accepts_only_planned_or_in_capture_qr_for_this_reception(self):
        planned = {"qrIdentifier": "TQR-reception-1-001", "status": "PLANNED", "activated": False}
        reception = {"status": "IN_PROGRESS", "plannedPallets": [planned]}
        self.assertIs(_validate_planned_scan(reception, planned["qrIdentifier"]), planned)
        with self.assertRaises(https_fn.HttpsError):
            _validate_planned_scan(reception, "TQR-reception-2-001")

    def test_scan_rejects_active_qr(self):
        with self.assertRaises(https_fn.HttpsError):
            _validate_planned_scan(
                {"status": "IN_PROGRESS", "plannedPallets": [{
                    "qrIdentifier": "TQR-reception-1-001", "status": "ACTIVE", "activated": True,
                }]},
                "TQR-reception-1-001",
            )

    def test_activation_requires_saved_lot_and_expiry_checkpoint(self):
        checkpoint = {"lot": "LT-1", "expiryDate": "2027-03-15"}
        self.assertEqual(_validate_capture_ready(checkpoint, "LT-1", "2027-03-15"), ("LT-1", "2027-03-15"))
        with self.assertRaises(https_fn.HttpsError):
            _validate_capture_ready(checkpoint, "LT-2", "2027-03-15")
        with self.assertRaises(https_fn.HttpsError):
            _validate_capture_ready({"lot": "LT-1"}, "LT-1", "2027-03-15")

    def test_expiry_uses_iso_calendar_date(self):
        self.assertEqual(_iso_expiry("2027-03-15", required=True), "2027-03-15")
        for value in ("15/03/2027", "2027-02-30", "2027-03"):
            with self.subTest(value=value), self.assertRaises(https_fn.HttpsError):
                _iso_expiry(value, required=True)

    def test_planned_pallet_quantity_must_reconcile_to_reception_lines(self):
        with self.assertRaises(https_fn.HttpsError):
            _normalize_planned_pallets(
                "reception-op-20261024",
                [{"productId": "prod-1", "quantity": 20, "unit": "cajas"}],
                [{
                    "palletNumber": 1,
                    "lineIndex": 0,
                    "productId": "prod-1",
                    "productName": "Agua mineral",
                    "quantity": 19,
                    "unit": "cajas",
                }],
            )

    def test_planned_pallet_number_rejects_bool_and_float(self):
        base = {
            "lineIndex": 0,
            "productId": "prod-1",
            "productName": "Agua mineral",
            "quantity": 1,
            "unit": "cajas",
        }
        for invalid_number in (True, 1.0):
            with self.subTest(palletNumber=invalid_number):
                with self.assertRaises(https_fn.HttpsError):
                    _normalize_planned_pallets(
                        "reception-op-20261024",
                        [{"productId": "prod-1", "quantity": 1, "unit": "cajas"}],
                        [{**base, "palletNumber": invalid_number}],
                    )


if __name__ == "__main__":
    unittest.main()
