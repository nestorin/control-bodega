# SDD — Módulo de Etiquetado

> **Decisión principal:** Etiquetado será un dominio aditivo y auditable. No modifica ni borra documentos históricos de recepción; modela el tránsito de existencias mediante lotes de etiquetado, entradas, salidas, un libro mayor inmutable y proyecciones derivadas.

## Resumen ejecutivo

El módulo permite entregar tarimas recibidas a una empresa etiquetadora, controlar lo que vuelve etiquetado y publicar inventario **trabajado/etiquetado** únicamente cuando las cantidades quedan conciliadas o cuando una discrepancia se cierra explícitamente con evidencia y autorización. La unidad de conciliación es siempre **producto + lote + caducidad**; está prohibido agregar cantidades de lotes o caducidades distintos.

La implementación recomendada usa colecciones nuevas de Firestore, operaciones de servidor transaccionales e idempotentes y un *feature flag* para una adopción gradual. La lectura actual de inventario permanece disponible durante la migración; el nuevo inventario trabajado se expone desde una proyección separada.

## Camino rápido

1. Crear un lote de etiquetado desglosado por producto, lote y caducidad, con estimados de cajas y tarimas.
2. Escanear cada QR de tarima fuente al entregar; confirmar las cajas físicas sin alterar la recepción original.
3. Registrar empresa etiquetadora y persona receptora; generar las salidas y el registro de auditoría.
4. Escanear el QR fuente al recibir retorno, declarar cajas recibidas y, si hay faltante, documentar su causa.
5. Crear las tarimas de salida (pueden dividirse o fusionarse), conciliar y cerrar el lote.

## Alcance y límites

| Incluido | No incluido en esta entrega |
|---|---|
| Alta, entrega, retorno, conciliación y cierre de lotes de etiquetado | Reescritura de documentos de recepción existentes |
| Trazabilidad QR fuente → salidas etiquetadas, incluso muchos-a-muchos | Optimización automática de acomodo físico o rutas de transporte |
| Inventario por estado: recibido, en etiquetado, trabajado/etiquetado | Cambiar la semántica histórica de `inventario`/`stock` actual |
| Diferencias, motivos, evidencia, permisos y auditoría | Facturación o liquidación comercial de la etiquetadora |
| Consultas operativas, historial y reporte de discrepancias | Etiquetado sin identidad de empresa y persona receptora |

## Requisitos confirmados

| ID | Requisito |
|---|---|
| R1 | Los datos de recepción son inmutables: Etiquetado solo crea su propio estado y movimientos. |
| R2 | La salida escanea el QR fuente, muestra producto/lote/caducidad/cajas capturadas y exige confirmar las cajas físicas. |
| R3 | La corrección manual ocurre en el traspaso y conserva `cajasOrigen` y `cajasConfirmadas`, usuario y fecha. |
| R4 | Se captura empresa etiquetadora y persona receptora. No existe campo separado de representante de empresa. |
| R5 | La planeación registra tarimas y cajas estimadas por producto + lote + caducidad; nunca consolida combinaciones distintas. |
| R6 | La sección **Etiquetado** lista lotes en proceso con estimados, reales, pendientes/diferencias, empresa, receptor, fechas y estado. |
| R7 | El retorno escanea QR fuente, rellena producto/lote/caducidad solo lectura, recibe número de cajas y bloquea excedentes. |
| R8 | Un faltante exige motivo: mercancía dañada, mal estado o dañada durante el etiquetado. |
| R9 | Las salidas pueden dividir o fusionar tarimas, sin crear ni perder cantidad. |
| R10 | Solo se cierra al conciliar o documentar explícitamente la discrepancia/cierre. |
| R11 | El inventario trabajado existe solo después de la conciliación. |
| R12 | Deben preservarse auditoría, idempotencia, relación muchos-a-muchos e historial sin sobrescrituras ni borrados. |

## Arquitectura propuesta

### Principios e invariantes

