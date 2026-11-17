# Guía canónica de integración — Módulo Etiquetado

> **Documento normativo y fuente única de verdad.** Define las condiciones, el orden de ejecución, la evidencia y el criterio de rollback para habilitar el módulo `labelingModule` en una bodega piloto. Si otro documento, comentario o instrucción contradice esta guía, prevalece esta guía hasta que una nueva versión aprobada la reemplace.

**Versión:** 1.0  
**Estado:** Controlado  
**Última revisión:** `AAAA-MM-DD`  
**Responsable:** `equipo/persona`  
**Bodega piloto autorizada:** `PILOTO_001` — reemplazar únicamente con el ID confirmado antes de ejecutar.

---

## 1. Resultado obligatorio

La integración solo se considera terminada cuando:

1. El módulo aparece únicamente para la bodega piloto autorizada.
2. Las cinco rutas cargan con autenticación, autorización y App Check válidos.
3. El flujo completo respeta la máquina de estados: borrador → validado → preparado → entregado → en retorno → en conciliación → cerrado.
4. Las 10 callables responden `2xx` desde una sesión autenticada y con App Check válido.
5. La evidencia de esta guía está completa y asociada a una revisión desplegada.

Si falta cualquiera de estos puntos, el estado correcto es **NO APROBADO**.

## 2. Reglas inamovibles

- **MUST:** usar una función de autorización por `warehouseId`; no usar un booleano global en producción.
- **MUST:** comparar el `warehouseId` contra una constante validada y documentada.
- **MUST:** validar Auth, custom claims, autorización de bodega y App Check por separado.
- **MUST NOT:** modificar `src/_deprecated/labeling/`, `functions_labeling/`, `firebase.labeling.json`, `firestore.rules` ni `firestore.indexes.json` como parte de esta integración.
- **MUST NOT:** declarar éxito por una pantalla cargada; se requiere evidencia E2E.
- **MUST NOT:** probar con datos reales destructivos. Usar usuario, productos y cantidades de prueba autorizados.
- **MUST:** si falla una verificación crítica, detener el piloto y ejecutar rollback.
- **MUST:** cada lote debe tener un estado explícito y solo puede avanzar mediante una transición válida.
- **MUST:** el cierre debe bloquearse mientras existan diferencias sin justificar y aprobar.
- **MUST:** toda transición debe registrar usuario, fecha, origen, destino y motivo cuando corresponda.
- **MUST NOT:** permitir que una pantalla cambie directamente el estado sin pasar por las reglas de transición.
- **MUST:** las operaciones que puedan repetirse por reintentos deben ser idempotentes.
- **MUST:** toda modificación posterior a este documento debe incrementar la versión, registrar autor, fecha, motivo y aprobación.

## 3. Precondiciones y bloqueo

No comenzar la integración hasta completar esta tabla:

| Precondición                             | Evidencia requerida                                       | Estado |
| ---------------------------------------- | --------------------------------------------------------- | ------ |
| ID real de bodega piloto confirmado      | Registro o ticket de autorización                         | [ ]    |
| Usuario de prueba creado                 | UID y `warehouseId` documentados sin exponer credenciales | [ ]    |
| Revisión de código identificada          | Commit/tag desplegado                                     | [ ]    |
| App Check válido en el entorno de prueba | Evidencia de token aceptado por una callable              | [ ]    |
| Plan de rollback aprobado                | Responsable y tiempo máximo de ejecución                  | [ ]    |
| Datos de prueba disponibles              | IDs de producto/lote y cantidades                         | [ ]    |

**Criterio de bloqueo:** si una precondición no está marcada, el estado es **BLOQUEADO** y no se habilita el flag.

## 4. Contrato del feature flag

La API canónica es una función. El ID real debe resolverse antes de modificar el código.

```ts
const PILOT_WAREHOUSE_ID = "PILOTO_001";

export const featureFlags = {
  labelingModule: (warehouseId: string): boolean => warehouseId === PILOT_WAREHOUSE_ID,
};
```

