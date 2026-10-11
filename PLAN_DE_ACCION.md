# Plan de Acción Ejecutable — Control de Bodega v1.4

**Enfoque:** Pragmático, priorizado por riesgo real (probabilidad × impacto)
**Fecha:** Octubre 2026
**Estado:** Aprobado para ejecución

---

## Matriz de Priorización (Riesgo × Impacto)

| Prioridad | Fix | Riesgo | Impacto | Score | Sprint |
|-----------|-----|--------|---------|-------|--------|
| **P0-1** | TS Error bloqueante + `tsc --noEmit` en CI | 100% | Bloquea deploy confiable | **100** | Sprint 1 |
| **P0-2** | OCR Endpoint: App Check + Callable + Rate Limit | 100% | Abuso / costos / seguridad | **100** | Sprint 1 |
| **P0-3** | Auth Real: Dominios Firebase + Fix Mock Flag | 100% | Permisos fallan en prod | **100** | Sprint 1 |
| **P0-4** | Persistencia Evidencia: Fix Rule DRAFT→DRAFT | 100% | Evidencia huérfana | **100** | Sprint 1 |
| **P0-5** | Storage Rules: Scope a ReceptionId + Ownership | 100% | Acceso no autorizado | **100** | Sprint 1 |
| **P0-6** | Índice `qrIdentifier` Collection-Group | 100% | `getByQR()` falla en prod | **100** | Sprint 1 |
| **P1-1** | Parser OC: `parse_orden_compra()` → productos[] estructurados | 90% | OCR "funciona" pero no carga datos | **81** | Sprint 2 |
| **P1-2** | DTO Canónico OCR + Mapper Explícito | 90% | Contratos rotos frontend↔backend | **81** | Sprint 2 |
| **P1-3** | Fix Parser Importes: Regex TOTAL vs SUBTOTAL | 80% | Datos financieros incorrectos | **64** | Sprint 2 |
| **P1-4** | Limpieza Estado Previo (previewDataUrl, OCR results) | 70% | Factura previa subida accidentalmente | **49** | Sprint 2 |
| **P2-1** | Extraer `ReceptionDomainService` (puro TS, testeable) | 80% | Lógica en UI = bugs imposibles | **64** | Sprint 3 |
| **P2-2** | Romper `ProgramacionRecepcion` (God Component) | 90% | Cambios = regresión garantizada | **72** | Sprint 3 |
| **P2-3** | State Machine Wizard (XState/Reducer) | 70% | Transiciones inválidas | **49** | Sprint 3 |
| **P2-4** | Shared PDF/QR Library (`src/lib/documents`) | 60% | Duplicación PDF/QR 2x | **36** | Sprint 3 |
| **P2-5** | Code Splitting + Lazy Load | 70% | Bundle 596KB → <200KB | **49** | Sprint 3 |
| **P3-1** | Testing Setup: Vitest + RTL + MSW | 90% | 0% coverage = regresiones invisibles | **72** | Sprint 4 |
| **P3-2** | CI Pipeline: Lint + Typecheck + Test + Deploy | 90% | Deploy manual sin verificación | **72** | Sprint 4 |
| **P3-3** | Zod Schemas en Boundary Firestore ↔ App | 60% | Data corruption silente | **36** | Sprint 4 |
| **P3-4** | Observabilidad (Sentry + Structured Logging) | 50% | Debugging = console.log | **25** | Sprint 4 |

---

## Sprint 1 — Bloqueadores de Producción (Semana 1)

### Día 1 — Lunes: TypeScript + CI Foundation

| Tarea | Archivos | Comando Verificación |
|-------|----------|---------------------|
| Fix TS Error `NuevaRecepcionStep1:73` (props sin separador) | `src/screens/NuevaRecepcionStep1.tsx:73` | `tsc --noEmit` ✅ |
| Agregar script `typecheck` en package.json | `package.json` | `pnpm typecheck` ✅ |
| Crear workflow CI básico (typecheck + build) | `.github/workflows/ci.yml` | Push → GitHub Actions pasa |

### Día 2 — Martes: Auth Real en Producción

| Tarea | Archivos | Verificación |
|-------|----------|--------------|
| Agregar `exepa-almacen-safe.web.app` a Firebase Console → Auth → Authorized domains | Firebase Console | Login funciona en prod |
| Fix `IS_MOCK_MODE` logic para no usar mock en prod | `src/context/AuthContext.tsx:5-6` | Consola sin "Missing permissions" |
| Test manual: Home → Nueva Recepción → Cargar OC → Continuar | Navegador | Flujo completo sin errores auth |

