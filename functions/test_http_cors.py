import os
import unittest
from unittest.mock import patch

import http_cors
import main as functions_main
import receptions
import rbac
import shipments
from ocr import main as ocr_main
from ocr import main_secure as ocr_main_secure


def _decorated_cors_origins(function):
    """Return the origins stored by the installed Firebase Functions SDK."""
    endpoint = getattr(function, "__firebase_endpoint__", None)
    if endpoint is None or endpoint.callableTrigger is None:
        return None

    for cell in function.__closure__ or ():
        try:
            value = cell.cell_contents
        except ValueError:
            continue
        if isinstance(value, dict) and "origins" in value:
            return value["origins"]

    return None


def _as_origin_set(origins):
    if isinstance(origins, str):
        return {origins}
    return set(origins)


class HttpCorsOriginTests(unittest.TestCase):
    def test_production_origins_are_always_allowed(self):
        with patch.dict(os.environ):
            os.environ.pop("FUNCTIONS_EMULATOR", None)
            os.environ.pop("EXTRA_ALLOWED_CALLABLE_ORIGINS", None)

            origins = http_cors.allowed_origins()

        self.assertTrue(set(http_cors.PRODUCTION_ORIGINS).issubset(origins))
        self.assertFalse(set(http_cors.EMULATOR_ORIGINS).intersection(origins))

    def test_emulator_origins_are_allowed_only_in_the_emulator(self):
        for emulator_flag in ("1", "true", "TRUE", "True"):
            with self.subTest(emulator_flag=emulator_flag):
                with patch.dict(
                    os.environ,
                    {
                        "FUNCTIONS_EMULATOR": emulator_flag,
                        "EXTRA_ALLOWED_CALLABLE_ORIGINS": "",
                    },
                ):
                    origins = http_cors.allowed_origins()

                self.assertTrue(set(http_cors.PRODUCTION_ORIGINS).issubset(origins))
                self.assertTrue(set(http_cors.EMULATOR_ORIGINS).issubset(origins))

    def test_extra_origins_add_access_without_removing_production_origins(self):
        extra_origins = (
            "https://preview.example.com",
            "https://staging.example.com",
        )

        with patch.dict(
            os.environ,
            {
                "FUNCTIONS_EMULATOR": "",
                "EXTRA_ALLOWED_CALLABLE_ORIGINS": (
                    f" {extra_origins[0]} , , {extra_origins[1]} ,"
                ),
            },
        ):
            origins = http_cors.allowed_origins()

        self.assertTrue(set(http_cors.PRODUCTION_ORIGINS).issubset(origins))
        self.assertTrue(set(extra_origins).issubset(origins))
        self.assertNotIn("", origins)


class CallableCorsDriftTests(unittest.TestCase):
    def test_cors_modules_use_the_shared_allowlist(self):
        modules = (
            receptions,
            rbac,
            shipments,
            ocr_main,
            ocr_main_secure,
        )

        for module in modules:
            with self.subTest(module=module.__name__):
                self.assertIs(module.CORS_OPTS, http_cors.CORS_OPTS)
                origins = _as_origin_set(module.CORS_OPTS.cors_origins)
                self.assertTrue(set(http_cors.PRODUCTION_ORIGINS).issubset(origins))

    def test_every_exported_callable_allows_both_production_origins(self):
        exported_callables = {}
        for name, value in vars(functions_main).items():
            endpoint = getattr(value, "__firebase_endpoint__", None)
            if endpoint is not None and endpoint.callableTrigger is not None:
                exported_callables[name] = value

        self.assertGreater(len(exported_callables), 0)
        for name, function in exported_callables.items():
            with self.subTest(function=name):
                origins = _decorated_cors_origins(function)
                self.assertIsNotNone(
                    origins,
                    f"{name} must expose CORS options through the SDK wrapper",
                )
                self.assertTrue(
                    set(http_cors.PRODUCTION_ORIGINS).issubset(
                        _as_origin_set(origins)
                    ),
                    f"{name} must allow both production origins",
                )


if __name__ == "__main__":
    unittest.main()
