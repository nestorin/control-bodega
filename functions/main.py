# functions/main.py - Entry point para Firebase Functions Gen2 (Python)
# Re-exporta las funciones desde el módulo ocr

from ocr.main import health
from ocr.main_secure import extract_ocr_secure
from shipments import confirm_shipment
from rbac import adjust_inventory, import_inventory, update_membership
from membership_provisioning import provision_membership_before_auth_user_created
from receptions import (
    confirm_reception,
    create_reception,
    edit_reception,
    register_reception_pallet,
    save_evidence,
    save_reception_pallet_capture,
    validate_reception_pallet_scan,
)

# Firebase Functions Gen2 detecta automáticamente las funciones decoradas
# en este módulo principal