Reglas:

- Todos los consumidores deben invocar `featureFlags.labelingModule(warehouseId)`.
- No se permite `if (featureFlags.labelingModule)`.
- No se permite duplicar la comparación del ID en rutas, sidebar o componentes.
- El `warehouseId` debe provenir de la sesión autorizada, nunca de un valor editable del formulario.

## 5. Superficie funcional autorizada

### Entry points

```text
src/labeling/
├── index.ts
├── screens/
│   ├── Etiquetado.tsx
│   ├── NuevoLote.tsx
│   ├── EntregarTarima.tsx
│   ├── RecibirRetorno.tsx
│   └── ConciliarCerrar.tsx
├── hooks/
│   ├── useLabeling.ts
│   ├── useInventory.ts
│   └── useCSVImport.ts
├── components/
│   ├── ProductAutocomplete.tsx
│   └── GridFilters.tsx
└── pdf/
    └── optionD.ts
```

### Rutas

Las rutas y el sidebar deben usar el mismo guard del flag:

```tsx
{
  featureFlags.labelingModule(currentWarehouseId) && (
    <>
      <Route path="/etiquetado" element={<Etiquetado />} />
      <Route path="/etiquetado/nuevo-lote" element={<NuevoLote />} />
      <Route path="/etiquetado/entregar" element={<EntregarTarima />} />
      <Route path="/etiquetado/recibir" element={<RecibirRetorno />} />
      <Route path="/etiquetado/conciliar" element={<ConciliarCerrar />} />
    </>
  );
}
```

El acceso directo a una ruta debe rechazar usuarios no autorizados; ocultar el enlace del sidebar no es una medida de seguridad.

### Máquina de estados del lote

El lote es la unidad principal del proceso. Las pantallas ejecutan transiciones; no inventan estados propios.

| Estado            | Significado                                     | Siguiente estado permitido |
| ----------------- | ----------------------------------------------- | -------------------------- |
| `BORRADOR`        | Lote creado, todavía editable                   | `VALIDADO`                 |
| `VALIDADO`        | CSV, productos y cantidades verificados         | `PREPARADO`                |
| `PREPARADO`       | Productos asignados a una o más tarimas         | `ENTREGADO`                |
| `ENTREGADO`       | Entrega registrada y comprobante generado       | `EN_RETORNO`               |
| `EN_RETORNO`      | Se está registrando el retorno total o parcial  | `EN_CONCILIACION`          |
| `EN_CONCILIACION` | Se comparan cantidades y diferencias            | `CERRADO`                  |
| `CERRADO`         | Operación finalizada y bloqueada contra cambios | Ninguno                    |

Reglas de transición:

- `BORRADOR → VALIDADO`: requiere CSV válido, productos existentes, cantidades positivas y ausencia de duplicados no permitidos.
- `VALIDADO → PREPARADO`: requiere asignación completa a tarimas identificadas.
- `PREPARADO → ENTREGADO`: requiere usuario responsable, fecha, destinatario y confirmación de entrega.
- `ENTREGADO → EN_RETORNO`: se habilita cuando comienza la recepción de la tarima.
- `EN_RETORNO → EN_CONCILIACION`: requiere registrar todo lo recibido, incluidos faltantes, sobrantes o dañados.
- `EN_CONCILIACION → CERRADO`: solo se permite con diferencia cero o con una diferencia justificada y aprobada por el rol correspondiente.
- `CERRADO` es inmutable. Una corrección posterior debe abrir un proceso nuevo, no editar silenciosamente el lote cerrado.

### Reglas de excepción

- Un retorno parcial permanece en `EN_RETORNO` hasta que se complete o se declare formalmente una diferencia.
- Un producto dañado, faltante o sobrante debe registrarse como incidencia, nunca ocultarse ajustando cantidades manualmente.
- Un CSV inválido no crea un lote operativo.
- Un reintento de una misma operación no debe duplicar el lote, la entrega, el retorno ni el PDF.
- Las diferencias pendientes impiden el cierre y deben mostrar responsable y acción requerida.

