# Plan Sprint 2 — Contratos y Parser OC

> **Fecha inicio**: 2026-10-13 (Lunes)  
> **Duración**: 5 días hábiles  
> **Objetivo**: Parser OC dedicado + DTO canónico + Tests + Integración E2E  
> **Dependencia crítica**: Fix Sprint 1 (reglas Firestore pallets + TypeScript) debe estar deployado

---

## 📅 CRONOGRAMA DÍA A DÍA

| Día           | Foco                            | Entregable                                                 | Owner            | Estado       |
| ------------- | ------------------------------- | ---------------------------------------------------------- | ---------------- | ------------ |
| **Lunes**     | Parser OC dedicado              | `parse_orden_compra()` retorna `ProductoOC[]` estructurado | Backend          | ⏳           |
| **Martes**    | DTO Canónico + Mapper           | `OcrProductoDTO` + `ocrToReceptionDraft()` validado        | Backend/Frontend | ⏳           |
| **Miércoles** | Regex TOTAL vs SUBTOTAL + Tests | Fix edge case + test automatizado                          | Backend/QA       | ⏳           |
| **Jueves**    | Hook useOcr limpieza estado     | `clear()` revoca `URL.createObjectURL()` + reset completo  | Frontend         | ✅ **HECHO** |
| **Viernes**   | Integración E2E                 | OC → OCR → Tabla → Guardar → PDF (navegador real)          | Full-stack       | ⏳           |

---

## 🎯 TAREAS DETALLADAS

### LUNES — Parser OC Dedicado (`functions/ocr/paddle_ocr.py`)

**Problema actual**: `parse_orden_compra()` (línea 264-294) reutiliza lógica CFDI, no parsea estructura OC real.

**Especificación `ProductoOC`**:

```python
@dataclass
class ProductoOC:
    linea: int
    codigo: str | None          # SKU proveedor (ej: "CC-600")
    nombre: str                 # "COCA COLA 600ML C/24"
    unidad: str | None          # "CAJA", "PIEZA", "UNIDAD"
    cantidad: float             # Cantidad en unidad de medida
    precio: float               # Precio unitario
    importe: float              # cantidad * precio
    confianza: float            # 0.0 - 1.0
```

**Campos OC a extraer (diferentes a CFDI)**:

| Campo CFDI   | Campo OC                     | Patrón regex                           |
| ------------ | ---------------------------- | -------------------------------------- |
| `folio`      | `oc_folio`                   | `OC[-:]?\d{5,}`                        |
| `fecha`      | `fecha_entrega`              | `Entrega[:]\s*\d{2}[-/]\d{2}[-/]\d{4}` |
| `proveedor`  | `proveedor_nombre`           | `Proveedor[:]\s*([^\n]+)`              |
| `total`      | `subtotal` + `iva` + `total` | Separados explícitamente               |
| `rfc_emisor` | `rfc_proveedor`              | RFC válido SAT                         |
| N/A          | `condiciones_pago`           | `Condiciones[:]\s*([^\n]+)`            |
| N/A          | `moneda`                     | `Moneda[:]\s*(MXN                      | USD)` |

**Implementación**:

1. Crear `parse_orden_compra(blocks: List[Dict]) -> Dict[str, Any]` nuevo (no tocar `parse_cfdi`)
2. Usar `_extract_product_lines()` pero adaptar para formato tabular OC (columnas: CANT | U.MED | DESCRIPCIÓN | PRECIO | IMPORTE)
3. Retornar estructura: `{ oc_folio, fecha_entrega, proveedor_nombre, rfc_proveedor, condiciones_pago, moneda, productos: ProductoOC[] }`

**Tests unitarios** (mismo archivo, `if __name__ == "__main__":`):

- OC con 1 producto
- OC con múltiples productos
- OC con unidades mixtas (CAJA/PIEZA)
- OC sin IVA desglosado

---

### MARTES — DTO Canónico + Mapper (`src/services/domain/ocrMapper.ts`)

**Estado actual**: `ocrMapper.ts` ya existe (líneas 1-225) con `RawOcrProductDto`, `OcrProduct`, `OcrParsed`, `ReceptionDraft`, `normalizeOcrResponse`, `ocrToReceptionDraft`.

**Gaps a cerrar**:

1. **Agregar tipo `DocTipo = "oc"` a `RawOcrParsedDto`** (línea 26-34):

```typescript
export interface RawOcrParsedDto {
  // ... campos CFDI existentes
  // NUEVOS para OC:
  oc_folio?: string | null;
  fecha_entrega?: string | null;
  proveedor_nombre?: string | null;
  rfc_proveedor?: string | null;
  condiciones_pago?: string | null;
  moneda?: string | null;
}
```

2. **Extender `normalizeOcrResponse`** para mapear campos OC → `OcrParsed`:

