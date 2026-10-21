import base64
import io
import inspect
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import fitz
from PIL import Image
from firebase_functions import https_fn

from ocr import main_secure
from ocr import paddle_ocr
from ocr.paddle_ocr import _extract_product_lines


class SecurityAndOcrTests(unittest.TestCase):
    def test_tabular_product_parser_does_not_reference_local_skip_variable(self):
        blocks = [
            {"text": "1", "bbox": [[0, 0], [5, 0], [5, 10], [0, 10]], "confidence": 1.0},
            {"text": "Producto OCR", "bbox": [[10, 0], [50, 0], [50, 10], [10, 10]], "confidence": 1.0},
            {"text": "10", "bbox": [[60, 0], [65, 0], [65, 10], [60, 10]], "confidence": 1.0},
            {"text": "10", "bbox": [[70, 0], [75, 0], [75, 10], [70, 10]], "confidence": 1.0},
        ]

        lines = _extract_product_lines(blocks)

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["nombre"], "Producto OCR")

    def test_secure_callable_is_exported_from_functions_entrypoint(self):
        source = Path(__file__).with_name("main.py").read_text()
        self.assertIn("from ocr.main_secure import extract_ocr_secure", source)
        secure_source = Path(__file__).parent.joinpath("ocr", "main_secure.py").read_text()
        self.assertIn('allowed_mime_types = {"image/jpeg", "image/png", "image/webp", "application/pdf"}', secure_source)
        self.assertIn("validate=True", secure_source)

    def test_legacy_http_ocr_endpoint_is_not_exported_or_consumed(self):
        entrypoint = Path(__file__).with_name("main.py").read_text()
        legacy_module = Path(__file__).parent.joinpath("ocr", "main.py").read_text()
        frontend_transport = Path(__file__).parents[1].joinpath("src", "services", "paddleOcr.ts").read_text()
        active_client = Path(__file__).parents[1].joinpath("src", "hooks", "useOcr.ts").read_text()

        self.assertNotIn("from ocr.main import extract_ocr", entrypoint)
        self.assertNotIn("def extract_ocr(", legacy_module)
        self.assertNotIn("extractWithPaddleOcr", frontend_transport)
        self.assertNotIn("/extract_ocr?tipo=", frontend_transport)
        self.assertIn('"extract_ocr_secure"', active_client)

    def test_secure_callable_does_not_return_internal_ocr_exception(self):
        request = SimpleNamespace(
            auth=SimpleNamespace(uid="internal-error-test-user"),
            data={
                "fileBase64": base64.b64encode(b"document").decode("ascii"),
                "mimeType": "application/pdf",
                "tipo": "cfdi",
            },
        )

        with patch.object(main_secure, "extract_document", side_effect=RuntimeError("private parser detail")):
            with self.assertRaises(https_fn.HttpsError) as raised:
                inspect.unwrap(main_secure.extract_ocr_secure)(request)

        self.assertNotIn("private parser detail", raised.exception.message)

    def test_image_only_pdf_processes_every_page(self):
        document = fitz.open()
        for color in ("red", "blue"):
            image = Image.new("RGB", (80, 80), color)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            page = document.new_page(width=80, height=80)
            page.insert_image(page.rect, stream=buffer.getvalue())
        pdf_bytes = document.tobytes()
        document.close()

        calls = []

        def fake_ocr(image_bytes):
            calls.append(image_bytes)
            return {"pages": 1, "blocks": [{"text": f"page-{len(calls)}"}], "full_text": f"page-{len(calls)}"}

        with patch.object(paddle_ocr, "ocr_image", side_effect=fake_ocr):
            result = paddle_ocr.extract_document(pdf_bytes, "application/pdf")

        self.assertEqual(result["pages"], 2)
        self.assertEqual(len(calls), 2)
        self.assertEqual([block["page"] for block in result["blocks"]], [1, 2])


if __name__ == "__main__":
    unittest.main()
