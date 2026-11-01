import unittest

from firebase_functions import https_fn

from rbac import _validate_inventory_import_write_count


class InventoryImportTransactionBudgetTests(unittest.TestCase):
    def test_import_allows_at_most_499_movement_writes_plus_operation_record(self):
        _validate_inventory_import_write_count(499)
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_inventory_import_write_count(500)
        self.assertEqual(raised.exception.code, "resource-exhausted")


if __name__ == "__main__":
    unittest.main()
