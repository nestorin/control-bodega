# Plan de implementación RBAC — EXEPA Logística

Este documento define el diseño objetivo y el plan de ejecución para un control de acceso basado en roles (RBAC), organización y almacén. Su propósito es eliminar accesos cruzados entre almacenes, hacer explícitas las transiciones operativas y mantener una auditoría verificable en Firestore, Storage y Cloud Functions.

> **Estado:** plan técnico listo para implementación. No modifica código ni infraestructura por sí mismo.

## Quick path

1. Congelar el modelo de datos y la matriz de permisos de este documento.
2. Implementar primero validadores y pruebas de reglas; no comenzar por la UI.
3. Migrar datos y membresías en un entorno de staging.
4. Ejecutar el rollout con reglas en modo compatible, observabilidad y rollback preparado.
5. Activar restricciones por dominio sólo cuando las pruebas negativas y los logs de `permission-denied` estén limpios.

## 1. Objetivos y no objetivos

### Objetivos

- Aislar cada operación por `organizationId` y `warehouseId`.
- Impedir que un usuario se asigne roles o permisos a sí mismo.
- Definir permisos por acción y por transición, no sólo por colección.
- Centralizar operaciones sensibles y transaccionales en Cloud Functions.
- Garantizar trazabilidad con `actorUserId`, `operationId`, `requestId` y `occurredAt`.
- Mantener comportamiento consistente entre Firestore, Storage, frontend y funciones.

### No objetivos

- Sustituir Firebase Authentication.
- Resolver multi-región, facturación o retención legal de documentos.
- Mantener simultáneamente las colecciones raíz heredadas y el modelo organizacional final.
- Usar el frontend como frontera de seguridad.

## 2. Modelo de identidad y datos

### 2.1 Identidad

Firebase Auth es la fuente de identidad. `request.auth.uid` es el único identificador confiable del usuario en reglas. Los campos `actorUserId`, `organizationId`, `role` y `warehouseId` enviados por el cliente son datos sujetos a validación; no son una autoridad independiente.

### 2.2 Membresía

Ruta canónica:

```text
organizations/{organizationId}/users/{userId}
```

Esquema mínimo:

| Campo                   | Tipo        | Reglas                                                                                                                              |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `userId`                | string      | Igual al ID del documento y a `request.auth.uid` al crear el propio registro pendiente.                                             |
| `organizationId`        | string      | Igual al segmento de ruta.                                                                                                          |
| `role`                  | enum        | `AUXILIAR_ALMACENISTA`, `GERENTE_ALMACEN`, `ADMIN`. Sólo `ADMIN` autorizado puede cambiarlo. `SUPER_ADMIN` vive en un custom claim. |
| `status`                | enum        | `PENDING`, `ACTIVE`, `INACTIVE`. Sólo un `ADMIN` puede activar, desactivar o reactivar.                                             |
| `warehouseId`           | string/null | `null` significa todos los almacenes y sólo puede ser asignado por `ADMIN`. En otro caso debe ser un ID canónico.                   |
| `createdAt`/`updatedAt` | timestamp   | Servidor; no aceptados desde el cliente como autoridad.                                                                             |

El registro `PENDING` auto-creado por el usuario no debe conceder acceso a ningún dato operativo.

### 2.3 Organización y almacenes

```text
organizations/{organizationId}
organizations/{organizationId}/warehouses/{warehouseId}
```

Los almacenes deben usar IDs estables y opacos como clave de autorización. Los valores actuales
`wh_tehuacan_1` y `wh_tehuacan_2` se tratan como aliases de migración, no como nombres de UI ni
como contrato para nuevos almacenes. El nombre visible (`Tehuacán 1`, `Tehuacán 2`, etc.) vive en
`displayName`; nunca se deriva una autorización desde el texto mostrado.

Regla: un cambio de nombre no cambia el ID; un almacén nuevo obtiene un ID único generado por
backend y no reutiliza IDs eliminados.

## 2.5 Contratos compartidos

Crear `packages/schemas` antes de endurecer reglas. Debe contener esquemas Zod versionados para:

- `Membership`, `WarehouseRef` y claims de `SUPER_ADMIN`.
- `Reception`, `Shipment`, `Embarque`, `Tarima` y sus transiciones.
- `InventoryMovement`, `AuditEvent` y payloads de Functions.
- Respuestas y errores públicos de `extract_ocr_secure`.