```typescript
parsed: {
  // ... existentes
  folio: asString(parsed.oc_folio ?? parsed.folio),  // OC usa oc_folio
  fecha: asString(parsed.fecha_entrega ?? parsed.fecha),
  proveedor: asString(parsed.proveedor_nombre ?? parsed.proveedor),
  // ...
}
```

3. **Validar `ocrToReceptionDraft()`** con datos OC reales:

- `folio` = `oc_folio`
- `fecha` = `fecha_entrega`
- `proveedor` = `proveedor_nombre`
- `lineas[]` mapeadas desde `ProductoOC[]`

4. **Tests unitarios** (`src/test/domain/ocrMapper.test.ts`):

- `normalizeOcrResponse` con response CFDI → `OcrResponse` válido
- `normalizeOcrResponse` con response OC → `OcrResponse` válido
- `ocrToReceptionDraft` genera `ReceptionDraft` con campos correctos
- `isOcrValid` rechaza response sin productos

---

### MIÉRCOLES — Regex TOTAL vs SUBTOTAL + Tests

**Bug documentado**: `TOTAL_PATTERN` (línea 153-156 `paddle_ocr.py`) captura "Sub total" (con espacio) como Total.

**Fix**:

```python
# ANTES (línea 153-156):
TOTAL_PATTERN = re.compile(
    r"(?:^|\s)(?:Total|Importe\s+Total)\s*[:]?\s*\$?\s*([\d,]+\.\d{2})",
    re.I | re.M,
)

# DESPUÉS: Negative lookbehind para "Sub"
TOTAL_PATTERN = re.compile(
    r"(?<!Sub\s)(?:^|\s)(?:Total|Importe\s+Total)\s*[:]?\s*\$?\s*([\d,]+\.\d{2})",
    re.I | re.M,
)
```

**Tests automatizados** (`tests/test_parse_oc.py`):

```python
def test_total_vs_subtotal():
    text = "Sub total: 100.00\nTotal: 116.00"
    assert _extract_total(text) == "116.00"  # NO 100.00

def test_total_with_currency():
    text = "Total: $1,250.00"
    assert _extract_total(text) == "1250.00"

def test_importe_total():
    text = "Importe Total: 999.99"
    assert _extract_total(text) == "999.99"
```

**Ejecutar**: `python -m pytest tests/test_parse_oc.py -v`

---

### JUEVES — Hook useOcr Limpieza Estado

**Estado**: ✅ **YA IMPLEMENTADO** en `src/hooks/useOcr.ts` líneas 69-75

```typescript
const clear = useCallback(() => {
  setResult(null);
  setError(null);
  setPreviewDataUrl(null);
  setPreviewFileName(null);
  setIsPdfPreview(false);
}, []);
```

**Pendiente**: Revocar `URL.createObjectURL()` para evitar memory leak:

```typescript
const clear = useCallback(() => {
  if (previewDataUrl && previewDataUrl.startsWith("blob:")) {
    URL.revokeObjectURL(previewDataUrl);
  }
  setResult(null);
  setError(null);
  setPreviewDataUrl(null);
  setPreviewFileName(null);
  setIsPdfPreview(false);
}, []);
```

**Test**: Verificar que no hay memory leak en DevTools → Memory → Take heap snapshot antes/después de clear.

---

### VIERNES — Integración E2E (Navegador Real)

**Flujo completo a validar**:

```
1. Login real en exepa-almacen-safe.web.app
2. Nueva Recepción → "Sí, tengo OC"
3. Subir PDF OC real (factura proveedor)
4. OCR extrae: folio, proveedor, productos[]
5. Tabla productos: match con catálogo → confirmado/sugerido/manual
6. Conversiones + stickers calculados (4×tarima)
7. Continuar → Step 2 (Impresión Etiquetas)
8. Generar 4 stickers/tarima (Cara A×2, Cara B×2)
9. Captura Tarima: QR scan → auto-fill → lote/caducidad manual
10. Guardar → Recepción CONFIRMED en Firestore
11. PDF programado generado + descargable
12. Verificar en Recepciones: tarima aparece con QR
```

**Criterios de aceptación**:

- [ ] OCR procesa PDF OC en < 10s
- [ ] Match de productos ≥ 80% confirmado
- [ ] Stickers calculados = tarimas × 4
- [ ] QR scan auto-lleena: Fecha, Folio, Proveedor, Producto, Código
- [ ] Lote/Caducidad se guardan y copian a siguiente tarima
- [ ] Recepción aparece en lista con status "Completada"
- [ ] PDF generado tiene QR correcto por tarima

**Herramientas**: Playwright (ya configurado) + Chrome real

---

## 🔗 DEPENDENCIAS CRÍTICAS (Sprint 1)