1. **Recepción como fuente histórica.** Ninguna operación escribe, elimina ni cambia cantidades, lote, caducidad ni QR de la recepción.
2. **Libro mayor primero.** Toda modificación de estado se representa como un movimiento inmutable; las pantallas leen proyecciones que pueden reconstruirse.
3. **Clave de conciliación.** `productId + lotId + expiryDate` (en adelante, `trackingKey`) es indivisible. Las cantidades se comparan solo dentro de la misma clave.
4. **Conservación.** Para cada `trackingKey`, `salidasAsignadas = retornosAceptados + bajasAprobadas + pendiente`; la suma de cajas no puede ser negativa ni exceder la disponibilidad.
5. **Identidad única.** El QR identifica una tarima fuente o de salida única. No se admite reutilizarlo, asociarlo a dos operaciones activas ni procesarlo dos veces para la misma intención idempotente.
6. **Cierre explícito.** `worked/labeled` se acredita solo desde una conciliación cerrada; una discrepancia sin autorización no es conciliación.
7. **Servidor autoritativo.** El cliente propone; una Callable/HTTPS API valida permisos, versiones, transacciones e idempotencia y escribe el libro mayor.

### Componentes

| Componente | Responsabilidad |
|---|---|
| UI Etiquetado | Planear, escanear, confirmar, devolver, conciliar y consultar sin escribir documentos de recepción. |
| API de Etiquetado | Autorización, validación, idempotencia, control de concurrencia y operaciones atómicas. |
| Colecciones operativas | Lotes, líneas, entradas, salidas, tarimas de salida y discrepancias. |
| `labelingLedger` | Eventos inmutables de asignación, retorno, baja, conciliación y cierre. |
| Proyecciones | Disponibilidad por estado y tablero de lotes; se regeneran desde el libro mayor si es necesario. |
| Auditoría | Actor, fecha de servidor, correlación, motivo, versión previa y referencias; sin datos sensibles innecesarios. |

> **Nota Firestore:** antes de implementar se debe confirmar la edición/instancia Firestore objetivo y sus límites de consulta/índices. El modelo siguiente evita depender de actualizar los documentos de recepción, pero los índices y reglas se definen contra la instancia real.

## Modelo de datos propuesto

Los nombres son propuestos; se mantienen separados del esquema actual para reducir riesgo de migración.

### Entidades principales

| Colección/documento | Campos esenciales | Propósito |
|---|---|---|
| `labelingBatches/{batchId}` | `warehouseId`, `companyId`, `receiver`, `status`, `estimatedTotals`, `actualTotals`, `openedAt`, `closedAt`, `version` | Cabecera del lote de etiquetado. `estimatedTotals` es informativo; el detalle manda. |
| `labelingBatches/{batchId}/lines/{lineId}` | `trackingKey`, `productSnapshot`, `lotSnapshot`, `expiryDate`, `estimatedBoxes`, `estimatedPallets`, `assignedBoxes`, `returnedBoxes`, `approvedLossBoxes`, `pendingBoxes` | Línea por producto/lote/caducidad. Una clave única por lote. |
| `labelingAssignments/{assignmentId}` | `batchId`, `sourcePalletId`, `sourceQr`, `trackingKey`, `sourceBoxes`, `confirmedBoxes`, `status`, `actor`, `createdAt`, `idempotencyKey` | Entrega de una tarima fuente a la etiquetadora. Conserva original y confirmado. |
| `labelingReturns/{returnId}` | `batchId`, `assignmentId`, `sourceQr`, `trackingKey`, `receivedBoxes`, `shortageBoxes`, `shortageReason`, `actor`, `receivedAt`, `idempotencyKey` | Retorno/recepción de una entrega; no permite exceder su saldo. |
| `labelingOutputPallets/{outputPalletId}` | `batchId`, `outputQr`, `trackingKey`, `boxes`, `sourceAllocation[]`, `status`, `createdAt` | Tarima ya trabajada. `sourceAllocation` expresa la relación muchos-a-muchos. |
| `labelingDiscrepancies/{discrepancyId}` | `batchId`, `trackingKey`, `type`, `boxes`, `reason`, `evidenceRefs`, `reportedBy`, `approvedBy`, `resolution`, `status` | Faltantes/bajas y su aprobación de cierre. |
| `labelingLedger/{eventId}` | `eventType`, `batchId`, `trackingKey`, `quantityDelta`, `sourceRefs`, `actor`, `serverTimestamp`, `correlationId`, `idempotencyKey`, `payloadHash` | Fuente auditable e inmutable para reconstruir proyecciones. |
| `labelingProjections/{warehouseId_trackingKey}` | `receivedBoxes`, `inLabelingBoxes`, `workedBoxes`, `updatedAt`, `ledgerCursor` | Lectura rápida por estado; derivada, nunca fuente de verdad. |
| `labelingIdempotency/{key}` | `requestHash`, `operation`, `resourceId`, `response`, `expiresAt` | Devuelve el mismo resultado en reintentos seguros. |