Las Functions y el frontend consumirán estos esquemas. Firestore Rules mantendrá validaciones
estructurales mínimas e inmutabilidad; nunca se asumirá que Zod reemplaza Rules.

### 2.4 Datos operativos

Las colecciones operativas deben vivir bajo la organización:

```text
organizations/{organizationId}/suppliers/{supplierId}
organizations/{organizationId}/products/{productId}
organizations/{organizationId}/conversions/{conversionId}
organizations/{organizationId}/purchase_orders/{purchaseOrderId}
organizations/{organizationId}/receptions/{receptionId}
organizations/{organizationId}/receptions/{receptionId}/lines/{lineId}
organizations/{organizationId}/receptions/{receptionId}/pallets/{palletId}
organizations/{organizationId}/shipments/{shipmentId}
organizations/{organizationId}/embarques/{embarqueId}
organizations/{organizationId}/embarques/{embarqueId}/tarimas/{tarimaId}
organizations/{organizationId}/inventory/{inventoryId}
organizations/{organizationId}/inventory_movements/{movementId}
organizations/{organizationId}/lotes_caducidades/{lotId}
organizations/{organizationId}/audit_events/{eventId}
```

Cada documento operacional con alcance de almacén debe contener `warehouseId`. Las reglas deben comparar el valor persistido del recurso con la membresía, no con un valor arbitrario del request.

## 3. Roles y permisos

| Permiso                                 |         `AUXILIAR_ALMACENISTA`         |           `GERENTE_ALMACEN`            |                `ADMIN`                 |             `SUPER_ADMIN`              |
| --------------------------------------- | :------------------------------------: | :------------------------------------: | :------------------------------------: | :------------------------------------: |
| Leer operaciones de su almacén          |                   Sí                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Leer operaciones de todos los almacenes |                   No                   |                   No                   |                   Sí                   |                   Sí                   |
| Crear recepción en su almacén           |                   Sí                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Avanzar recepción                       |                   Sí                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Cancelar recepción                      |                   No                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Crear/editar catálogos                  |                   No                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Crear embarque                          |                   Sí                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Escanear tarima                         |                   Sí                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Completar/cancelar embarque             |                   No                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Crear movimientos de inventario         |     Sí, sólo por flujo autorizado      |                   Sí                   |            Sólo por backend            |            Sólo por backend            |
| Corregir movimiento                     |                   No                   |                   No                   |           Sí, con auditoría            |           Sí, con auditoría            |
| Leer auditoría                          |                   No                   |                   Sí                   |                   Sí                   |                   Sí                   |
| Escribir auditoría                      | Sólo mediante función/flujo autorizado | Sólo mediante función/flujo autorizado | Sólo mediante función/flujo autorizado | Sólo mediante función/flujo autorizado |
| Administrar membresías                  |                   No                   |                   No                   |                   Sí                   |                   Sí                   |
| Administrar plataforma y claims         |                   No                   |                   No                   |                   No                   |                   Sí                   |
| Eliminar datos operativos               |                   No                   |                   No                   |        Sí, preferir soft delete        |        Sí, preferir soft delete        |

`SUPER_ADMIN` es global y se administra sólo con Admin SDK. `AUDITOR` puede mantenerse como permiso especializado de sólo lectura si el producto lo necesita, pero no reemplaza a los cuatro roles operativos acordados. Ninguna ruta de frontend o regla debe convertirlo indirectamente en un rol de escritura.

### 3.1 Compatibilidad durante la migración

| Rol legacy               | Rol objetivo           |
| ------------------------ | ---------------------- |
| `OPERATOR`               | `AUXILIAR_ALMACENISTA` |
| `SUPERVISOR`             | `GERENTE_ALMACEN`      |
| `ADMIN`                  | `ADMIN`                |
| claim `superAdmin: true` | `SUPER_ADMIN`          |

La compatibilidad legacy sólo debe existir durante la migración y nunca debe permitir más privilegios que el rol objetivo equivalente.

## 4. Helpers de reglas Firestore

Implementar y reutilizar helpers con nombres técnicos estables:

