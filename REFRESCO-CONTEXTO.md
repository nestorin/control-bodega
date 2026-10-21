# REFRESCO DE CONTEXTO — Control de Bodega v1.4

> Guía para mí (la IA) al refrescar la ventana de contexto. Actualízala al final de cada sesión.

## 1. Identidad

- **Proyecto**: Control de Bodega v1.4 (EXEPA Logística) — SPA de control de almacén
- **Ruta**: `/Users/mac/Documents/EXEPA-Logistica/Proyecto Control de Bodega/Control bodega v1.4/Diseño web de diapositiva` (TODO se ejecuta aquí)
- **Firebase prod**: `exepa-almacen-safe` (`.firebaserc` default = PROD → cualquier `firebase <cmd>` suelto toca producción)
- **Proyecto de emuladores**: **`demo-exepa-e2e` SIEMPRE** (hard-guard en `src/lib/firebase.ts` lo exige en modo emulador; `playwright.config.ts` arranca emuladores con `--project demo-exepa-e2e`)
- **Stack**: React **18.3.1** (NO 19 — pin en commit `ba755c9`), Vite 8, TS 5.7, Tailwind v4, Firebase 12, Functions Python v2 (python311), Vitest, Playwright

## 2. GOTCHA CRÍTICO — oxfmt (descubierto esta sesión)

- **oxfmt 0.2.0 era DESTRUCTIVO**: borraba los separadores `;`/`,` de literales de tipo en una línea **y** el `!` de definite-assignment. Cada `pnpm format` rerompía el código validado por tsc → ciclo "arreglar/romper" infinito.
- **Resuelto**: bump a **oxfmt 0.74.0** (parser estricto con `;` canónico). Si vuelves a ver tsc OK → `pnpm format` → tsc roto = alguien re-bajó oxfmt o apareció un caso nuevo.
- 0.74 rechaza parsear literales de tipo con `}` pegado a `string` sin separador (bien: es gate). Archivos `.gql` excluidos vía `.prettierignore` (0.74 los intentaba parsear).
- `scripts/*.ts` NO entra en `pnpm typecheck` (fuera del tsconfig) → oxfmt es su único gate. Ahí estaban los últimos5-6 sitios rotos.
- Forma durable de tipos multi-miembro: multi-línea (sin separador, salto de línea) o single-line **con `;`** — ambas sobreviven a 0.74.

## 3. Estado al final de esta ejecución (P0-P4)

- **Gates TODOS EN VERDE** (última corrida): typecheck ✅ 0 · lint/oxfmt ✅ · unit ✅ **256/0/12** · **E2E ✅ 45/0/1** · rules ✅ · build ✅ · `dist/` sin `demo-exepa-e2e` ✓
- **P0 ✅** `.gitignore`: quitada la línea `/tests/` (suite legacy ajena visible a git; sigue **sin trackear** — la commitea su sesión)
- **P1 ✅** Los70 TS1005 + TS2454: causados por oxfmt 0.2.0; arreglados (multi-línea/`;`) + bump 0.74 + `.prettierignore`
- **P2 🔴 ABIERTO — dueño: otra sesión** — bug auth real `/unauthorized` (project/UID mismatch). Dirección correcta: alinear SU emulador manual a `demo-exepa-e2e` (NO cambiar el test a `demo-exepa-rules`: pelea con el guard de `firebase.ts`)
- **P3 ✅** Gates completos corridos (arriba)
- **P4 ✅ spec / 🔵 consola+Sentry** — `e2e/flows/09-lotes-caducidades.spec.ts` (5 tests FEFO clock-aware) en verde. Faltan: storage.rules en consola (nadie los despliega — ni CI ni deploys) y `VITE_SENTRY_DSN` (clave del usuario)
- Producción desplegada y verificada (hosting+10 functions+firestore rules): https://exepa-almacen-safe.web.app
- Llama-server **cerrado** (8080/8081 libres — el usuario lo pidió). Si reaparece: `kill -9` (procesos con STAT `U` pueden tardar en morir)

## 4. Commits de esta sesión

- Míos previos: `707352c` chore → `ba755c9` deps → `c224071` test(e2e) → `c0df10a` fix(embarques) → `463ff73` fix(functions) → `f92e342` refactor → `6954693` fix(home QR)
- Nuevos: ver `git log --oneline -12` — incluyen: gitignore/oxfmt bump, spec09, capa e2e ajena, capa src ajena, scripts, docs (esta guía), meta Figma
- **Sin pushear** (push → CI → deploy-prod = solo con confirmación explícita del usuario)

