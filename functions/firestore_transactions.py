"""Shared helpers for reading documents and queries inside Firestore transactions."""


def read_document(transaction, reference):
    """Read one document inside a Firestore transaction.

    The Python SDK returns a generator from Transaction.get() for document
    references and for queries, so the result must be materialized before it
    is inspected.
    """
    result = transaction.get(reference)
    if hasattr(result, "exists"):
        return result
    return next(iter(result), None)


def read_documents(transaction, query):
    """Read every document a transaction query matches.

    Transaction query results are generators in the Python SDK, so callers
    must materialize them before applying operations such as len().
    """
    result = transaction.get(query)
    if hasattr(result, "exists"):
        return [result] if result.exists else []
    return list(result)
