"""Tests for parse_orden_compra - verify OC product extraction."""
import sys
import re
from typing import List, Dict, Any, Optional

# Mock the paddleocr import to avoid needing it for tests
sys.modules['paddleocr'] = type(sys)('paddleocr')
sys.modules['paddleocr'].PaddleOCR = lambda *args, **kwargs: None

sys.path.insert(0, "functions/ocr")

# Now import the functions we need (they don't need paddleocr at module level)
from paddle_ocr import parse_orden_compra, _extract_product_lines


def make_block(text: str, confidence: float = 0.9, y: float = 0, x: float = 0) -> dict:
    """Create a mock OCR block."""
    return {
        "text": text,
        "confidence": confidence,
        "bbox": [[x, y], [x + 100, y], [x + 100, y + 20], [x, y + 20]],
    }


def test_oc_tabular_format():
    """Test OC with tabular format: columns for quantity, unit, description, price, amount."""
    blocks = [
        make_block("ORDEN DE COMPRA", y=50, x=100),
        make_block("OC-24891", y=80, x=100),
        make_block("Fecha: 2026-01-15", y=110, x=100),
        make_block("Proveedor: Distribuidora del Norte", y=140, x=100),
        # Header row
        make_block("CANT", y=200, x=50),
        make_block("UNIDAD", y=200, x=150),
        make_block("DESCRIPCIÓN", y=200, x=250),
        make_block("PRECIO", y=200, x=500),
        make_block("IMPORTE", y=200, x=600),
        # Product 1
        make_block("10", y=230, x=50),
        make_block("CAJA", y=230, x=150),
        make_block("AGUA MINERAL 600 ML", y=230, x=250),
        make_block("15.50", y=230, x=500),
        make_block("155.00", y=230, x=600),
        # Product 2
        make_block("5", y=260, x=50),
        make_block("PIEZA", y=260, x=150),
        make_block("COCA COLA 600ML", y=260, x=250),
        make_block("18.00", y=260, x=500),
        make_block("90.00", y=260, x=600),
        # Totals
        make_block("SUBTOTAL", y=320, x=500),
        make_block("245.00", y=320, x=600),
        make_block("IVA 16%", y=350, x=500),
        make_block("39.20", y=350, x=600),
        make_block("TOTAL", y=380, x=500),
        make_block("284.20", y=380, x=600),
    ]

    result = parse_orden_compra(blocks)
    print("=== Tabular OC Test ===")
    print(f"Folio: {result.get('folio')}")
    print(f"Fecha: {result.get('fecha')}")
    print(f"Proveedor: {result.get('proveedor')}")
    print(f"Total: {result.get('total')}")
    print(f"Productos encontrados: {len(result.get('productos', []))}")
    
    for prod in result.get('productos', []):
        print(f"  - Línea {prod['linea']}: {prod['cantidad']} {prod['unidad']} {prod['nombre']} @ ${prod['precio']} = ${prod['importe']}")
    
    assert len(result.get('productos', [])) >= 2, f"Expected at least 2 products, got {len(result.get('productos', []))}"
    assert result.get('folio') is not None, "Folio should be extracted"
    assert result.get('proveedor') is not None, "Proveedor should be extracted"
    print("✅ Tabular format test passed\n")


def test_oc_horizontal_format():
    """Test OC with horizontal/inline format: '10 CAJA AGUA MINERAL 600 ML 15.50'."""
    blocks = [
        make_block("ORDEN DE COMPRA OC-24891", y=50, x=100),
        make_block("Proveedor: Distribuidora del Norte", y=80, x=100),
        make_block("Fecha: 15/01/2026", y=110, x=100),
        # Horizontal product lines
        make_block("10 CAJA AGUA MINERAL 600 ML 15.50 155.00", y=200, x=50),
        make_block("5 PIEZA COCA COLA 600ML 18.00 90.00", y=230, x=50),
        make_block("20 CAJA SABRITAS CLASICAS 45G 12.00 240.00", y=260, x=50),
        make_block("TOTAL 425.00", y=320, x=500),
    ]

    result = parse_orden_compra(blocks)
    print("=== Horizontal OC Test ===")
    print(f"Folio: {result.get('folio')}")
    print(f"Proveedor: {result.get('proveedor')}")
    print(f"Productos encontrados: {len(result.get('productos', []))}")
    
    for prod in result.get('productos', []):
        print(f"  - Línea {prod['linea']}: {prod['cantidad']} {prod['unidad']} {prod['nombre']} @ ${prod['precio']} = ${prod['importe']}")
    
    assert len(result.get('productos', [])) >= 2, f"Expected at least 2 products, got {len(result.get('productos', []))}"
    print("✅ Horizontal format test passed\n")


def test_oc_header_text_is_not_returned_as_a_product():
    """A numbered purchase-order header must not be treated as a product row."""
    blocks = [
        make_block("SMART & FINAL DEL NOROESTE", y=50),
        make_block(
            "51119 ORDEN DE COMPRA 15 DIAS CONDICIONES VENDEDOR",
            y=200,
        ),
        make_block(
            "1200 CAJA BEBIDA SABOR COLA 235ML C/24 PZS S",
            y=230,
        ),
    ]

    result = parse_orden_compra(blocks)

    assert [
        (product["linea"], product["nombre"], product["cantidad"])
        for product in result["productos"]
    ] == [(1, "BEBIDA SABOR COLA 235ML C/24 PZS S", 1200.0)]


