"""Server-authoritative default membership provisioning for new Auth users."""

from google.api_core.exceptions import AlreadyExists

from firebase_admin import firestore, get_app, initialize_app

from firebase_functions import identity_fn

try:
    get_app()
except ValueError:
    initialize_app()


ORG_ID = "org_exepa_001"
DEFAULT_WAREHOUSE_IDS = ["wh_tehuacan_1", "wh_tehuacan_2"]


def provision_new_user_membership(database, uid: str) -> str:
    """Create the default active membership without overwriting any record."""
    if not isinstance(uid, str) or not uid.strip():
        raise ValueError("A non-empty user ID is required")

    reference = database.document(f"organizations/{ORG_ID}/users/{uid}")
    membership = {
        "userId": uid,
        "organizationId": ORG_ID,
        "role": "GERENTE_ALMACEN",
        "status": "ACTIVE",
        "warehouseId": None,
        "warehouseIds": DEFAULT_WAREHOUSE_IDS,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }

    try:
        reference.create(membership)
    except AlreadyExists:
        return "existing"
    return "created"


@identity_fn.before_user_created(region="us-central1")
def provision_membership_before_auth_user_created(event: identity_fn.AuthBlockingEvent):
    """Provision before Auth creates the account, for password and social signups.

    This implements the requested open-signup policy: every newly created
    account receives manager access to both warehouses. Firebase Auth blocking
    functions require the project to use Identity Platform.
    """
    provision_new_user_membership(firestore.client(), event.data.uid)
