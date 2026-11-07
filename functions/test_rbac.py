import unittest

from firebase_functions import https_fn

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


if __name__ == "__main__":
    unittest.main()