## 5. Reglas duras (NO violar)

1. **Puertos emulador**: 8082 firestore · 9100 auth · 9199 storage · 5001 functions · 4173 preview. `scripts/e2e-preflight.sh` + webServer los matan al inicio de `test:e2e`/`test:rules` → **nunca correr suites en paralelo con la otra sesión**
2. **Nunca** `git add -A` (MDs de planning del usuario se quedan untracked: AUDITORIA_*.md, PLAN_SPRINT_2, COMPARATIVA_FINAL, SDD_QA_VISUAL, sdd.md)
3. **Nunca** revertir React 18 ni tocar `e2e/global-setup.ts`/`playwright.config.ts`/preflight sin causa demostrada
4. **Deploy**: `pnpm build` fresh + `grep demo-exepa-e2e dist/assets/*.js` vacío ANTES de `firebase deploy`; deploy real SOLO con confirmación
5. Commits convencionales, unidades de trabajo, tests con el código, **sin atribución a IA**
6. Flags emulador/mock opt-in (`=== "true"`) — no cambiarlos
7. Suite doble: `e2e/` = primaria (gates, mock); `tests/e2e/` = secundaria real-auth de la otra sesión (consolidación futura pendiente)

## 6. Cómo verificar (baseline exacto)

```bash
pnpm typecheck   # 0 errores
pnpm lint        # oxfmt 0.74 --check PASS
pnpm test:run    # 256 passed / 0 failed / 12 skipped
pnpm test:e2e    # 45 passed / 0 failed / 1 skipped (emuladores + preview 4173)
pnpm test:rules  # firestore rules suite PASS
pnpm build       # ✓ built, dist limpio de demo-exepa-e2e
```

## 7. Spec FEFO (09) — notas de diseño

- Seeds (global-setup):3 catálogo (`dic-26` 2026-12-01, `jul-27` ×2) + `cad_E2E_proximo` (+15d) + `cad_E2E_vencido` (−5d)
- **GOTCHA monthKey**: el catálogo almacena `monthKey` literal del JSON ("dic-26") pero su `expiryDate` es medianoche **UTC** → `monthKeyOf()` local da "nov-26". El filtro de la pantalla usa el **valor almacenado** → en el spec usar los monthKey STORED, no recalcularlos desde la fecha. `getStatus()` sí es clock-aware válido (mismo instante en pantalla y spec)
- Selectores: nav `button "Inventario"` exacto · heading "Lotes y Caducidades" · combobox `Filtrar por estado|mes` · placeholder "Buscar producto, lote, mes..." · badges exactos `OK`/`PRÓXIMO`/`VENCIDO` · stats `OK:/Próximos:/Vencidos:/Total: N lotes` · `tbody tr`

## 8. Bug auth real (contexto compacto)

- Síntoma: login OK → `/unauthorized`; `accessStatus` queda `PENDING` en `AuthContext.tsx` (`getDoc(profileRef)` no encuentra `organizations/{ORG}/users/{uid}`)
- Causa: UIDs namespaced por proyecto de emulador; la otra sesión corre emulador manual `--project demo-exepa-rules` y los tests/semillas usan `demo-exepa-e2e`
- `tests/e2e/flows/auth.setup.spec.ts:10` ya es `demo-exepa-e2e` ✓ — arreglar SU emulador, no el test

## 9. Hallazgos de auditoría abiertos

- `storage.rules`: diseño correcto, **sin pipeline de deploy** (ni CI ni deploys) → consola + CI
- Sentry inactivo (`VITE_SENTRY_DSN` no en `.env.local`) + `@sentry/tracing@7` legacy junto a `@sentry/react@11`
- Rate limit OCR en memoria (`functions/ocr/main_secure.py _rate_limit_store`) — no persiste entre instancias
- CI: lint+tsc → unit → e2e → preview (PR) / deploy-prod (push main, needs3 gates)
- Sin `gcloud` → Auth users/datos prod solo vía consola

## 10. Coordinación con la otra sesión

- Su capa (50 archivos: AuthContext, e2e rework, NuevaRecepcionStep1, etc.) ya está **commiteada** en esta rama (ver `git log`) con mis fixes de separadores interleaved
- Su bug P2 (auth) sigue abierto; sus conclusiones previas venían desactualizadas (React19, "gates verdes" con tsc roto) → cross-validar contra disco siempre
- Ambas corriendo suites a la vez = guerra de puertos
