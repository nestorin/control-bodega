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
    def test_cfdi_rfc_pattern_matches_corporate_and_individual_formats(self):
        rfcs = paddle_ocr._find_all_rfcs("Emisor ABC010101AB1 Receptor GODE561231GR8")

        self.assertEqual(rfcs, ["ABC010101AB1", "GODE561231GR8"])
        parsed = paddle_ocr.parse_cfdi([])
        self.assertIsNone(parsed["rfc_emisor"])
        self.assertIsNone(parsed["uuid"])

    @staticmethod
    def _add_smart_final_order_page(document, folio, product_code, product_name, quantity):
        page = document.new_page(width=612, height=792)
        text_rows = [
            (500, 50, "Folio"),
            (500, 66, folio),
            (45, 100, "Proveedor"),
            (45, 118, "SMART & FINAL DEL NOROESTE"),
            (45, 200, "Artículo"),
            (125, 200, "Nombre"),
            (365, 200, "U.med."),
            (420, 200, "Unidades"),
            (475, 200, "Precio"),
            (550, 200, "Importe"),
            (45, 218, product_code),
            (125, 218, product_name),
            (365, 218, "Cajas"),
            (420, 218, str(quantity)),
            (475, 218, "273.15"),
            (550, 218, str(quantity * 273.15)),
        ]
        for x, y, value in text_rows:
            page.insert_text((x, y), value, fontsize=8)
        return page

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

    def test_smart_final_native_text_keeps_distinct_order_folios_separate(self):
        document = fitz.open()
        self._add_smart_final_order_page(
            document,
            "OC1437",
            "CB0401",
            "AGUA MINERAL 355 ML C/24 PZS S",
            100,
        )
        self._add_smart_final_order_page(
            document,
            "OC1436",
            "CB0301",
            "BEBIDA SABOR COLA 235ML C/24 PZS S",
            100,
        )
        pdf_bytes = document.tobytes()
        document.close()

        with patch.object(paddle_ocr, "ocr_image", side_effect=AssertionError("native text must not use OCR")):
            extracted = paddle_ocr.extract_document(pdf_bytes, "application/pdf")
        parsed = paddle_ocr.parse_orden_compra(extracted["blocks"])

        self.assertEqual(extracted["pages"], 2)
        self.assertEqual(parsed["folio"], "OC1437")
        self.assertEqual(parsed["proveedor"], "SMART & FINAL DEL NOROESTE")
        self.assertEqual(
            [(product["codigo"], product["nombre"], product["unidad"], product["cantidad"]) for product in parsed["productos"]],
            [("CB0401", "AGUA MINERAL 355 ML C/24 PZS S", "Cajas", 100.0)],
        )
        self.assertEqual(
            [(order["folio"], order["productos"][0]["codigo"]) for order in parsed["ordenes"]],
            [("OC1437", "CB0401"), ("OC1436", "CB0301")],
        )

    def test_smart_final_pages_with_same_folio_merge_product_lines(self):
        document = fitz.open()
        self._add_smart_final_order_page(
            document, "OC1437", "CB0401", "AGUA MINERAL 355 ML C/24 PZS S", 100
        )
        self._add_smart_final_order_page(
            document, "OC1437", "CB0301", "BEBIDA SABOR COLA 235ML C/24 PZS S", 100
        )
        pdf_bytes = document.tobytes()
        document.close()

        with patch.object(paddle_ocr, "ocr_image", side_effect=AssertionError("native text must not use OCR")):
            extracted = paddle_ocr.extract_document(pdf_bytes, "application/pdf")
        parsed = paddle_ocr.parse_orden_compra(extracted["blocks"])

        self.assertEqual(parsed["folio"], "OC1437")
        self.assertNotIn("ordenes", parsed)
        self.assertEqual([product["codigo"] for product in parsed["productos"]], ["CB0401", "CB0301"])

    def test_mixed_pdf_uses_native_text_and_ocr_only_for_image_page(self):
        document = fitz.open()
        self._add_smart_final_order_page(
            document,
            "OC1374",
            "CB0301",
            "BEBIDA SABOR COLA 235ML C/24 PZS S",
            100,
        )
        image = Image.new("RGB", (80, 80), "white")
        image_buffer = io.BytesIO()
        image.save(image_buffer, format="PNG")
        image_page = document.new_page(width=80, height=80)
        image_page.insert_image(image_page.rect, stream=image_buffer.getvalue())
        pdf_bytes = document.tobytes()
        document.close()

        calls = []

        def fake_ocr(image_bytes):
            calls.append(image_bytes)
            return {
                "pages": 1,
                "blocks": [{"text": "Continuation", "confidence": 0.99, "bbox": [[0, 0], [10, 0], [10, 10], [0, 10]]}],
                "full_text": "Continuation",
            }

        with patch.object(paddle_ocr, "ocr_image", side_effect=fake_ocr):
            result = paddle_ocr.extract_document(pdf_bytes, "application/pdf")

        self.assertEqual(result["pages"], 2)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["blocks"][-1]["page"], 2)

    def test_unsupported_purchase_order_returns_clear_user_error_without_changing_cfdi(self):
        request = SimpleNamespace(
            auth=SimpleNamespace(uid="unsupported-oc-test-user"),
            data={
                "fileBase64": base64.b64encode(b"not an order").decode("ascii"),
                "mimeType": "application/pdf",
                "tipo": "oc",
            },
        )
        empty_extraction = {"blocks": [], "full_text": "", "preview": None}

        with patch.object(main_secure, "extract_document", return_value=empty_extraction):
            with self.assertRaises(https_fn.HttpsError) as raised:
                inspect.unwrap(main_secure.extract_ocr_secure)(request)

        self.assertIn("No se encontró una orden de compra válida", raised.exception.message)

        request.data["tipo"] = "cfdi"
        with patch.object(main_secure, "extract_document", return_value=empty_extraction):
            result = inspect.unwrap(main_secure.extract_ocr_secure)(request)
        self.assertTrue(result["success"])


if __name__ == "__main__":
    unittest.main()