### Snapshots y referencias

- `productSnapshot` contiene id, SKU/código y nombre visibles al momento de la operación; no se actualiza si el catálogo cambia.
- `lotSnapshot` y `expiryDate` preservan el valor de la fuente. La API rechaza valores que no coincidan con la tarima fuente.
- Las relaciones se guardan por ID y por QR para consulta, pero el ID de documento es la referencia autoritativa.
- Para una fusión, `sourceAllocation` contiene varias asignaciones/retornos de **la misma `trackingKey`**. Para una división, varias `outputPallets` apuntan a la misma fuente. Jamás se fusionan lotes o caducidades distintos en una misma salida lógica.

### Estados

| Estado de lote | Significado | Transiciones permitidas |
|---|---|---|
| `draft` | Planeación incompleta, sin movimiento | `planned`, `cancelled` |
| `planned` | Líneas validadas, listo para entrega | `in_progress`, `cancelled` |
| `in_progress` | Hay al menos una asignación activa | `reconciling`, `cancelled_with_reversal` |
| `reconciling` | Todas las entregas tienen retorno/baja pendiente de resolver | `closed_reconciled`, `closed_with_discrepancy` |
| `closed_reconciled` | Cantidades conciliadas y salidas publicadas | terminal |
| `closed_with_discrepancy` | Diferencia aprobada, documentada y saldo resuelto | terminal |
| `cancelled` | Sin movimientos efectivos | terminal |
| `cancelled_with_reversal` | Movimientos revertidos mediante nuevos eventos, no borrados | terminal |

| Estado de inventario | Regla |
|---|---|
| `received` | Existencia disponible antes de una asignación confirmada. |
| `in_labeling` | Cajas confirmadas en una asignación y aún no retornadas/resueltas. |
| `worked/labeled` | Cajas de salida publicadas únicamente al cerrar una conciliación válida. |

## Contratos de API/Callable

Todas las operaciones requieren usuario autenticado, `idempotencyKey` UUID y `expectedVersion` cuando mutan un lote. La respuesta devuelve `correlationId`, versión resultante y el recurso afectado. La hora válida es la del servidor.

