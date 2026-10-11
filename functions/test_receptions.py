import unittest

from firebase_functions import https_fn

from receptions import _canonical_warehouse_id, _digest, _operation_result, _validate_operation_id


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


if __name__ == "__main__":
    unittest.main()
