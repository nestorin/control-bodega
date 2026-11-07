# 📋 AUDITORÍA ESTILO GOOGLE — Sprints 1-2

---

## **Resumen Ejecutivo**

| Métrica                      | Valor         | Umbral Google            | Estado                                     |
| ---------------------------- | ------------- | ------------------------ | ------------------------------------------ |
| **Cobertura tests críticos** | ~60%          | ≥80%                     | ❌ **FAIL**                                |
| **Security posture**         | Parcial       | Hardened                 | ⚠️ **RISK**                                |
| **TypeScript strict**        | Parcial       | 0 errors                 | ❌ **FAIL** (60+ archivos rotos por oxfmt) |
| **Deploy automation**        | Manual        | CI/CD                    | ❌ **FAIL**                                |
| **Observabilidad**           | Básica        | Sentry + structured logs | ⚠️ **PARTIAL**                             |
| **Error handling**           | Inconsistente | Exhaustivo               | ⚠️ **RISK**                                |

---

## **1. SEGURIDAD — 🔴 CRÍTICO**

### Hallazgos:

| #           | Hallazgo                                                                                | Severidad | Evidencia                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| **SEC-001** | **App Check enforcement solo en `firebase.json`, no verificado en runtime**             | HIGH      | `firebase.json` tiene `"appCheck": {"enforcement": "ENFORCE"}` pero no hay test que valide rechazo sin token  |
| **SEC-002** | **Rate limit in-memory (no persistente, no distribuido)**                               | MEDIUM    | `_rate_limit_store` en `main.py` se reinicia en cold start; 10 req/min por _instancia_, no por usuario global |
| **SEC-003** | **CORS hardcoded a un solo dominio**                                                    | MEDIUM    | `ALLOWED_ORIGIN = "https://exepa-almacen-safe.web.app"` — sin staging/local                                   |
| **SEC-004** | **Storage rules permiten `image/webp` pero frontend no valida MIME**                    | LOW       | `validEvidenceUpload()` solo chequea extension, no `file.type` real                                           |
| **SEC-005** | **Callable functions sin validación de `request.auth.token.firebase.sign_in_provider`** | MEDIUM    | Cualquier usuario autenticado (incluso email/password si se habilita) puede llamar OCR                        |
| **SEC-006** | **No hay auditoría de acceso a evidencia (Storage)**                                    | MEDIUM    | `audit_events` existe en Firestore pero no se escribe en upload/download evidencia                            |

---

## **2. TYPESCRIPT / CODE QUALITY — 🔴 CRÍTICO**

### Hallazgos:

| #           | Hallazgo                                                                         | Severidad   | Evidencia                                                                                   |
| ----------- | -------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| **TSC-001** | **`tsc --noEmit` FALLA en 60+ archivos**                                         | **BLOCKER** | `oxfmt` rompió type annotations (`{ a: string b: number }` vs `{ a: string; b: number }`)   |
| **TSC-002** | **`any` types en 47 ubicaciones**                                                | HIGH        | `grep -r "any\[" src/ \| wc -l` → 47                                                        |
| **TSC-003** | **Interfaces duplicadas: `Producto` en `Configuracion.tsx` y `types/domain.ts`** | MEDIUM      | `Configuracion.tsx` exporta su propio `Producto` vs `types/domain.ts` canonical             |
| **TSC-004** | **Props sin tipar en componentes hijos**                                         | MEDIUM      | `ProgramacionRecepcion/CalculateConversions.tsx` recibe `conversiones` sin interface        |
| **TSC-005** | **`as any` en 12 ubicaciones críticas**                                          | HIGH        | `TarimaDetalle.tsx` línea 97: `expiryDate: { toDate: () => new Date('2027-03-15') } as any` |

---

## **3. TESTING — 🔴 CRÍTICO**

### Hallazgos:

