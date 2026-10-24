import unittest
from unittest.mock import Mock

from google.api_core.exceptions import AlreadyExists

from membership_provisioning import provision_new_user_membership


class MembershipProvisioningTest(unittest.TestCase):
    def test_creates_active_manager_membership_for_both_warehouses(self):
        document = Mock()
        database = Mock()
        database.document.return_value = document

        result = provision_new_user_membership(database, "new-user")

        self.assertEqual(result, "created")
        database.document.assert_called_once_with("organizations/org_exepa_001/users/new-user")
        document.create.assert_called_once()
        membership = document.create.call_args.args[0]
        self.assertEqual(membership["userId"], "new-user")
        self.assertEqual(membership["organizationId"], "org_exepa_001")
        self.assertEqual(membership["role"], "GERENTE_ALMACEN")
        self.assertEqual(membership["status"], "ACTIVE")
        self.assertIsNone(membership["warehouseId"])
        self.assertEqual(membership["warehouseIds"], ["wh_tehuacan_1", "wh_tehuacan_2"])
        self.assertIn("createdAt", membership)

    def test_never_overwrites_an_existing_membership(self):
        document = Mock()
        document.create.side_effect = AlreadyExists("already provisioned")
        database = Mock()
        database.document.return_value = document

        result = provision_new_user_membership(database, "existing-user")

        self.assertEqual(result, "existing")
        document.create.assert_called_once()

    def test_rejects_empty_uid_without_writing(self):
        database = Mock()

        with self.assertRaisesRegex(ValueError, "user ID"):
            provision_new_user_membership(database, " ")

        database.document.assert_not_called()


if __name__ == "__main__":
    unittest.main()