| Operación | Entrada mínima | Validaciones y resultado |
|---|---|---|
| `createLabelingBatch` | almacén, empresa, persona receptora, líneas estimadas | Rechaza claves duplicadas y estimados negativos; crea `draft`. |
| `planLabelingBatch` | `batchId`, `expectedVersion` | Recalcula totales desde líneas y pasa a `planned`. |
| `scanSourcePallet` | `batchId`, QR, intención `handoff|return` | Resuelve tarima fuente y devuelve snapshot solo lectura, saldo y elegibilidad; no mueve cantidad. |
| `confirmHandoff` | QR fuente, cajas físicas, `expectedVersion` | `0 < confirmadas <= disponibles`; crea asignación y eventos `received → in_labeling`. Conserva ambas cantidades. |
| `registerReturn` | asignación/QR fuente, cajas recibidas, motivo si faltante | `0 <= recibidas <= confirmadas - retornadas`; crea retorno y discrepancia pendiente cuando aplique. |
| `createOutputPallets` | asignaciones/retornos, distribución de cajas, QR(s) nuevos | Verifica conservación por `trackingKey`, unicidad QR y que las fuentes tengan saldo retornado. |
| `reconcileLabelingBatch` | lote, `expectedVersion` | Calcula diferencias por línea; solo avanza a `reconciling` si no quedan operaciones abiertas. |
| `closeLabelingBatch` | lote, resolución de diferencias, autorización | Publica proyección `worked/labeled` solo si todo cuadra o cada diferencia tiene aprobación/evidencia. |
| `cancelLabelingBatch` | lote, motivo | Sin movimientos: cancela. Con movimientos: exige reversos por nuevos eventos y permiso elevado. |
| `getLabelingBatchDashboard` | almacén, filtros, cursor | Devuelve proyección paginada; no expone eventos de otros almacenes. |

### Reglas de idempotencia y concurrencia

- La misma clave para la misma operación y el mismo `requestHash` retorna la respuesta original; si cambia el contenido, responde conflicto `IDEMPOTENCY_KEY_REUSED`.
- Las escrituras de una operación se hacen en transacción/batch atómico: evento, documento operativo, proyección e idempotencia se confirman juntos.
- `expectedVersion` evita cierres o entregas sobre un lote actualizado por otro operador. En conflicto se recarga el saldo del servidor; el cliente **no** reintenta una mutación ciegamente.
- Dos confirmaciones sobre el mismo QR compiten por el saldo en transacción; a lo sumo una puede consumir las últimas cajas.

## Flujos de interfaz

### 1. Preparar lote

1. Entrar a **Etiquetado > Nuevo lote**.
2. Capturar empresa etiquetadora y persona receptora (ambos obligatorios). No mostrar ni persistir representante separado.
3. Agregar líneas de producto, lote y caducidad. Capturar tarimas y cajas estimadas para cada línea.
4. Mostrar totales como suma de líneas, con desglose permanente. No permitir una línea que combine lotes/caducidades.
5. Guardar borrador o planear el lote.

### 2. Entregar a etiquetado

1. En un lote `planned/in_progress`, elegir **Entregar tarima** y escanear QR fuente.
2. Mostrar en solo lectura producto, lote, caducidad, cajas capturadas en recepción y saldo disponible.
3. Solicitar confirmación de cajas físicas. La corrección manual es permitida solo como `cajasConfirmadas`; nunca edita recepción.
4. Mostrar diferencia contra la fuente y requerir una nota si no coincide (recomendado para auditoría; no sustituye la discrepancia de retorno).
5. Confirmar: el QR queda reservado por la asignación, se registra actor/hora y se actualiza el saldo en etiquetado.

### 3. Recibir retorno y crear salidas

1. Elegir **Recibir etiquetado**, escanear QR de la tarima fuente/asignación.
2. Rellenar producto, lote y caducidad como solo lectura; pedir cajas recibidas numéricas enteras no negativas.
3. Bloquear cantidad mayor al saldo de la asignación. Si es menor, calcular faltante y exigir uno de: `damaged_merchandise`, `poor_condition`, `damaged_during_labeling`.
4. Adjuntar evidencia cuando la política lo exija, confirmar retorno y actualizar el pendiente.
5. Crear una o varias tarimas de salida; permitir distribución/fusión únicamente dentro del mismo `trackingKey`. Cada QR de salida se genera y verifica como único.

### 4. Conciliar y cerrar

1. El tablero muestra por línea: estimado, asignado, retornado, bajas aprobadas, pendiente y diferencia.
2. Si todo cuadra, confirmar conciliación y publicar salidas como trabajadas/etiquetadas.
3. Si hay diferencia, crear/terminar expediente con motivo, cajas, evidencia, responsable que reporta y quien aprueba el cierre.
4. Cerrar como conciliado o con discrepancia. Mantener historial consultable y bloquear nuevas mutaciones.