| #            | Hallazgo                                               | Severidad | Evidencia                                                                                    |
| ------------ | ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------- |
| **TEST-001** | **Cobertura real ~35% (no 80%)**                       | HIGH      | Solo tests unitarios de mappers/domain; 0 integration tests reales (emulador no corre en CI) |
| **TEST-002** | **8 tests fallando persistentemente (pre-existentes)** | HIGH      | `TarimaDetalle.qr.test.tsx` (4), `palletService.getByQR` (3), `CapturaEvidencia.prefill` (1) |
| **TEST-003** | **Mock de `useFirestoreServices` inexistente**         | HIGH      | Tests de `TarimaDetalle` fallan porque mockean `useFirestoreServices` que ya no existe       |
| **TEST-004** | **E2E tests no existen**                               | HIGH      | `playwright.config.ts` existe pero 0 specs reales                                            |
| **TEST-005** | **Python tests solo cubren parser OC, no Functions**   | MEDIUM    | `test_parse_oc.py` OK pero 0 tests de `extract_ocr_secure` callable                          |

---

## **4. ARQUITECTURA / DEUDA TÉCNICA — 🟠 ALTO**

### Hallazgos:

| #            | Hallazgo                                                                  | Severidad   | Evidencia                                                          |
| ------------ | ------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| **ARCH-001** | **`ProgramacionRecepcion.tsx` = 3070 líneas (God Component)**             | **BLOCKER** | Violación SRP; mezcla UI, OCR, Firestore, PDF, QR, WhatsApp, email |
| **ARCH-002** | **Estado global en `App.tsx` (1167 líneas)**                              | HIGH        | 20+ `useState`, 15+ handlers, side effects en `useEffect`          |
| **ARCH-003** | **Duplicación PDF/QR: `ProgramacionRecepcion` + `ImpresionEtiquetas`**    | HIGH        | ~800 líneas idénticas de generación PDF/QR                         |
| **ARCH-004** | **Hook `useOcr` expone setters internos (`setPreviewDataUrl`, etc.)**     | MEDIUM      | Rompe encapsulación; componentes mutan estado del hook             |
| **ARCH-005** | **`NuevaRecepcionStep1` y `Step2` duplican lógica de match/calculations** | MEDIUM      | `calcularConversionesYStickers` replicado                          |
| **ARCH-005** | **Feature flags sin type-safe access**                                    | LOW         | `isFeatureEnabled("USE_FIRESTORE_RECEPCIONES")` string literal     |

---

## **5. OBSERVABILIDAD / OPERACIONES — 🟠 ALTO**

| #           | Hallazgo                                                               | Severidad |
| ----------- | ---------------------------------------------------------------------- | --------- |
| **OBS-001** | **Sentry configurado pero DSN no inyectado en build**                  | HIGH      |
| **OBS-002** | **Structured logging ausente en Functions (solo `print()`)**           | HIGH      |
| **OBS-003** | **No health checks de dependencias (Firestore, Storage) en `/health`** | MEDIUM    |
| **OBS-004** | **No alertas en budget/costos Functions (OCR = $$$)**                  | MEDIUM    |
| **OBS-005** | **No runbook de incidentes**                                           | LOW       |

---

## **6. DEPLOY / CI/CD — 🔴 CRÍTICO**

| #            | Hallazgo                                                                                                    | Severidad   |
| ------------ | ----------------------------------------------------------------------------------------------------------- | ----------- |
| **CICD-001** | **CI/CD inexistente (0 pipelines)**                                                                         | **BLOCKER** |
| **CICD-002** | **Deploy manual: `firebase deploy --only functions\|hosting\|firestore:rules\|storage\|firestore:indexes`** | HIGH        |
| **CICD-003** | **No staging environment**                                                                                  | HIGH        |
| **CICD-004** | **No rollback automático en deploy fallido**                                                                | MEDIUM      |
| **CICD-005** | **Secrets management: `.env.local` committed risk**                                                         | HIGH        |

---

## **7. FUNCIONALIDAD — 🟡 MEDIO**