- `isSignedIn()` — `request.auth != null`.
- `getMembership(organizationId)` — obtiene la membresía de `request.auth.uid`.
- `isActiveMember(organizationId)` — exige existencia, `userId`, `organizationId`, `status == 'ACTIVE'` y rol válido.
- `hasRole(organizationId, roles)` — sólo después de `isActiveMember`.
- `isAdmin(organizationId)`.
- `canAccessWarehouse(organizationId, warehouseId)` — exige ID canónico y coincidencia con `membership.data.warehouseId`, salvo acceso global explícito de `ADMIN`.
- `isSameOrganization(data, organizationId)`.
- `warehouseUnchanged()` — en updates.
- `hasOnlyChanged(keys)` — por transición.
- `validAuditEvent(data)` — esquema cerrado y límites.

Nunca confiar exclusivamente en:

- `request.resource.data.role`;
- `request.resource.data.organizationId`;
- `request.resource.data.actorUserId`;
- un email enviado por el cliente;
- un `hasOnly()` sin validación de identidad y pertenencia.

## 5. Reglas por dominio

### 5.1 Membresías

- `get`: el usuario puede consultar su propio registro, incluso `PENDING`.
- `list`: sólo `ADMIN` o un actor explícitamente autorizado.
- `create`: el usuario sólo puede crear su propio registro `PENDING`, con rol fijo `AUXILIAR_ALMACENISTA`, sin `warehouseId` global y sin campos adicionales.
- `update/delete`: sólo `ADMIN`; impedir que el último administrador activo sea eliminado o degradado sin un reemplazo válido.
- La protección del último `ADMIN` no se delega a una regla aislada: `setMembershipStatus` y
  `updateMembershipRole` deben ejecutar una transacción que lea el conteo de administradores
  activos, valide que quede al menos uno y aplique el cambio atómicamente. El test obligatorio es
  `last active admin cannot be deactivated/demoted/deleted`.
- Impedir que un `ADMIN` de una organización modifique la membresía de otra organización.

### 5.2 Catálogos

`GERENTE_ALMACEN` y `ADMIN` pueden escribir `suppliers`, `products` y `conversions` sólo con esquema cerrado, límites de tamaño y `organizationId` inmutable. No permitir escrituras globales ni IDs con formato arbitrario si el dominio exige IDs canónicos.

### 5.3 Recepciones

- `create`: `AUXILIAR_ALMACENISTA+`, estado inicial `DRAFT`, `actorUserId == request.auth.uid`, `warehouseId` accesible y esquema válido.
- `DRAFT -> IN_PROGRESS`: `AUXILIAR_ALMACENISTA+`, sólo campos de avance permitidos.
- `IN_PROGRESS -> CONFIRMED`: `AUXILIAR_ALMACENISTA+`, exige líneas/tarimas y evidencia requeridas.
- `DRAFT|IN_PROGRESS -> CANCELLED`: `GERENTE_ALMACEN+`, con motivo obligatorio.
- `warehouseId`, `organizationId`, `actorUserId` y `createdAt` no son editables.

### 5.4 Embarques y tarimas

- Crear un embarque únicamente con `warehouseId` accesible.
- Para crear una tarima, leer el embarque padre y exigir `canAccessWarehouse` sobre el almacén persistido del padre.
- Validar `embarqueId`, `organizationId`, estado padre, `tarimaIndex`, identificador QR único y límites.
- `pending -> scanned` debe permitir sólo campos de escaneo (`status`, `lote`, `caducidad`, `observaciones`, `scannedAt`, `scannedBy`) y exigir `scannedBy == request.auth.uid`.
- El contador `tarimasCompletadas` no debe ser controlado por un update libre del cliente; incrementarlo en una función transaccional.
- `COMPLETED` sólo cuando la función verifica que todas las tarimas requeridas están escaneadas.

### 5.5 Inventario

- Los movimientos son append-only para usuarios operativos.
- Correcciones administrativas deben generar movimiento compensatorio, no mutar silenciosamente el histórico.
- `quantity` debe ser número entero/decimal permitido, finito y mayor que cero.
- `direction`, `movementType`, `warehouseId`, `productId` y `operationId` deben pertenecer a enums y longitudes limitadas.
- Ajustes y completados deben usar transacciones con locks determinísticos o, preferentemente, una Cloud Function confiable.

### 5.6 Auditoría

Los clientes no deben crear eventos libres en `audit_events`. Las funciones autorizadas escriben:

```text
actorUserId, organizationId, entityType, entityId, action,
operationId, requestId, metadata, occurredAt, schemaVersion
```