## Validaciones y manejo de casos límite

| Caso | Comportamiento requerido |
|---|---|
| QR inexistente, ilegible o no fuente | No crear movimiento; mostrar error recuperable y permitir reescaneo/búsqueda autorizada. |
| QR duplicado | Rechazar si ya fue entregado por completo, está bloqueado por otra operación o si un QR de salida ya existe. Mostrar el estado actual sin revelar datos ajenos. |
| Retorno parcial | Permitido. Mantiene la asignación abierta y el saldo pendiente; no publica inventario trabajado para esas cajas hasta conciliación. |
| Retornos múltiples de una asignación | Permitidos hasta su saldo, cada uno idempotente y auditable. |
| Cajas extra | Bloqueadas: no se puede recibir más que la cantidad confirmada. Se maneja fuera de este lote mediante recepción/ajuste autorizado, nunca como retorno. |
| Daño antes de despacho | Se registra como diferencia de entrega/ajuste autorizado antes de asignar o no se asigna; no usar `damaged_during_labeling`. |
| Daño durante etiquetado | Se registra en el retorno con el motivo exacto y expediente de discrepancia. |
| Múltiples lotes/caducidades | Líneas, salidas y conciliación separados por `trackingKey`, aunque pertenezcan al mismo lote de etiquetado. |
| Cancelación | Antes de entrega: `cancelled`. Después: solo `cancelled_with_reversal` con eventos compensatorios, motivo y permiso elevado. |
| Sin conexión/reintento | Guardar intención local con clave idempotente; al reconectar, consultar estado del QR/lote antes de presentar éxito. No generar QR o movimientos duplicados en el cliente. |
| Conflicto simultáneo | El servidor rechaza versión/saldo obsoleto; la interfaz refresca y pide al operador revisar, sin repetir automáticamente. |
| Documento histórico incompleto | No inventar lote/caducidad. Marcar bloqueado para remediación controlada y registrar la decisión, sin modificar recepción. |

## Permisos y seguridad

| Rol propuesto | Puede | No puede |
|---|---|---|
| `labeling.operator` | Escanear, confirmar entrega/retorno, crear salida dentro de un lote autorizado | Aprobar discrepancias, cancelar con reverso, editar recepción |
| `labeling.supervisor` | Planear, reconciliar, aprobar discrepancias según umbral | Cambiar el libro mayor o reabrir un lote cerrado |
| `labeling.admin` | Resolver excepciones, autorizar cancelación con reverso, ejecutar proyecciones/reporte | Borrar historial o modificar recepción |
| `auditor` | Leer historial, proyecciones y evidencias autorizadas | Crear movimientos |

Las reglas Firestore deben denegar escrituras directas del cliente en `labelingLedger`, proyecciones e idempotencia; las mutaciones pasan por la API de servidor. Se valida pertenencia a almacén, alcance de rol, formato de QR, tamaño/tipo de evidencia y propiedad de `batchId`.

## Escenarios de aceptación

### AC-01 — Entrega conserva recepción
- **DADO** una tarima recibida con 100 cajas y QR válido
- **CUANDO** el operador confirma físicamente 98 cajas para etiquetado
- **ENTONCES** la recepción continúa mostrando 100 cajas
- **Y** la asignación conserva `sourceBoxes=100`, `confirmedBoxes=98`, actor y hora de servidor.

### AC-02 — No mezcla de lote o caducidad
- **DADO** dos tarimas del mismo producto con lotes o caducidades distintos
- **CUANDO** se planea o crea una salida
- **ENTONCES** el sistema exige líneas/asignaciones/salidas separadas por `trackingKey`
- **Y** no permite una salida fusionada que combine ambas claves.