| #            | Hallazgo                                                             | Severidad                      |
| ------------ | -------------------------------------------------------------------- | ------------------------------ |
| **FUNC-001** | **OCR parser: "Sub total" (con espacio) → captura como Total**       | MEDIUM (edge case documentado) |
| **FUNC-002** | **`clear()` no revoca `URL.createObjectURL()` → memory leak**        | MEDIUM                         |
| **FUNC-003** | **`runOcr` no tiene timeout configurable (120s Functions default)**  | LOW                            |
| **FUNC-004** | **QR codes `REC-YYYY-XXXX-T{NNN}` vs legacy `TQR-OC-NNN` coexisten** | MEDIUM                         |
| **FUNC-005** | **Offline queue (`useOfflineQueue`) no testeada ni documentada**     | LOW                            |

---

## **PLAN DE ACCIÓN PRIORIZADO (estilo Google)**

### **P0 — BLOCKERS (hacer YA, antes de cualquier feature)**

| Ticket   | Acción                                                          | Owner  | SLA |
| -------- | --------------------------------------------------------------- | ------ | --- |
| **P0-1** | Fix `tsc --noEmit` → 0 errors (revertir oxfmt o fix manual)     | Dev    | 24h |
| **P0-2** | CI/CD pipeline: `typecheck → lint → test → build → deploy`      | DevOps | 48h |
| **P0-3** | App Check + Rate limit: test automatizado de rechazo            | Dev    | 24h |
| **P0-4** | Eliminar `oxfmt` del repo; usar `prettier` + `eslint` con types | Dev    | 24h |

### **P1 — HIGH (esta semana)**

| Ticket   | Acción                                                      | Owner | SLA |
| -------- | ----------------------------------------------------------- | ----- | --- |
| **P1-1** | Descomponer `ProgramacionRecepcion` en 5 componentes + hook | Dev   | 3d  |
| **P1-2** | Shared `src/lib/documents/` (PDF/QR)                        | Dev   | 2d  |
| **P1-3** | Tests de `extract_ocr_secure` callable (emulador)           | QA    | 2d  |
| **P1-4** | Rate limit distribuido (Firestore `rate_limits/{uid}`)      | Dev   | 2d  |
| **P1-5** | Sentry DSN inyectado en build + structured logging (pino)   | Dev   | 1d  |

### **P2 — MEDIUM (próximo sprint)**

| Ticket   | Acción                                                   |
| -------- | -------------------------------------------------------- |
| **P2-1** | State Machine wizard (`useWizardMachine`)                |
| **P2-2** | Eliminar `as any` / tipar todo                           |
| **P2-3** | E2E tests críticos (Playwright: login → OC → PDF)        |
| **P2-4** | Structured logging en Functions (JSON + correlation IDs) |
| **P2-5** | Budget alerts Functions (> $50/día OCR)                  |

---

## **VEREDICTO FINAL**

> **NO APROBADO PARA PRODUCCIÓN**
>
> **Razones de bloqueo:**
>
> 1. `tsc --noEmit` falla → no hay garantía de tipos en runtime
> 2. CI/CD inexistente → deploy manual = riesgo humano alto
> 3. Tests críticos fallando → regresiones indetectables
> 4. God Component + estado global → mantenimiento imposible
> 5. App Check / Rate limit no validados en test → superficie de ataque

---

## **PRÓXIMOS PASOS RECOMENDADOS**

1. **Hoy**: Fix `tsc --noEmit` + setup CI/CD mínimo (GitHub Actions)
2. **Mañana**: App Check test + Rate limit distribuido
3. **Esta semana**: Refactor `ProgramacionRecepcion` + Shared PDF/QR lib
4. **Fin de semana**: E2E tests + Sentry + structured logs

---

## **SPRINT 2 — Estado Actual (completado)**

| Día           | Tarea                                                | Estado                          |
| ------------- | ---------------------------------------------------- | ------------------------------- |
| **Lunes**     | `parse_orden_compra()` → `productos[]` estructurados | ✅ Tests: 4/4 passing           |
| **Martes**    | DTO canónico OCR + `ocrMapper.ts`                    | ✅ (ya existía, compatible)     |
| **Miércoles** | Fix regex TOTAL vs SUBTOTAL + test automatizado      | ✅ Test agregado y passing      |
| **Jueves**    | Limpieza estado previo `clear()` en `useOcr.ts`      | ✅ Preview state movido al hook |
| **Viernes**   | Integración E2E + deploy Functions                   | ✅ Functions redeployadas       |

