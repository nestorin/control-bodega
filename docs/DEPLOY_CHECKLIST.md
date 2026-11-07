# Salud del proyecto — checklist verificable

**Última verificación:** 2026-11-07
**Proyecto:** `exepa-almacen-safe` · repo `nestorin/control-bodega` · hosting `exepa-almacen-safe.web.app`

Cada punto tiene un **estado verificado**, no estimado. La columna "Cómo se re-verifica"
es la prueba que se vuelve a correr cuando algo cambia.

---

## 1. Código en el repositorio

| Punto                             | Estado | Cómo se verifica                                                                                   |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `main` == `origin/main`           | ✅     | `git status -sb` → 0 ahead / 0 behind                                                              |
| Sin cambios sin commitear         | ✅     | `git status --porcelain` → vacío                                                                   |
| Secrets fuera del repo            | ✅     | `git log --all --diff-filter=A --name-only \| grep '\.env'` → solo `.env.example`                  |
| Valores reales de API key en HEAD | ✅     | `git grep -E 'AIza[0-9A-Za-z_-]{30,}' HEAD` → sin coincidencias                                    |
| Infra como código                 | ✅     | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` trackeados           |
| Índices Firestore en el repo      | ✅     | `firestore.indexes.json` incluye `pallets(qrIdentifier + warehouseId)` (era el índice que faltaba) |
| Functions trackeadas              | ✅     | `git ls-files functions` → 17 archivos                                                             |

---

## 2. Verificación antes de cada commit

| Punto                      | Estado | Evidencia                                                  |
| -------------------------- | ------ | ---------------------------------------------------------- |
| CI en cada push a `main`   | ✅     | `.github/workflows/ci-cd.yml` → lint, typecheck, unit, E2E |
| Lint (`oxfmt --check`)     | ✅     | corregido en `16ed718` (18 archivos formateados)           |
| Typecheck (`tsc --noEmit`) | ✅     | 0 errores                                                  |
| Unit tests                 | ✅     | 320 passed / 29 skipped                                    |
| E2E (Playwright)           | ✅     | 44 passed / 1 skipped                                      |
| Deploy atado al CI         | ✅     | `deploy-production` necesita los 3 jobs verdes             |

**Disciplina:** un commit deja el árbol en verde. Si un commit rompe los tests, no se sube.

---

## 3. Deploy a producción

| Punto                          | Estado                       | Cómo se verifica                                                                                          |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Último deploy verificado       | `3136d3e` (Roles y usuarios) | bundle en vivo contiene "Roles y usuarios"                                                                |
| Prueba definitiva de deploy    | ✅ método listo              | descargar `https://exepa-almacen-safe.web.app/assets/index-*.js` y buscar un string distintivo del cambio |
| Hash del bundle local vs. vivo | usar como señal rápida       | local `dist/assets/index-*.js` ≠ vivo → hay desfase                                                       |

> El bundle tiene `Cache-Control: immutable` (1 año) y `index.html` es `no-cache`: siempre se
> compara contra el **hash del bundle**, no contra la página en blanco.

---

## 4. Puntos pendientes (acción humana o infraestructura)

| #   | Punto                              | Estado          | Acción exacta                                                                                                                                               |
| --- | ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **App Check + reCAPTCHA**          | ⏭️ pendiente    | Firebase Console → App Check → registrar la app con la site key, y `firebase deploy --only functions` para que `appCheck.enforcement: ENFORCE` tenga efecto |
| 2   | **Backup automático de Firestore** | ❌ no existe    | habilitar `cloudscheduler.googleapis.com`, crear `gs://exepa-almacen-backups`, job diario 03:00 UTC — pasos en `BACKUP_AUTOMATICO.md`                       |
| 3   | **Protección de `main`**           | ❌ sin proteger | GitHub → Settings → Branches → exigir status checks (`Lint & TypeCheck`, `Unit Tests`, `E2E Tests`) antes de merge                                          |
| 4   | **Export programado**              | ❌              | cubierto por el punto 2                                                                                                                                     |

---

## 5. Resiliencia (respaldo que no depende de un solo proveedor)

| Punto                         | Estado | Artefacto                                                                                                |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Backup completo del historial | ✅     | `~/Documents/EXEPA-Logistica/backups/control-bodega-<fecha>.bundle` (verificado con `git bundle verify`) |
| Punto de retorno inmutable    | ✅     | tag `v1.4.0-audit-complete`                                                                              |
| Runbook de rollback           | ✅     | `ROLLBACK.md` — corregido a `git revert` (sin force push)                                                |
| Restauración de datos         | ❌     | depende del punto 4.2                                                                                    |

Recuperar el bundle en otra máquina:

```bash
git clone control-bodega-<fecha>.bundle control-bodega-restored
```

---

## 6. Cómo se ejecuta la verificación completa

```bash
pnpm lint && pnpm typecheck && pnpm test:run   # local, < 1 min
git status -sb && git ls-remote origin main    # repo sincronizado
gh run list --limit 1                          # último CI
curl -s https://exepa-almacen-safe.web.app/ | grep -o 'assets/index-[^"]*\.js'
```
