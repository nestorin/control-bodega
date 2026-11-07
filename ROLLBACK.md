# Runbook de Rollback — Control de Bodega v1.4

**Última actualización:** 2026-11-07
**Versión estable actual:** `v1.4.0-audit-complete` (320 unit tests + 44 e2e passing)

---

## 🚨 Rollback de Código (Git)

### Opción A: Tag estable (recomendado)
```bash
# 1. Verificar tags disponibles
git tag -l "v1.4.*" --sort=-v:refname

# 2. Checkout al tag estable
git checkout v1.4.0-audit-complete

# 3. Forzar push a main (requiere permisos admin)
git push -f origin main
```

### Opción B: Commit específico
```bash
# Ver historial reciente
git log --oneline -20

# Resetear a commit conocido bueno
git reset --hard <commit-hash>

# Forzar push
git push -f origin main
```

### Opción C: Revertir último merge (si fue PR)
```bash
# En GitHub UI: PR → "Revert" → crea PR de revert
# O desde CLI:
git revert -m 1 <merge-commit-hash>
git push origin main
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

| Rol | Contacto | Escala |
|-----|----------|--------|
| **Dev Lead** | Nestor | Código, CI/CD, Git |
| **Firebase Admin** | Nestor | Firestore, Auth, Functions |
| **Infra/DevOps** | Nestor | CI/CD, Secrets, DNS |
| **Soporte Firebase** | support.google.com/firebase | Quota, outages, billing |

---

## 📋 Historial de Tags Estables

| Tag | Fecha | Descripción |
|-----|-------|-------------|
| `v1.4.0-audit-complete` | 2026-11-07 | Post-auditoría: 320 unit + 44 e2e pass, todos fixes aplicados |
| `v1.4.0-pre-god-refactor` | Pendiente | Antes de iniciar refactor God Component |

---

## 🔄 Backup Automático Firestore (Configurado)

Ver: `BACKUP_AUTOMATICO.md` para configuración de `gcloud scheduler` + Cloud Function diaria a las 03:00 UTC.

---

**Última prueba de rollback:** 2026-11-07 (tag `v1.4.0-audit-complete` verificado)
**Próxima revisión:** Antes de iniciar refactor God Component