### Día 3 — Miércoles: OCR Endpoint Seguro

| Tarea | Archivos | Verificación |
|-------|----------|--------------|
| Migrar `extract_ocr` a **Callable Function** (requiere auth context) | `functions/ocr/main.py` | `functions:deploy` |
| Agregar **App Check** enforcement | `firebase.json` + Function config | Request sin App Check → 401 |
| Rate limit: max 10 req/min por usuario | `functions/ocr/main.py` (middleware) | 11ª request → 429 |
| Actualizar cliente `useOcr` para usar callable | `src/hooks/useOcr.ts` | OCR funciona con auth |

### Día 4 — Jueves: Persistencia Evidencia

| Tarea | Archivos | Verificación |
|-------|----------|--------------|
| Fix rule `isValidDraftPreviewUpdate` para permitir `invoicePreviewPath/Url` en DRAFT | `firestore.rules:160-168` | `firebase deploy --only firestore:rules` |
| Test: Subir PDF → Preview se guarda en Storage → Path se guarda en Firestore | Navegador | Sin error "permission denied" |

### Día 5 — Viernes: Storage Rules + Índice QR

| Tarea | Archivos | Verificación |
|-------|----------|--------------|
| Scoppear Storage rules a `receptions/{receptionId}/invoice-preview.jpg` + ownership | `storage.rules` | Upload solo si receptionId existe y user tiene acceso |
| Agregar índice collection-group `qrIdentifier` en `pallets` | `firestore.indexes.json` | `firebase deploy --only firestore:indexes` |
| Test: `PalletService.getByQR()` funciona en prod | Consola / Logs | Query retorna pallet sin error índice |

### Gate de Salida Sprint 1
- ✅ `tsc --noEmit` pasa en CI
- ✅ Auth funciona en prod sin errores consola
- ✅ OCR endpoint protegido (App Check + rate limit)
- ✅ Evidencia se persiste correctamente
- ✅ Storage rules scopeadas
- ✅ `getByQR()` funciona en prod

---

## Sprint 2 — Contratos y Parser OC (Semana 2)

| Día | Tarea | Archivos | Criterio de Aceptación |
|-----|-------|----------|------------------------|
| Lunes | Completar `parse_orden_compra()` → retorna `productos[]` con `codigo`, `nombre`, `cantidad`, `unidad` | `functions/ocr/paddle_ocr.py:243` | OCR de OC devuelve estructura parseable |
| Martes | Crear `OCRResponseDTO` canónico + `ocrMapper.ts` (DTO → ReceptionDraft) | `src/services/domain/ocrMapper.ts` (nuevo) | Frontend recibe `cantidad`/`unidad` correctos |
| Miércoles | Fix regex TOTAL: no match SUBTOTAL + test case automatizado | `functions/ocr/paddle_ocr.py` + test | Parser devuelve 116.00 para Total 116.00 |
| Jueves | Limpieza estado previo: `clear()` en hook OCR resetea `previewDataUrl`, `ocrResult`, `previewFileName` | `src/hooks/useOcr.ts` | Cargar archivo nuevo → estado limpio |
| Viernes | Integración end-to-end: OC → OCR → Tabla productos → Guardar → PDF | Navegador | Flujo completo sin datos perdidos |

### Gate de Salida Sprint 2
- ✅ Parser OC devuelve `productos[]` estructurados
- ✅ Frontend recibe `cantidad`/`unidad` correctos
- ✅ Regex TOTAL fix + test pasa
- ✅ Estado previo se limpia al cargar archivo
- ✅ Flujo OC→PDF end-to-end sin datos perdidos

---

## Sprint 3 — Arquitectura Frontend (Semana 3)