`metadata` debe tener esquema o límites estrictos; nunca almacenar base64, secretos, tokens o documentos completos.

## 6. Reglas Storage

Rutas recomendadas:

```text
organizations/{organizationId}/receptions/{receptionId}/invoice-preview.jpg
organizations/{organizationId}/receptions/{receptionId}/evidence/{evidenceId}.jpg
```

Requisitos:

- Derivar la organización y recepción de la ruta, no de metadata enviada.
- Comprobar membresía activa y alcance de almacén de la recepción padre.
- `AUXILIAR_ALMACENISTA` puede crear evidencia de su propia operación; `GERENTE_ALMACEN` puede revisar/corregir según política; `ADMIN` y `SUPER_ADMIN` pueden supervisar; un permiso `audit.read` puede habilitar lectores especializados.
- Validar `contentType`, tamaño máximo, extensión y metadatos.
- Desactivar lectura pública y URLs permanentes no controladas.
- No hardcodear una organización en las reglas si el modelo pretende ser multi-tenant.
- Añadir pruebas para usuario sin membresía, otra organización, otro almacén, actor, supervisor y auditor.

## 7. Cloud Functions

Crear callable functions con autenticación y validación de entrada obligatorias:

| Function               | Propósito                       | Requisitos                                                                  |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `createMembership`     | Solicitar/provisionar membresía | Sólo `ADMIN`; impide autoasignación y valida organización/almacén.          |
| `setMembershipStatus`  | Activar/desactivar              | Sólo `ADMIN`; protege último admin.                                         |
| `updateMembershipRole` | Cambiar rol/alcance             | Sólo `ADMIN`; registra auditoría.                                           |
| `createReception`      | Crear recepción y líneas        | Valida dominio, actor y almacén en una transacción.                         |
| `advanceReception`     | Ejecutar transición             | Máquina de estados única; idempotencia por `operationId`.                   |
| `createShipment`       | Crear embarque y tarimas        | Valida stock, almacén y cantidades de forma atómica.                        |
| `scanPallet`           | Registrar escaneo               | Verifica QR, estado, almacén, usuario y evita doble escaneo.                |
| `completeShipment`     | Completar y mover inventario    | Revalida stock en transacción y emite auditoría.                            |
| `writeAuditEvent`      | Registrar eventos internos      | No expuesta al cliente salvo contrato muy restringido.                      |
| `extract_ocr_secure`   | OCR                             | Auth obligatoria, MIME/tamaño limitado, rate limit y no logging de payload. |

Todas las funciones deben:

1. Validar `context.auth`.
2. Validar payload con esquema (por ejemplo, Zod en TypeScript o Pydantic en Python).
3. Resolver membresía desde Firestore y verificar rol/almacén.
4. Usar `requestId`/`operationId` idempotente.
5. Escribir auditoría en la misma transacción cuando corresponda.
6. Devolver errores públicos estables sin filtrar detalles internos.

## 8. Máquina de estados operativos

### Recepción

```text
DRAFT -> IN_PROGRESS -> CONFIRMED
DRAFT -> CANCELLED
IN_PROGRESS -> CANCELLED
```

### Embarque

```text
PROGRAMMED -> IN_PROGRESS -> COMPLETED
PROGRAMMED -> CANCELLED
IN_PROGRESS -> CANCELLED
```

### Tarima

```text
PENDING -> SCANNED
```

Cada transición debe tener un único actor autorizado, una lista de campos permitidos, precondiciones, evento de auditoría e idempotency key.

## 9. Migración

### Fase 0 — inventario y respaldo

- Exportar Firestore y Storage.
- Inventariar colecciones raíz (`embarques`, `tarimas`, `inventario`, `stock`) y organizacionales.
- Identificar documentos sin `organizationId`, `warehouseId`, `actorUserId` o timestamps válidos.
- Generar un reporte de duplicados y conflictos de IDs.

### Fase 1 — normalización offline

- Mapear aliases de almacén a IDs canónicos.
- Añadir `organizationId` y `warehouseId` sólo con evidencia verificable.
- Marcar documentos ambiguos como `migrationStatus: 'REVIEW_REQUIRED'`; no inventar pertenencia.
- Crear membresías con `PENDING` y asignación mínima.

### Fase 2 — dual-read controlado

