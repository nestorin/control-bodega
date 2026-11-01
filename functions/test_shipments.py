import unittest

from firebase_functions import https_fn

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


if __name__ == "__main__":
    unittest.main()
