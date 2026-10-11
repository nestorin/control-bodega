# Proposal: Firestore Migration

## Intent

Migrate all ephemeral React `useState` + hardcoded seed data to **Firestore with offline persistence**, enabling data to survive refreshes, sync across devices, and work offline. Current state is lost on every reload; no multi-user collaboration exists.

## Scope

### In Scope (6 domains)

| Domain | Current Location | Data Types |
|--------|------------------|------------|
| **Catálogos** | `Configuracion.tsx` (4 `_INIT` arrays) | Productos, Proveedores, Conversiones, Almacenes |
| **Recepciones** | `Recepciones.tsx` (`recepciones[]`) | OC folios, proveedor, producto, tarimas, estado, incidencias |
| **Evidencias** | `Evidencias.tsx` (`evidenciasData[]`) | Fotos, lote, caducidad, OC folio, estado |
| **Inventario** | `App.tsx` (`inventario` Record) | Por almacén: `Record<productoId, cajas>` |
| **Lotes/Caducidades** | `LotesCaducidades.tsx` (`DATA_INICIAL`) | Por bodega: `Record<mes, cajas>` |
| **Embarques** | `Embarques.tsx` (`EMBARQUES_INICIALES`) | Folio, cliente, productos, tarimas escaneadas, evidencia |

### Out of Scope
- Authentication/authorization redesign (use existing Firebase Auth)
- Real-time presence/cursors
- Analytics/events collection
- File storage for photos (keep base64 in docs for v1; migrate to Storage later)
- Cloud Functions triggers (optional future phase)

## Capabilities

### New Capabilities
- `firestore-schema`: Collection/document structure, indexes, composite queries
- `security-rules`: Per-domain access control (owner, role-based, read/write rules)
- `firestore-service`: Typed service layer (CRUD + listeners) replacing direct `useState`
- `react-firestore-hooks`: `useCollection`, `useDocument`, `useOfflineQueue` hooks
- `migration-script`: One-time seed from `_INIT` arrays → Firestore

### Modified Capabilities
- `catalogos`: State → Firestore listeners; Config screen becomes admin UI
- `recepciones`: Local array → real-time collection with offline queue
- `evidencias`: Same as recepciones
- `inventario`: Per-almacén subcollections with transactional updates
- `lotes-caducidades`: Per-bodega docs with month-map fields
- `embarques`: Multi-step doc with subcollections for tarimas/evidencia

## Approach

**Incremental with dual-write pattern** (recommended over big bang):

1. **Phase 1 — Foundation**: Enable Firestore SDK, offline persistence, define schema + security rules, create service layer + hooks
2. **Phase 2 — Catálogos (read-only first)**: Dual-write Configuracion screen; readers switch to hooks
3. **Phase 3 — Recepciones + Evidencias**: Migrate list/detail screens; dual-write mutations
4. **Phase 4 — Inventario**: Transactional per-almacén updates; conflict resolution (last-write-wins + server timestamp)
5. **Phase 5 — Lotes + Embarques**: Remaining domains; batch migrations
6. **Phase 6 — Cleanup**: Remove all `_INIT` arrays, `useState` in App.tsx, dual-write flag

**Why incremental?**
- App stays shippable every phase
- Can rollback single domain if issues arise
- Offline queue validates progressively
- Security rules evolve with real access patterns

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/firebase.ts` | Modified | Add `getFirestore`, `enableIndexedDbPersistence` |
| `src/services/firestore.ts` | New | Typed service layer (CRUD, transactions, batch) |
| `src/hooks/useFirestore.ts` | New | `useCollection`, `useDocument`, `useOfflineQueue` |
| `src/screens/Configuracion.tsx` | Modified | Dual-write → Firestore service |
| `src/screens/Recepciones.tsx` | Modified | Replace `recepciones[]` with hook |
| `src/screens/Evidencias.tsx` | Modified | Replace `evidenciasData[]` with hook |
| `src/screens/LotesCaducidades.tsx` | Modified | Replace `DATA_INICIAL` with hook |
| `src/screens/Embarques.tsx` | Modified | Replace `EMBARQUES_INICIALES` with hook |
| `src/App.tsx` | Modified | Remove `inventario` state; use service |
| `scripts/migrate-seed.ts` | New | One-time seed from `_INIT` arrays |
| `firestore.rules` | New | Security rules per domain |
| `firestore.indexes.json` | New | Composite indexes for queries |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cold start latency (first load) | High | Enable persistence; pre-fetch critical collections; show skeleton UI |
| Security rules complexity | High | Start restrictive; use emulator for testing; per-domain rule files |
| Offline conflict resolution | Medium | Server timestamps + last-write-wins; expose `pendingChanges` in UI |
| Data loss during migration | Low | Run migration script against emulator first; backup export |
| Index build failures | Medium | Declare indexes upfront; use `firebase firestore:indexes` |
| Bundle size increase | Low | Tree-shake Firebase SDK; lazy-load non-critical domains |

## Rollback Plan

1. Feature flag `USE_FIRESTORE` (env var) gates all hooks
2. Per-domain flag: `USE_FIRESTORE_CATALOGOS`, etc.
3. If issues: flip flag → app reverts to `useState` + `_INIT` arrays instantly
4. Firestore data remains intact; no destructive migration

## Dependencies

- `firebase` v10+ (already in `package.json`)
- `firebase/firestore` — enable in `firebase.ts`
- Firestore emulator for local dev (`firebase emulators:start`)
- No new runtime deps; dev-only: `firebase-tools` for indexes/rules deploy

## Success Criteria

- [ ] **Persistence**: Refresh browser → all data intact (catálogos, recepciones, evidencias, inventario, lotes, embarques)
- [ ] **Multi-device sync**: Open same account on 2 devices → changes appear <2s
- [ ] **Offline works**: Disconnect network → create/edit/receive → reconnect → syncs without loss
- [ ] **No regressions**: All existing flows (new recepción, captura tarima, embarque, config edits) work identically
- [ ] **Security**: Unauthenticated users cannot read/write; users only access own almacén data
- [ ] **Performance**: Initial load <3s on 4G; subsequent loads <500ms (cached)
- [ ] **Migration script**: Seeds all 6 domains from `_INIT` arrays idempotently

## Rollout Order

1. Catálogos (foundation for other domains)
2. Recepciones + Evidencias (core workflow)
3. Inventario (transactional, depends on catálogos)
4. Embarques (depends on inventario + catálogos)
5. Lotes/Caducidades (standalone reporting)