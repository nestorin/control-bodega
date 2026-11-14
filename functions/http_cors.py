"""Shared CORS configuration for Firebase callable functions.

Firebase Hosting serves the same live site on both the canonical ``web.app``
host and the legacy ``firebaseapp.com`` host. A missing production origin
silently prevents the browser from reaching every callable for that host, so
both hosts must remain in the allowlist.
"""

import os

from firebase_functions.options import CorsOptions


PRODUCTION_ORIGINS = (
    "https://exepa-almacen-safe.web.app",
    "https://exepa-almacen-safe.firebaseapp.com",
)
EMULATOR_ORIGINS = (
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)


def is_emulator() -> bool:
    """Return whether the Firebase Functions emulator is enabled."""
    return os.environ.get("FUNCTIONS_EMULATOR", "").strip().lower() in {
        "1",
        "true",
    }


def allowed_origins() -> list[str]:
    """Return production, optional emulator, and explicitly extra origins."""
    origins = list(PRODUCTION_ORIGINS)

    if is_emulator():
        origins.extend(EMULATOR_ORIGINS)

    origins.extend(
        origin.strip()
        for origin in os.environ.get("EXTRA_ALLOWED_CALLABLE_ORIGINS", "").split(",")
        if origin.strip()
    )

    return origins


CORS_OPTS = CorsOptions(cors_origins=allowed_origins())