def test_oc_with_codes():
    """Test OC with product codes."""
    blocks = [
        make_block("ORDEN DE COMPRA OC-24891", y=50, x=100),
        make_block("Proveedor: Coca Cola FEMSA", y=80, x=100),
        make_block("CANT UNIDAD CODIGO DESCRIPCION PRECIO IMPORTE", y=180, x=50),
        make_block("10 CAJA CC-600 COCA COLA 600ML 18.00 180.00", y=210, x=50),
        make_block("5 PZA CC-2L COCA COLA 2L 35.00 175.00", y=240, x=50),
        make_block("TOTAL 355.00", y=300, x=500),
    ]

    result = parse_orden_compra(blocks)
    print("=== OC with Codes Test ===")
    print(f"Productos encontrados: {len(result.get('productos', []))}")
    
    for prod in result.get('productos', []):
        print(f"  - Línea {prod['linea']}: [{prod['codigo']}] {prod['cantidad']} {prod['unidad']} {prod['nombre']} @ ${prod['precio']} = ${prod['importe']}")
        assert prod['codigo'] is not None, f"Product {prod['nombre']} should have a code"
    
    assert len(result.get('productos', [])) == 2
    print("✅ OC with codes test passed\n")


def test_oc_mixed_units():
    """Test OC with various unit types."""
    blocks = [
        make_block("OC-24891", y=50, x=100),
        make_block("Proveedor: LaLa", y=80, x=100),
        make_block("12 CAJA LECHE LALA 1L 22.00 264.00", y=180, x=50),
        make_block("30 PIEZA YOGURT LALA 100G 4.50 135.00", y=210, x=50),
        make_block("5 KG AZUCAR REFINADA 18.00 90.00", y=240, x=50),
        make_block("TOTAL 489.00", y=280, x=500),
    ]

    result = parse_orden_compra(blocks)
    print("=== Mixed Units Test ===")
    for prod in result.get('productos', []):
        print(f"  - {prod['cantidad']} {prod['unidad']} {prod['nombre']}")
        assert prod['unidad'] in ['CAJA', 'PIEZA', 'KG', 'CAJA', 'PIEZA'], f"Unexpected unit: {prod['unidad']}"
    
    assert len(result.get('productos', [])) == 3
    print("✅ Mixed units test passed\n")


def test_total_vs_subtotal_regex():
    """Test that TOTAL_PATTERN captures Total but NOT Subtotal, and vice versa."""
    from paddle_ocr import TOTAL_PATTERN, SUBTOTAL_PATTERN
    
    # Cases that SHOULD match TOTAL_PATTERN
    total_cases = [
        "Total: 1,250.00",
        "Total 1250.00",
        "Importe Total: 1,250.00",
        "TOTAL 500.00",
        "Total:1,250.00",
        "Total : 1,250.00",
    ]
    
    # Cases that should NOT match TOTAL_PATTERN (they're subtotal)
    not_total_cases = [
        "Subtotal: 100.00",
        "Subtotal 245.00",
        "Subtotal: 1,250.00",
    ]
    
    # Cases that SHOULD match SUBTOTAL_PATTERN
    subtotal_cases = [
        "Subtotal: 100.00",
        "Subtotal 245.00",
        "Subtotal: 1,250.00",
    ]
    
    # Cases that should NOT match SUBTOTAL_PATTERN
    not_subtotal_cases = [
        "Total: 1,250.00",
        "Total 1250.00",
        "Importe Total: 1,250.00",
        "TOTAL 500.00",
    ]
    
    print("=== TOTAL vs SUBTOTAL Regex Test ===")
    
    for tc in total_cases:
        m = TOTAL_PATTERN.search(tc)
        assert m is not None, f"TOTAL_PATTERN should match: {tc!r}"
        print(f"  TOTAL ✅ {tc!r} -> {m.group(1)}")
    
    for tc in not_total_cases:
        m = TOTAL_PATTERN.search(tc)
        assert m is None, f"TOTAL_PATTERN should NOT match: {tc!r} (got {m.group(1)})"
        print(f"  TOTAL ✅ (correctly rejects) {tc!r}")
    
    for tc in subtotal_cases:
        m = SUBTOTAL_PATTERN.search(tc)
        assert m is not None, f"SUBTOTAL_PATTERN should match: {tc!r}"
        print(f"  SUBTOTAL ✅ {tc!r} -> {m.group(1)}")
    
    for tc in not_subtotal_cases:
        m = SUBTOTAL_PATTERN.search(tc)
        assert m is None, f"SUBTOTAL_PATTERN should NOT match: {tc!r} (got {m.group(1)})"
        print(f"  SUBTOTAL ✅ (correctly rejects) {tc!r}")
    
    # Edge case: "Sub total" (with space) - currently matches TOTAL, document this
    edge = "Sub total: 50.00"
    m = TOTAL_PATTERN.search(edge)
    if m:
        print(f"  ⚠️  EDGE CASE: 'Sub total' matches TOTAL -> {m.group(1)} (known limitation)")
    
    print("✅ TOTAL vs SUBTOTAL regex test passed\n")


if __name__ == "__main__":
    print("Running parse_orden_compra tests...\n")
    test_oc_tabular_format()
    test_oc_horizontal_format()
    test_oc_header_text_is_not_returned_as_a_product()
    test_oc_with_codes()
    test_oc_mixed_units()
    test_total_vs_subtotal_regex()
    print("🎉 All tests passed!")
