# Runbook de Rollback — Control de Bodega v1.4

**Última actualización:** 2026-11-07
**Versión estable actual:** `v1.4.0-audit-complete` (320 unit tests + 44 e2e passing)

---

## 🚨 Rollback de Código (Git)

**Regla de oro: en `main` se usa `git revert`, nunca `git reset --hard` ni `git push -f`.**

`reset --hard` + force push reescribe historia compartida: rompe el `origin/main` de cualquier
persona que tenga el repo clonado, invalida los tags ya publicados y hace que el reflog local deje
de coincidir con el remoto. Un `revert` crea un commit nuevo que deshace el cambio: el historial
se mantiene lineal, el CI vuelve a correr sobre el resultado y el deploy se repite solo.

### Opción A: Revertir el último commit (recomendado)

```bash
# Ver qué se quiere deshacer
git log --oneline -5

# Deshacer el commit como un commit nuevo (no reescribe historia)
git revert --no-edit <commit-hash>

# Push normal, sin force
git push origin main
# El CI corre y vuelve a desplegar automáticamente la versión sana
```

### Opción B: Revertir un merge (si se metió vía PR)

```bash
git revert -m 1 <merge-commit-hash>
git push origin main
```

### Opción C: Volver a un tag estable

```bash
# 1. Ver tags disponibles
git tag -l "v1.4.*" --sort=-v:refname

# 2. Aplicar el contenido de ese tag sobre main, sin tocar el historial
git revert --no-edit <tag>          # o: git merge <tag>
git push origin main
```

> ⚠️ `git push -f origin main` y `git reset --hard` se reservan **únicamente** para un desastre
> local (historial corrupto, rebase a medias) y siempre coordinados: avisar antes, y nunca si
> alguien más ya clonó el estado a descartar. Si dudas, haz `revert`.

### Recuperación accidental (si ya se hizo un reset)

```bash
# El reflog conserva el estado previo durante ~90 días
git reflog                      # localizar el hash anterior al reset
git reset --hard <hash-previo>  # solo si nadie más tiene el remoto avanzado
git push --force-with-lease     # NUNCA --force a ciegas
```

---

## 🔥 Rollback de Firestore (Base de Datos)

### Listar backups disponibles

```bash
gsutil ls gs://exepa-almacen-backups/firestore/
# Ejemplo salida:
# gs://exepa-almacen-backups/firestore/20261107-030000/
# gs://exepa-almacen-backups/firestore/20261106-030000/
```

### Restaurar backup completo

```bash
# ADVERTENCIA: Sobreescribe TODA la base de datos actual
gcloud firestore import gs://exepa-almacen-backups/firestore/20261107-030000 \
  --project=exepa-almacen-safe
```

### Restaurar solo una colección (ej: receptions)

```bash
# Exportar solo la colección afectada del backup
gcloud firestore import gs://exepa-almacen-backups/firestore/20261107-030000 \
  --collection-ids=receptions \
  --project=exepa-almacen-safe
```

---

## ⚙️ Rollback de Configuración / Secrets

### GitHub Secrets (Variables de build)

1. Ir a: **Settings → Secrets and variables → Actions**
2. Restaurar valores anteriores desde historial del repo o backup manual
3. Secrets críticos: `VITE_FIREBASE_*`, `VITE_RECAPTCHA_SITE_KEY`, `FIREBASE_SERVICE_ACCOUNT`

### Firebase App Check / reCAPTCHA

```bash
# Si hay problema con App Check enforcement:
# 1. Firebase Console → App Check → Desactivar "Enforce"
# 2. O actualizar site key en: Authentication → Settings → reCAPTCHA Enterprise
```

### Feature Flags (Rollback instantáneo sin deploy)

```bash
# Desactivar feature problemática en Vercel/Firebase Hosting:
# VITE_USE_NEW_RECEPTION_FLOW=false
# VITE_USE_FIREBASE_EMULATORS=false
# VITE_USE_MOCK_AUTH=true
# Redeploy automático al cambiar env vars
```

---

## ✅ Checklist Post-Rollback

- [ ] `npm run test:run` → 320 tests pasan
- [ ] `npm run test:e2e` → 44 tests pasan (en staging)
- [ ] Login Google funciona
- [ ] Flujo recepción completo: Login → Nueva Recepción → Tarimas → Confirmado
- [ ] Inventario sincroniza correctamente
- [ ] No hay errores en consola (`npm run test:smoke`)
- [ ] `npm run build` compila sin warnings

---

## 📞 Contactos de Emergencia

| Rol                  | Contacto                    | Escala                     |
| -------------------- | --------------------------- | -------------------------- |
| **Dev Lead**         | Nestor                      | Código, CI/CD, Git         |
| **Firebase Admin**   | Nestor                      | Firestore, Auth, Functions |
| **Infra/DevOps**     | Nestor                      | CI/CD, Secrets, DNS        |
| **Soporte Firebase** | support.google.com/firebase | Quota, outages, billing    |

---

## 📋 Historial de Tags Estables

| Tag                       | Fecha      | Descripción                                                   |
| ------------------------- | ---------- | ------------------------------------------------------------- |
| `v1.4.0-audit-complete`   | 2026-11-07 | Post-auditoría: 320 unit + 44 e2e pass, todos fixes aplicados |
| `v1.4.0-pre-god-refactor` | Pendiente  | Antes de iniciar refactor God Component                       |

---

## 🔄 Backup Automático Firestore (⚠️ PENDIENTE — no está configurado)

Estado real verificado el 2026-11-07: **el backup automático NO existe todavía.**

| Requisito                           | Estado                                   |
| ----------------------------------- | ---------------------------------------- |
| API `cloudscheduler.googleapis.com` | ❌ deshabilitada en `exepa-almacen-safe` |
| Bucket `gs://exepa-almacen-backups` | ❌ no creado                             |
| Job diario 03:00 UTC                | ❌ no existe                             |

Ver `BACKUP_AUTOMATICO.md` para los comandos exactos de configuración. Hasta que esto quede
verde, **no existe backup de los datos de producción**: `ROLLBACK.md` solo puede restaurar
código, no recepciones ni tarimas.

---

**Última prueba de rollback:** 2026-11-07 (tag `v1.4.0-audit-complete` verificado)
**Próxima revisión:** Antes de iniciar refactor God Component
