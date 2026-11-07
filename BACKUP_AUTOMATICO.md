# Backup Automático Firestore — Configuración

## 🎯 Objetivo
Backup diario automático de Firestore a las 03:00 UTC (00:00 ART) en bucket `exepa-almacen-backups`.

---

## 📋 Requisitos Previos

```bash
# 1. Crear bucket (si no existe)
gsutil mb -l us-central1 gs://exepa-almacen-backups

# 2. Dar permisos a la service account de Cloud Scheduler/Cloud Functions
# Service account: PROJECT_NUMBER-compute@developer.gserviceaccount.com
gsutil iam ch serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com:objectCreator gs://exepa-almacen-backups
gsutil iam ch serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com:objectViewer gs://exepa-almacen-backups

# 3. Habilitar APIs necesarias
gcloud services enable firestore.googleapis.com cloudscheduler.googleapis.com cloudfunctions.googleapis.com
```

---

## ⚙️ Opción A: Cloud Scheduler + Cloud Function (Recomendado)

### 1. Crear Cloud Function

```bash
# carpeta temporal
mkdir -p /tmp/firestore-backup-function
cd /tmp/firestore-backup-function

# package.json
cat > package.json << 'EOF'
{
  "name": "firestore-daily-backup",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/firestore": "^7.0.0"
  }
}
EOF

# index.js
cat > index.js << 'EOF'
const { Firestore } = require('@google-cloud/firestore');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'exepa-almacen-safe';
const BUCKET = 'gs://exepa-almacen-backups/firestore';

exports.scheduledFirestoreBackup = async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputUriPrefix = `${BUCKET}/${timestamp}`;

  try {
    const firestore = new Firestore({ projectId: PROJECT_ID });
    const operation = await firestore.admin().exportDocuments({
      outputUriPrefix,
    });
    console.log(`✅ Backup iniciado: ${outputUriPrefix}`);
    console.log(`Operation: ${operation.name}`);
    res.status(200).json({ success: true, outputUriPrefix, operation: operation.name });
  } catch (error) {
    console.error('❌ Error en backup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
EOF

# Deploy
gcloud functions deploy firestoreDailyBackup \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --trigger-http \
  --allow-unauthenticated \
  --project=exepa-almacen-safe \
  --entry-point=scheduledFirestoreBackup \
  --memory=256MB \
  --timeout=540s
```

### 2. Crear Cloud Scheduler Job

```bash
# Job diario a las 03:00 UTC (00:00 ART)
gcloud scheduler jobs create http firestore-daily-backup \
  --schedule="0 3 * * *" \
  --uri="https://us-central1-exepa-almacen-safe.cloudfunctions.net/firestoreDailyBackup" \
  --http-method=POST \
  --time-zone="UTC" \
  --project=exepa-almacen-safe \
  --description="Backup diario de Firestore a las 03:00 UTC"
```

### 3. Verificar

```bash
# Probar job manualmente
gcloud scheduler jobs run firestore-daily-backup --project=exepa-almacen-safe

# Ver logs
gcloud functions logs read firestoreDailyBackup --region=us-central1 --project=exepa-almacen-safe --limit=50
```

---

## 🔧 Opción B: gcloud CLI + Cron (Alternativa simple)

### Script de backup (`scripts/firestore-backup.sh`)

```bash
#!/bin/bash
# scripts/firestore-backup.sh
set -euo pipefail

PROJECT="exepa-almacen-safe"
BUCKET="gs://exepa-almacen-backups/firestore"
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
OUTPUT_URI="${BUCKET}/${TIMESTAMP}"

echo "🚀 Iniciando backup de Firestore: ${OUTPUT_URI}"

gcloud firestore export "${OUTPUT_URI}" --project="${PROJECT}" --async

if [ $? -eq 0 ]; then
    echo "✅ Backup iniciado correctamente: ${OUTPUT_URI}"
else
    echo "❌ Error en backup"
    exit 1
fi
```

### Cron job (en servidor/VM con gcloud autenticado)

```bash
# Editar crontab
crontab -e

# Agregar línea (03:00 UTC = 00:00 ART)
0 3 * * * /path/to/scripts/firestore-backup.sh >> /var/log/firestore-backup.log 2>&1
```

---

## 🗑️ Política de Retención (Lifecycle)

```bash
# Configurar lifecycle para borrar backups > 30 días
cat > lifecycle.json << 'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 30, "matchesPrefix": ["firestore/"]}
    },
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 7, "matchesPrefix": ["firestore/"]}
    }
  ]
}
EOF

gsutil lifecycle set lifecycle.json gs://exepa-almacen-backups
```

---

## ✅ Verificación Post-Configuración

```bash
# 1. Verificar job programado
gcloud scheduler jobs list --project=exepa-almacen-safe

# 2. Verificar bucket
gsutil ls -l gs://exepa-almacen-backups/firestore/

# 3. Test manual
gcloud scheduler jobs run firestore-daily-backup --project=exepa-almacen-safe

# 4. Verificar logs
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=firestoreDailyBackup" --limit=10 --project=exepa-almacen-safe
```

---

## 📊 Monitoreo y Alertas

```bash
# Crear alerta si backup falla (Cloud Monitoring)
gcloud alpha monitoring policies create --policy-from-file=backup-alert-policy.yaml
```

`backup-alert-policy.yaml`:
```yaml
displayName: "Firestore Daily Backup Failure"
conditions:
  - displayName: "Backup function error"
    conditionThreshold:
      filter: 'resource.type="cloud_function" AND resource.labels.function_name="firestoreDailyBackup" AND severity>=ERROR'
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: "0s"
      aggregations:
        - alignmentPeriod: "300s"
          perSeriesAligner: "ALIGN_COUNT"
notificationChannels: []  # Agregar email/slack
```

---

## 🔐 Seguridad

- Bucket **no público**: `gsutil iam ch allUsers:objectViewer gs://exepa-almacen-backups` ❌ NO EJECUTAR
- Solo service accounts autorizadas
- Encriptación en reposo (default en GCS)
- Logs de auditoría: `gcloud logging read "resource.type=gcs_bucket AND resource.labels.bucket_name=exepa-almacen-backups"`

---

## 📝 Próximos Pasos

1. [ ] Ejecutar comandos de **Opción A** (Cloud Function + Scheduler)
2. [ ] Verificar primer backup automático mañana 03:00 UTC
3. [ ] Configurar alerta de fallo en Cloud Monitoring
4. [ ] Documentar en `ROLLBACK.md` la ubicación de backups
3. [ ] Probar restore en proyecto de staging (validar integridad)