import inspect
import unittest
from importlib.metadata import version

from google.cloud.firestore_v1.client import Client

from firestore_transactions import read_document, read_documents


class FirestoreSdkContractTests(unittest.TestCase):
    def test_client_get_all_returns_a_generator(self):
        # The shared helper supports both SDK result shapes, but this contract
        # makes an SDK change visible in CI instead of breaking production silently.
        self.assertTrue(inspect.isgeneratorfunction(Client.get_all))

    def test_installed_firestore_sdk_matches_the_pinned_version(self):
        self.assertEqual(version("google-cloud-firestore"), "2.32.0")


class FirestoreTransactionHelperTests(unittest.TestCase):
    class _Transaction:
        def __init__(self, result):
            self.result = result

        def get(self, _reference):
            return self.result

    def test_read_document_returns_snapshot_from_generator(self):
        snapshot = object()

        result = read_document(
            self._Transaction((item for item in [snapshot])),
            "reference",
        )

        self.assertIs(result, snapshot)

    def test_read_document_returns_none_for_empty_generator(self):
        result = read_document(
            self._Transaction((item for item in [])),
            "reference",
        )

        self.assertIsNone(result)

    def test_read_document_supports_direct_snapshot(self):
        class Snapshot:
            exists = True

        snapshot = Snapshot()

        result = read_document(self._Transaction(snapshot), "reference")

        self.assertIs(result, snapshot)

    def test_read_documents_materializes_generator(self):
        snapshots = [object(), object()]

        result = read_documents(
            self._Transaction((item for item in snapshots)),
            "query",
        )

        self.assertEqual(result, snapshots)

    def test_read_documents_supports_direct_snapshot(self):
        class Snapshot:
            exists = True

        snapshot = Snapshot()

        result = read_documents(self._Transaction(snapshot), "query")

        self.assertEqual(result, [snapshot])