### AC-03 — Retorno parcial con faltante documentado
- **DADO** una asignación confirmada de 98 cajas
- **CUANDO** se reciben 95 cajas
- **ENTONCES** se exige uno de los tres motivos de faltante y se registra `shortageBoxes=3`
- **Y** el lote no puede cerrarse hasta aprobar/documentar esa diferencia.

### AC-04 — Excedente bloqueado
- **DADO** una asignación con saldo retornable de 40 cajas
- **CUANDO** el usuario intenta registrar 41
- **ENTONCES** la API rechaza la operación sin crear evento ni modificar proyección.

### AC-05 — División y fusión conservan cantidad
- **DADO** 100 cajas retornadas de una misma `trackingKey`
- **CUANDO** se crean salidas de 40 y 60, o una salida desde dos retornos compatibles
- **ENTONCES** la suma de asignaciones de salida es exactamente 100
- **Y** cada relación de fuente a salida es consultable.

### AC-06 — Cierre seguro e idempotente
- **DADO** un lote sin pendientes y con salidas válidas
- **CUANDO** se reintenta `closeLabelingBatch` con la misma clave idempotente
- **ENTONCES** retorna el mismo cierre sin duplicar inventario trabajado ni eventos.

### AC-07 — Concurrencia
- **DADO** dos operadores intentan consumir el último saldo de una misma asignación
- **CUANDO** ambas solicitudes llegan simultáneamente
- **ENTONCES** una se confirma y la otra obtiene conflicto/saldo actualizado
- **Y** el libro mayor conserva una sola operación exitosa para esas cajas.

## Plan de pruebas

| Nivel | Cobertura mínima |
|---|---|
| Unidad | `trackingKey`, conservación, saldo, motivos obligatorios, máquina de estados, idempotencia, creación de QR de salida. |
| API/emulador Firestore | Transacciones concurrentes, reglas RBAC, rechazo de escrituras directas, atomicidad de evento/proyección/idempotencia. |
| Integración | Entrega→retorno parcial→discrepancia→cierre; división/fusión; cancelación con reverso; reconstrucción de proyección desde libro mayor. |
| E2E | Formularios, escaneo válido/inválido/duplicado, offline/reintento, mensajes de conflicto, listado Etiquetado y permisos. |
| Migración | Lecturas históricas intactas, feature flag desactivado no altera flujo actual, consulta de nuevo inventario no duplica stock. |
| Rendimiento/operación | Paginación de tablero, índices por almacén/estado/fecha, límites de transacción y alertas por proyección atrasada. |

## Despliegue, migración y reversión

### Despliegue gradual

- [ ] Confirmar instancia/edición Firestore, colecciones existentes, modelo real de QR y contratos de inventario.
- [ ] Crear reglas, índices, API y colecciones nuevas sin habilitar la interfaz.
- [ ] Agregar `featureFlags.labelingModule` desactivado por defecto y permitirlo a un almacén/rol piloto.
- [ ] Ejecutar pruebas con emulador, pruebas de concurrencia y validación operativa con datos no productivos.
- [ ] Habilitar alta/consulta; después entrega/retorno; finalmente cierre y proyección de trabajado.
- [ ] Comparar diariamente libro mayor vs. proyección y mantener tablero de discrepancias/errores de idempotencia.

### Migración y retrocarga

No se requiere ni se recomienda alterar recepciones históricas. Para existencias ya recibidas:

- Se habilitan solo si tienen QR, producto, lote, caducidad y cantidad fuente verificables.
- Si falta algún dato, permanecen fuera del flujo hasta una **remediación aditiva** aprobada que documente la fuente y el responsable.
- La retrocarga crea referencias/snapshots nuevos; nunca corrige el documento de recepción.

### Reversión

Desactivar el *feature flag* detiene nuevas altas y movimientos, pero preserva lectura y reconciliación de lotes abiertos para no dejar inventario en limbo. No se borran colecciones ni eventos. Si una versión debe retirarse, se corrige con una versión nueva de API y, cuando proceda, eventos compensatorios auditables; jamás con actualización destructiva del libro mayor.