| Día | Tarea | Archivos | Criterio de Aceptación |
|-----|-------|----------|------------------------|
| Lunes | Crear `ReceptionDomainService` (puro TS): `calcularTarimas`, `generarCodigosQR`, `matchProductos`, `validarRecepcion` | `src/services/domain/receptionDomain.ts` (nuevo) | 100% testable, 0 dependencias React/Firebase |
| Martes | Extraer componentes: `WizardStep1`, `WizardStep2`, `WizardStep3`, `ProductTable`, `PdfGenerator`, `QRGenerator` | `src/screens/ProgramacionRecepcion/` (carpeta) | `ProgramacionRecepcion.tsx` < 300 líneas |
| Miércoles | State Machine Wizard: `useWizardMachine` (steps, validaciones, transiciones) | `src/hooks/useWizardMachine.ts` | Step 3 inaccesible si Step 1/2 inválidos |
| Jueves | Shared Library PDF/QR: `src/lib/documents/` usado por Programacion + ImpresionEtiquetas | `src/lib/documents/` + ambos screens | 0 duplicación PDF/QR |
| Viernes | Code Splitting: `React.lazy` por ruta + `Suspense` | `src/App.tsx`, `vite.config.ts` | Bundle inicial < 200KB gzipped |

### Gate de Salida Sprint 3
- ✅ `ProgramacionRecepcion.tsx` < 300 líneas
- ✅ Domain service puro TS con tests
- ✅ State machine controla wizard
- ✅ 0 duplicación PDF/QR
- ✅ Bundle inicial < 200KB gzipped

---

## Sprint 4 — Calidad y Operación (Semana 4)

| Día | Tarea | Archivos | Criterio de Aceptación |
|-----|-------|----------|------------------------|
| Lunes | Tests unitarios `ReceptionDomainService` (Vitest) | `src/services/domain/*.test.ts` | Coverage > 80% domain |
| Martes | Tests integración OCR (MSW mock Cloud Function) | `src/test/ocr.integration.test.ts` | Mock OCR → productos en tabla |
| Miércoles | CI Pipeline completo: `typecheck` → `lint` → `test` → `build` → `deploy` | `.github/workflows/ci.yml` | Push a main → deploy automático |
| Jueves | Zod Schemas: `ReceptionDocSchema`, `ReceptionLineSchema` + validación en `baseService.fromFirestore` | `src/services/firestore/schemas.ts` (nuevo) + `baseService.ts` | Documento inválido → error temprano |
| Viernes | Sentry + Structured Logging (pino) | `src/lib/sentry.ts`, `functions/ocr/logger.py` | Errores en dashboard, logs JSON |

### Gate de Salida Sprint 4
- ✅ Coverage domain > 80%
- ✅ CI pipeline pasa en push a main
- ✅ Zod valida boundary Firestore
- ✅ Sentry captura errores en prod

---

## Métricas de Seguimiento Semanal

| Métrica | Baseline (Hoy) | Target Sprint 4 |
|---------|----------------|-----------------|
| `tsc --noEmit` | ❌ Falla | ✅ Pasa |
| Errores Auth en prod | Sí (consola) | 0 |
| OCR endpoint público | ✅ Sí | ❌ No (protegido) |
| Persistencia evidencia | ❌ Rota | ✅ Funciona |
| Parser OC estructurado | ❌ Texto suelto | ✅ `productos[]` |
| Bundle gzipped | 596 KB | < 200 KB |
| Test coverage (domain) | 0% | > 80% |
| Deploy time | Manual 5 min | CI/CD 15 min |
| Bugs regresión/semana | Desconocido | 0 |

---

## Definición de "Done" Global

El proyecto se considera **estabilizado para producción** cuando:

1. **TypeScript strict** pasa sin errores en CI
2. **Autenticación real** funciona en dominio de producción
3. **OCR endpoint** protegido con App Check + rate limiting
4. **Evidencia** se persiste atómicamente (Storage + Firestore)
5. **Parser OC** devuelve datos estructurados compatibles con frontend
6. **God Component** descompuesto en servicios + componentes testeables
7. **Bundle** optimizado con code splitting (< 200KB gzipped initial)
8. **CI/CD** automatizado con quality gates obligatorios
9. **Cobertura de tests** > 80% en lógica de dominio
10. **Observabilidad** activa (Sentry + logs estructurados)

---

## Notas de Ejecución

- **Orden estricto:** No iniciar Sprint N+1 sin gate de salida Sprint N
- **Commits:** Convencionales (`fix:`, `feat:`, `refactor:`, `test:`, `ci:`)
- **PRs:** Cada tarea completada = PR con description + test plan
- **Rollback:** Si un fix rompe prod → revert inmediato + post-mortem
- **Comunicación:** Daily standup 15min al inicio de cada día de sprint

---

*Documento generado tras auditoría externa + defensa del developer a cargo. Plan aprobado para ejecución inmediata.*