| Dependencia                                 | Sprint 1 Task         | Estado       | Bloquea                           |
| ------------------------------------------- | --------------------- | ------------ | --------------------------------- |
| Reglas Firestore `pallets` collection-group | P0-6 + fix reglas     | ❌ Pendiente | `getByQR()` en TarimaDetalle      |
| TypeScript `tsc --noEmit = 0`               | P0-1/P0-4 fix oxfmt   | ❌ Pendiente | CI/CD, build prod                 |
| Emulador estable                            | P0-5 estabilizar      | ❌ Pendiente | Tests integración Lunes-Miércoles |
| Deploy rules/indexes a prod                 | P0-4/P0-5/P0-6 deploy | ❌ Pendiente | Validación real en prod           |

**Regla**: No iniciar Lunes sin estas 4 resueltas.

---

## 🧪 TESTS REQUERIDOS POR DÍA

| Día       | Tests Unitarios                   | Tests Integración              | Tests E2E                      |
| --------- | --------------------------------- | ------------------------------ | ------------------------------ |
| Lunes     | `parse_orden_compra()` (4 casos)  | `extract_ocr_secure` tipo="oc" | -                              |
| Martes    | `ocrMapper.ts` (4 casos)          | -                              | -                              |
| Miércoles | Regex TOTAL vs SUBTOTAL (3 casos) | -                              | -                              |
| Jueves    | `useOcr.clear()` memory leak      | -                              | -                              |
| Viernes   | -                                 | -                              | Flujo completo OC→PDF (1 spec) |

---

## 📦 ARCHIVOS A MODIFICAR/CREAR

### Backend (Functions)

- `functions/ocr/paddle_ocr.py` — `parse_orden_compra()` nuevo + fix regex
- `functions/ocr/main.py` — Validar `tipo: "oc"` en callable
- `tests/test_parse_oc.py` — Tests unitarios parser OC

### Frontend (Domain)

- `src/services/domain/ocrMapper.ts` — Extender DTOs + tests
- `src/test/domain/ocrMapper.test.ts` — Tests unitarios mapper
- `src/hooks/useOcr.ts` — Fix `clear()` revoca blob URL

### Frontend (UI)

- `src/screens/NuevaRecepcionStep1.tsx` — Validar flujo OC (ya soporta)
- `src/screens/TarimaDetalle.tsx` — Validar QR scan con datos OC

### Config

- `firestore.rules` — Fix collection-group pallets (Sprint 1 carryover)
- `firestore.indexes.json` — Validado (ya existe)

---

## ✅ DEFINITION OF DONE SPRINT 2

| Criterio           | Métrica                                                       |
| ------------------ | ------------------------------------------------------------- |
| Parser OC dedicado | `parse_orden_compra()` retorna `ProductoOC[]` con 100% campos |
| DTO canónico       | `normalizeOcrResponse` maneja CFDI + OC sin breaking changes  |
| Regex TOTAL        | 0 falsos positivos con "Sub total" / "Subtotal"               |
| Tests unitarios    | ≥ 90% cobertura parser + mapper                               |
| Hook useOcr        | `clear()` sin memory leak (verificado DevTools)               |
| Integración E2E    | Flujo completo OC→PDF pasa en navegador real                  |
| Deploy             | Reglas Firestore + Functions + Hosting a prod sin errores     |

---

## ⚠️ RIESGOS Y MITIGACIONES

| Riesgo                      | Probabilidad | Impacto                 | Mitigación                                       |
| --------------------------- | ------------ | ----------------------- | ------------------------------------------------ |
| Emulador inestable          | Alta         | Bloquea tests Lunes-Mié | Fix Sprint 1 P0-5 ANTES de iniciar               |
| PDF OC formato variable     | Media        | Parser falla            | Test con 3 PDFs reales proveedores               |
| Match productos < 80%       | Media        | UX degradada            | Log de productos "sugerido" para mejora continua |
| `getByQR()` falla en prod   | Alta         | TarimaDetalle roto      | Fix reglas pallets **P0 obligatorio**            |
| TypeScript errors persisten | Alta         | CI falla                | Fix oxfmt **P0 obligatorio**                     |

---

## 📊 MÉTRICAS DE ÉXITO

- **Parser OC**: Procesa 3 PDFs reales proveedores → 100% productos extraídos
- **Match rate**: ≥ 80% productos "confirmado" con catálogo actual
- **Latencia OCR**: < 10s p95 (Functions 2GB RAM)
- **E2E**: Flujo completo < 3 min manual
- **Tests**: 0 flaky, 100% pass en CI

---

## 🚀 POST-SPRINT 2 (Sprint 3 Preview)

- State Machine wizard (`useWizardMachine`) para flujo recepción
- Offline queue testing + documentation
- Budget alerts Functions OCR (> $50/día)
- E2E tests críticos Playwright (login → OC → PDF)

---

_Documento vivo — actualizar diariamente con avances reales_