## No objetivos

- Modificar, normalizar o eliminar documentos de recepción previos.
- Permitir excedentes de retorno sin un proceso de inventario independiente y autorizado.
- Mezclar producto/lote/caducidad para facilitar la captura.
- Considerar inventario trabajado antes de conciliar.
- Resolver diferencias sin actor, fecha, motivo y evidencia cuando aplique.
- Transformar el módulo en facturación, gestión de proveedores o control de transporte.

## Decisiones abiertas y trade-offs

| Decisión | Alternativas | Recomendación segura |
|---|---|---|
| Unidad de cantidad | Enteros de cajas vs. decimales | Usar enteros de cajas. Si el negocio necesita fracciones, definir unidad base y conversión explícita antes de implementar. |
| Corrección al entregar | Permitir cualquier diferencia vs. exigir razón | Permitir corrección confirmada; exigir nota para diferencia. El faltante formal se determina en retorno. |
| Evidencia de faltantes | Obligatoria siempre vs. por umbral/motivo | Definir política por motivo/umbral; exigirla siempre para `damaged_during_labeling` es la opción más auditable. |
| Fusión física | Mezclar claves vs. una clave por salida | Mantener una `trackingKey` por salida. Mezclar reduce trazabilidad y rompe FEFO/caducidad. |
| Aprobación de discrepancias | Supervisor único vs. doble aprobación | Supervisor por debajo de umbral; doble aprobación/admin para importes o cajas altos. |
| QR de salida | Reusar QR fuente vs. emitir nuevo | Emitir QR nuevo con relación a fuentes. Reusar confunde estado e idempotencia. |
| Off-line | Escribir directo al reconectar vs. cola de intenciones | Cola de intenciones idempotentes con confirmación del servidor; es más segura ante duplicados. |
| Proyección | Calcular en cada lectura vs. materializar | Materializar y reconciliar con ledger. Menor latencia, con trabajo adicional de monitorización. |

## Preguntas por resolver antes de implementación

- [ ] ¿Cuál es la instancia y edición exacta de Firestore, y qué documento/colección es la fuente canónica de una tarima recibida?
- [ ] ¿El QR actual codifica un ID opaco, una URL o datos serializados, y quién puede emitir/reimprimir QR de salida?
- [ ] ¿Existe un rol/umbral de aprobación ya aprobado para diferencias y cancelaciones?
- [ ] ¿La empresa etiquetadora y la persona receptora son texto libre, catálogo o entidades existentes?
- [ ] ¿Qué evidencia es obligatoria por cada motivo y cuánto tiempo debe retenerse?
- [ ] ¿Las tarimas pueden contener más de un producto en operación física? Si sí, deben modelarse como unidades lógicas separadas para conservar `trackingKey`.
- [ ] ¿Cómo se integra `worked/labeled` con los lectores actuales de `inventario`/`stock` sin duplicar disponibilidad?
- [ ] ¿Cuál es la política de operaciones offline y el plazo aceptable para sincronizarlas?
- [ ] ¿Qué reportes son obligatorios: rendimiento por empresa, mermas por motivo, antigüedad en etiquetado, trazabilidad por QR o caducidad?

## Checklist de aprobación de diseño

- [ ] No existe ninguna escritura a documentos de recepción desde Etiquetado.
- [ ] Cada cantidad está segmentada por producto, lote y caducidad.
- [ ] Todo movimiento tiene actor, hora de servidor, correlación e idempotencia.
- [ ] Las salidas muchos-a-muchos conservan cantidad y trazabilidad de fuente.
- [ ] `worked/labeled` se publica solo después de cierre válido.
- [ ] Las reglas impiden escrituras directas a ledger y proyecciones.
- [ ] Los lotes abiertos sobreviven a desactivar el *feature flag* y se pueden cerrar con seguridad.
- [ ] Las decisiones abiertas tienen responsable y fecha antes de iniciar desarrollo.