## 6. Orden de ejecución

### Paso 1 — Auditar consumidores

- [ ] Encontrar todos los usos de `labelingModule`.
- [ ] Convertirlos al contrato funcional.
- [ ] Confirmar que rutas y sidebar usan el `warehouseId` de sesión.
- [ ] Confirmar que el módulo legacy no se importa accidentalmente.

### Paso 2 — Activar únicamente la bodega piloto

- [ ] Sustituir `PILOTO_001` por el ID confirmado, si corresponde.
- [ ] Desplegar la revisión identificada.
- [ ] Confirmar que una bodega no piloto no ve el menú ni puede abrir las rutas.

### Paso 3 — Validar autenticación y App Check

Probar en producción con el usuario autorizado:

- [ ] Auth válido.
- [ ] `customClaims.warehouseId` correcto.
- [ ] App Check válido.
- [ ] Acceso permitido únicamente a la bodega piloto.
- [ ] Usuario sin Auth rechazado.
- [ ] Usuario con Auth pero sin permiso de bodega rechazado.
- [ ] Solicitud sin App Check rechazada según la política del backend.

Un hard refresh puede ayudar a descartar caché de la aplicación, pero **no constituye por sí mismo una renovación ni una prueba de App Check**.

### Paso 4 — Ejecutar la prueba E2E basada en estados

Usar datos de prueba y registrar resultado, timestamp, revisión y usuario anonimizado:

1. Abrir `/etiquetado` y crear un lote en estado `BORRADOR`.
2. Importar el CSV y comprobar la transición a `VALIDADO`.
3. Asignar productos a tarimas y comprobar la transición a `PREPARADO`.
4. Registrar responsable, destinatario y fecha; comprobar la transición a `ENTREGADO`.
5. Generar y descargar el PDF de entrega.
6. Registrar un retorno total, parcial o con incidencia; comprobar el estado `EN_RETORNO`.
7. Completar la recepción y comprobar la transición a `EN_CONCILIACION`.
8. Verificar que una diferencia pendiente bloquea el cierre.
9. Justificar y aprobar la diferencia, o dejar diferencia cero; comprobar la transición a `CERRADO`.
10. Confirmar que un lote `CERRADO` no puede modificarse.
11. Verificar filtros por mes y producto y autocomplete por nombre y código.
12. Confirmar ausencia de errores funcionales en consola y registrar toda la auditoría.

## 7. Callables y evidencia

Validar desde la aplicación autenticada, no solo con una solicitud manual:

```text
createBatch
deliverPallet
receiveReturn
reconcileClose
importCSV
getInventory
getBatches
getPallets
generatePDF
getProductAutocomplete
```

Para cada callable registrar:

| Callable                 | Resultado HTTP | Auth | App Check | Payload seguro | Evidencia |
| ------------------------ | -------------: | ---- | --------- | -------------- | --------- |
| `createBatch`            |                |      |           |                |           |
| `deliverPallet`          |                |      |           |                |           |
| `receiveReturn`          |                |      |           |                |           |
| `reconcileClose`         |                |      |           |                |           |
| `importCSV`              |                |      |           |                |           |
| `getInventory`           |                |      |           |                |           |
| `getBatches`             |                |      |           |                |           |
| `getPallets`             |                |      |           |                |           |
| `generatePDF`            |                |      |           |                |           |
| `getProductAutocomplete` |                |      |           |                |           |

No registrar tokens, cookies, secretos ni payloads que contengan datos personales.

## 8. Criterios de aceptación

La aprobación requiere marcar todos los criterios:

- [ ] Precondiciones completas.
- [ ] Flag limitado a la bodega piloto.
- [ ] Rutas protegidas y montadas condicionalmente.
- [ ] Sidebar visible solo para la bodega piloto.
- [ ] Acceso directo no autorizado rechazado.
- [ ] Crear lote e importar CSV funciona.
- [ ] Las transiciones de estado válidas funcionan y las inválidas son rechazadas.
- [ ] Las excepciones (retorno parcial, faltante, sobrante y producto dañado) quedan registradas.
- [ ] Entregar tarima genera PDF.
- [ ] Recibir, conciliar y cerrar funciona.
- [ ] Una diferencia pendiente bloquea el cierre.
- [ ] Un lote cerrado queda bloqueado contra modificaciones.
- [ ] Las operaciones repetidas no duplican datos ni documentos.
- [ ] Cada transición deja auditoría completa.
- [ ] Filtros y autocomplete funcionan.
- [ ] Las 10 callables responden `2xx` con Auth y App Check válidos.
- [ ] Casos negativos de Auth, permisos y App Check fueron probados.
- [ ] No hay errores críticos en consola.
- [ ] Evidencia almacenada y vinculada a la revisión desplegada.
- [ ] Rollback probado o validado por el responsable.

**Salida válida:** `APROBADO` o `NO APROBADO`. No usar “parcialmente funcional” como estado de producción.

## 9. Rollback

Ante cualquier fallo crítico:

1. Desactivar el flag para todas las bodegas o retirar el ID piloto.
2. Desplegar la revisión de rollback.
3. Confirmar que el sidebar y las rutas ya no son accesibles.
4. Confirmar que no se procesan nuevas operaciones del módulo.
5. Conservar logs y evidencia del fallo.
6. Abrir una corrección con causa raíz y nueva prueba requerida.

El rollback no modifica reglas, índices ni el código legacy salvo que exista una autorización independiente.

## 10. Matriz de diagnóstico

| Síntoma                         | Diagnóstico a confirmar                 | Acción                                                                           |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `401`                           | Auth ausente o inválido                 | Reautenticar y revisar sesión                                                    |
| `403`                           | Permiso de bodega o App Check rechazado | Separar claims de App Check en logs seguros                                      |
| Módulo ausente                  | Flag o `warehouseId` incorrecto         | Inspeccionar el valor efectivo de forma no sensible                              |
| Ruta accesible fuera del piloto | Guard incompleto                        | Bloquear inmediatamente y ejecutar rollback                                      |
| Autocomplete vacío              | Consulta, datos o índice                | Verificar consulta y evidencia del índice sin cambiar configuración en esta guía |
| PDF no generado                 | Callable, permisos o datos inválidos    | Capturar error correlacionado y repetir con datos de prueba                      |

## 11. Control de cambios

Esta guía es inmutable dentro de una ejecución. Para cambiarla:

1. Crear una nueva versión.
2. Describir el motivo y el impacto.
3. Identificar la evidencia que cambia.
4. Obtener aprobación del responsable.
5. Repetir las verificaciones afectadas.
6. Marcar la versión anterior como reemplazada, sin borrarla.

### Registro de versiones

| Versión | Fecha        | Cambio                                                                     | Responsable      | Aprobación  |
| ------- | ------------ | -------------------------------------------------------------------------- | ---------------- | ----------- |
| 1.0     | `AAAA-MM-DD` | Reescritura normativa y checklist E2E                                      | `equipo/persona` | `pendiente` |
| 1.1     | `AAAA-MM-DD` | Incorporación de máquina de estados, excepciones, auditoría e idempotencia | `equipo/persona` | `pendiente` |

## 12. Declaración final

Solo después de completar toda la evidencia y obtener estado **APROBADO** se puede emitir:

> **✅ Módulo Etiquetado integrado y funcional en la bodega piloto autorizada.**

La confirmación debe incluir la revisión desplegada, fecha, responsable y enlaces a la evidencia. Una captura aislada del dashboard no es suficiente.