- Leer sólo la ruta organizacional nueva.
- Mantener la ruta heredada en modo lectura para reconciliación temporal, no para nuevas escrituras.
- Comparar conteos, hashes de campos y estados.

### Fase 3 — cutover

- Desactivar escrituras a colecciones raíz.
- Activar reglas estrictas nuevas.
- Ejecutar smoke tests autenticados por rol y almacén.
- Monitorear `permission-denied`, errores de funciones y latencia.

### Fase 4 — retiro

- Confirmar período de retención acordado.
- Eliminar código legado y rutas raíz sólo después de aprobación y respaldo.
- Documentar el commit, export y resultado de reconciliación.

## 10. Tests obligatorios

### Firestore Rules Unit Testing

Configurar `firebase emulators:exec` en CI y cubrir como mínimo:

- No autenticado: todas las lecturas/escrituras operativas fallan.
- `PENDING`: sólo puede leer su membresía; no puede leer datos operativos.
- Cada rol en su almacén: permite sólo lo definido en la matriz.
- Usuario de `wh_tehuacan_1`: no puede leer/escribir `wh_tehuacan_2`.
- `ADMIN` global: puede operar ambos almacenes, con auditoría.
- Tarima creada en un embarque de otro almacén: falla.
- Update con cambio de `warehouseId`, `organizationId`, `actorUserId` o rol: falla.
- Transiciones inválidas y updates con campos extra: fallan.
- Payloads grandes, arrays excesivos y tipos incorrectos: fallan.
- Storage: actor/roles/almacén y MIME/tamaño.

### Tests de funciones

- Auth ausente, rol insuficiente, organización equivocada y almacén equivocado.
- Idempotencia de reintentos.
- Concurrencia de dos escaneos/completados.
- Stock insuficiente y rollback transaccional.
- Auditoría generada exactamente una vez.

### Tests de frontend

- `ProtectedRoute` para `UNAUTHENTICATED`, `PENDING`, `INACTIVE`, `ERROR`, rol y almacén.
- Después de un refresh, mantener un estado `AUTH_LOADING` hasta que Auth y membership estén
  resueltos; no realizar ninguna query Firestore antes de `ACTIVE`.
- Mostrar `permission-denied` distinto de fallback sin datos.
- Accesibilidad: nombre accesible, foco, teclado y estados de carga/error.

### Contrato mínimo de `extract_ocr_secure`

- Input: `storagePath`, `documentType`, `requestId`; nunca base64 arbitrario desde el cliente.
- Auth: usuario autenticado, membresía activa y acceso al almacén de la recepción.
- Límites: MIME permitido, tamaño máximo, dimensiones máximas, timeout y rate limit.
- Output: `{ requestId, status, fields, confidence, warnings }`, sin secretos ni payload original.
- Auditoría: actor, recepción, hash del archivo y resultado; no registrar contenido sensible.

## 11. CI/CD y observabilidad

Jobs obligatorios antes de desplegar:

1. `pnpm install --frozen-lockfile`.
2. `pnpm typecheck`.
3. `pnpm lint` con globs explícitos y sin panic.
4. `pnpm test:run`.
5. `firebase emulators:exec --only firestore,storage -- pnpm test:rules`.
6. Tests de Functions con dependencias declaradas.
7. `pnpm build` y publicación del artefacto asociado al commit.
8. Validación de reglas/indexes en dry-run.

Métricas y alertas:

- `permission-denied` por ruta, rol, organización y versión.
- Fallos de callable por código estable.
- Porcentaje de eventos con `operationId` y `requestId`.
- Escrituras rechazadas por esquema.
- Divergencia entre datos raíz heredados y datos organizacionales durante migración.

## 12. Rollout y rollback

### Rollout gradual

- **Staging:** reglas nuevas, datos anonimizados, todos los tests.
- **Canary:** un almacén y usuarios seleccionados; sólo operaciones de bajo riesgo al inicio.
- **Expansión:** segundo almacén después de 24 horas sin regresiones críticas.
- **General:** activar funciones sensibles y retirar dual-read.

### Rollback

- Mantener la versión anterior de reglas, functions y frontend identificada por commit.
- Revertir sólo después de preservar logs y evidencia de incidentes.
- No volver a reglas abiertas como mecanismo de recuperación.
- Si hay datos parcialmente migrados, bloquear nuevas escrituras y reanudar desde el último checkpoint validado.