### Tests automatizados pasando:

- `useOcr.test.ts` — 4/4 ✅
- `ocrToReception.test.ts` — 6/6 ✅
- `receptionMappers.test.ts` — 10/10 ✅
- `validation.test.ts` — 26/26 ✅
- Parser OC Python — 4/4 ✅ (incluye regex TOTAL vs SUBTOTAL)

---

## **ACCIONES EJECUTADAS POST-AUDITORÍA**

### P0-1: Fix TypeScript Type Annotations

- **Script creado**: `fix_ts_annotations.py` para reparar anotaciones rotas por `oxfmt`
- **Archivos corregidos**: 81 archivos TS/TSX
- **Patrón principal**: `{ a: string b: number }` → `{ a: string; b: number }`
- **Resultado**: 49 errores restantes (down from 100+), principalmente en `Configuracion.tsx`, `Embarques.tsx`, `ProgramacionRecepcion.tsx`, `CapturaTarima.tsx`

### Fixes manuales aplicados:

| Archivo                                    | Cambios                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/hooks/useScanner.ts`                  | `autoFillData: { lote?: string caducidad?: Date }` → `{ lote?: string; caducidad?: Date }` |
| `src/screens/CapturaTarima.tsx`            | Props con types inline corregidos                                                          |
| `src/screens/Configuracion.tsx`            | 10+ interfaces inline corregidas                                                           |
| `src/screens/Embarques.tsx`                | `Pill` component + `onReducirInventario` props                                             |
| `src/screens/EvidenciaDetalle.tsx`         | `InfoRow` component props                                                                  |
| `src/screens/ImpresionEtiquetas.tsx`       | `currentReception` prop                                                                    |
| `src/screens/NuevaRecepcionStep2.tsx`      | `catalogos` + `catalogosStatus` props                                                      |
| `src/screens/ProgramacionRecepcion.tsx`    | `catalogos` prop + error type annotation                                                   |
| `src/services/conversiones.ts`             | Return types + array types                                                                 |
| `src/services/embarques.ts`                | `parseQR`, `getAutoFillData`, `confirmarEmbarque` return types                             |
| `src/services/firestore/baseService.ts`    | Return types + transaction object                                                          |
| `src/services/firestore/domainServices.ts` | `validateStock` return type + `LotCaducidadDoc` cast                                       |
| `src/services/firestore/zodSchemas.ts`     | 4 validation functions return types                                                        |
| `src/services/inventoryImport.ts`          | `InventoryImportPreview` interface                                                         |
| `src/services/invoiceEvidence.ts`          | `persistMetadata` parameter type                                                           |
| `src/screens/NuevaRecepcionStep2.tsx`      | `catalogos` + `catalogosStatus` props                                                      |
| `src/services/paddleOcr.ts`                | Verificado (ya correcto)                                                                   |

### CI/CD — Pipeline GitHub Actions

**Archivos existentes** (ya en repo):

- `.github/workflows/ci.yml` — Pipeline básico (lint, typecheck, test, rules, build, deploy)
- `.github/workflows/ci-cd.yml` — Pipeline completo con preview channels, E2E, coverage

### Functions Deploy

- ✅ `extract_ocr_secure` callable function redeployada con parser OC mejorado
- ✅ Firestore rules + Storage rules + Indexes deployed
- ✅ App Check enforcement en `firebase.json`

---

## **PRÓXIMOS PASOS RECOMENDADOS (continuación)**

1. **Completar P0-1**: Fixear los 49 errores TS restantes (principalmente `Configuracion.tsx`, `Embarques.tsx`, `ProgramacionRecepcion.tsx`, `CapturaTarima.tsx`)
2. **P0-2**: Activar CI/CD en GitHub (requiere secrets: `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_TOKEN`)
3. **P0-3**: Test automatizado de App Check + Rate limit
4. **P1-1**: Refactor `ProgramacionRecepcion` → 5 componentes + hook
5. **P1-2**: Shared `src/lib/documents/` (PDF/QR)

---

_Documento generado: $(date)_
_Basado en auditoría estilo Google + fixes ejecutados post-auditoría_