## 13. Criterios de aceptación

- [ ] Ningún usuario `AUXILIAR_ALMACENISTA` o `GERENTE_ALMACEN` puede cruzar almacenes; `ADMIN` queda limitado a su organización y `SUPER_ADMIN` a la plataforma.
- [ ] Ningún cliente puede cambiar su rol, estado, organización o almacén mediante Firestore directo.
- [ ] Crear una tarima valida el almacén del embarque padre.
- [ ] Todas las mutaciones sensibles tienen auditoría con actor y operación correlacionables.
- [ ] Las colecciones raíz heredadas no reciben nuevas escrituras.
- [ ] Rules tests de Firestore y Storage ejecutan realmente en CI, no quedan skipped.
- [ ] `pnpm typecheck`, lint, tests y build pasan en un entorno limpio.
- [ ] Los errores de autorización se muestran explícitamente y no se confunden con catálogos vacíos.
- [ ] Cloud Functions sensibles validan auth, rol, almacén, esquema e idempotencia.
- [ ] Existe evidencia de rollback y export de datos antes del cutover.

## 14. Orden recomendado de implementación

1. Congelar contratos y añadir schemas compartidos.
2. Corregir reglas de membresías, almacenes y alcance de tarimas.
3. Añadir tests negativos de aislamiento y transiciones.
4. Unificar rutas Firestore y retirar servicios raíz.
5. Implementar funciones transaccionales e idempotentes.
6. Migrar datos y validar reconciliación.
7. Corregir gating frontend y estados de error.
8. Activar CI completo y rollout canary.
9. Retirar compatibilidad heredada después de la ventana de observación.

### Orden operativo resumido

1. `packages/schemas` y contratos versionados.
2. Rules de membresías, `canAccessWarehouse` y tests negativos.
3. Unificación de rutas bajo `organizations/{orgId}/...`; congelar nuevas escrituras legacy.
4. Functions transaccionales: `createReception`, `advanceReception`, `createShipment`,
   `scanPallet`, `completeShipment`.
5. Migración de datos y membresías `PENDING` con reconciliación.
6. Frontend gating con `AUTH_LOADING`, `ACTIVE` y errores diferenciados.
7. CI completo, canary, métricas y rollback.

## 15. Secretos, borrado legacy y checklist de aprobación

### Secret management

- `VITE_FIREBASE_API_KEY` no se trata como secreto de backend, pero se gestiona por entorno
  (staging/production) mediante configuración de CI y dominios autorizados documentados.
- Secretos reales (Admin SDK, OCR providers, claves privadas) viven en Secret Manager; nunca en
  `VITE_*`, Firestore, Storage, logs ni el repositorio.
- Cada despliegue registra proyecto, commit, build ID y entorno.

### Script de retiro legacy

Antes de borrar colecciones o servicios raíz debe existir un script idempotente que soporte:

1. `--dry-run` por defecto.
2. Export/backup verificable antes de cualquier borrado.
3. Conteo, hash y lista de documentos afectados.
4. Confirmación explícita (`--apply`) separada del dry-run.
5. Registro de `operationId`, actor, commit y resultado.
6. Reintento seguro y rollback por restauración desde backup.

### Checklist rápido antes de aprobar

- [ ] `packages/schemas` existe y sus esquemas están versionados.
- [ ] Existe contrato de secretos para staging y production.
- [ ] Está probado que el último `ADMIN` no puede desactivarse, degradarse o eliminarse.
- [ ] Un `ADMIN` con alcance global accede a todos los almacenes de su organización.
- [ ] Storage obtiene `organizationId` del path y valida el documento padre.
- [ ] El contrato `extract_ocr_secure` está probado en auth, límites y respuesta.
- [ ] El script de borrado legacy tiene dry-run, backup y registro auditable.

## Riesgos abiertos

- Documentos existentes sin `warehouseId` no pueden migrarse automáticamente de forma segura.
- Cambiar reglas antes de migrar membresías activas puede provocar `permission-denied` legítimos.
- Mantener dos modelos de rutas durante demasiado tiempo puede generar doble escritura y divergencia.
- Las operaciones de inventario concurrentes requieren una autoridad transaccional real; el cliente no es suficiente.
- El alcance `warehouseId == null` debe reservarse a `ADMIN`; si se amplía a otros roles, se pierde el aislamiento principal.
