# Exploration: Product + Provider Packaging Model

Change: `packaging-product-provider` · Phase: explore · Branch: `restart-from-main` @ `08c9fb1`
Artifact language: English.

## Summary

**What**: Mapped the current packaging-ratio model end to end and designed the target model for
"boxes per pallet" as a **product + provider** relation. The recommendation is a **new additive
Firestore collection** (`organizations/{orgId}/product_packaging`) keyed by a deterministic composite
document id, holding both provider-scoped rows and explicitly-marked product-level fallback rows;
`src/services/palletPlan.ts` becomes the single allocation rule; the backend keeps shape validation
only and never reads the packaging catalog inside a transaction; the 11 production ratios are
migrated with an additive, dry-run-by-default, `ALLOW_*=1`-guarded script that never deletes data.

**Why**: The ratio is fixed per product today but may vary by supplier later, and the user decided to
model the relation as PRODUCT + PROVIDER now so the data never has to be migrated twice. The current
storage cannot express that: the ratio lives in `conversions`, one document per product, joined by
mutable free-text `productName`; there is no product↔supplier relation at all; the only link is
free-text `ProductDoc.supplierCodes`, which is already contaminated in production; and two divergent
pallet allocation rules coexist, one of which still invents a ratio of 10 boxes per pallet.

**Where**: `src/services/firestore/types.ts`, `src/services/firestore/domainServices.ts`,
`src/services/palletPlan.ts`, `src/context/CatalogosContext.tsx`, `src/App.tsx`,
`src/screens/Configuracion.tsx`, `src/screens/ProgramacionRecepcion.tsx`,
`src/screens/NuevaRecepcionStep1.tsx`, `src/screens/NuevaRecepcionStep2.tsx`,
`src/screens/ProgramacionRecepcion/CompleteStep.tsx`, `src/screens/EditarRecepcion.tsx`,
`src/domains/reception/receptionDomain.ts`, `src/services/domain/conversionCalculator.ts`,
`src/services/domain/validation.ts`, `src/services/conversiones.ts`, `src/types/domain.ts`,
`src/hooks/useCsvImport.ts`, `src/services/firestoreBatch.ts`,
`functions/receptions.py`, `functions/rbac.py`, `firestore.rules`, `firestore.indexes.json`,
`scripts/seed-conversions.ts`, `scripts/backfill-lot-timestamps.ts`,
`scripts/migrate-supplier-types.ts`, `data/catalog/tehuacan-1-inventory-2026-10-04.json`.

**Learned**:

- The 11 production ratios (90, 39, 60, 48, 48, 128, 60, 80, 64, 60, 40) are evidence-backed and
  match the Tehuacán-1 snapshot exactly; the seed script also wrote a `productId` field on every
  conversion document that **no application code reads** — it is a ready-made, trustworthy migration
  join key that the mapping had dismissed as noise.
- `ProductService.getBySku` and `ConversionService.getByProductName` have **zero callers**: the
  catalog is always loaded whole with `getAll`, and every ratio lookup is a client-side normalized
  **name** match.
- `firestore.rules` matches collections explicitly (21 `match` blocks, no catch-all), so a brand-new
  collection is **denied by default** until a rules block is added — this is a hard prerequisite, not
  an afterthought.
- `validateConversion` / `toPersistedConversion` are imported by `useReceptionProgramming.ts` but
  **never invoked**, and `ProgramacionRecepcionV2` (their only consumer) is not routed from `App.tsx`
  (`ProgramacionRecepcion` is) — the validators are dead code in production.
- `src/App.tsx` in the current **working tree** (dirty, parallel session) already delegates to
  `CatalogosProvider` / `useCatalogosContext`; the duplicate catalog loader still exists at HEAD
  (`src/App.tsx:487-542`). The "one loader" recommendation therefore collides with an in-flight
  refactor and must be coordinated, not duplicated.

---

## Q1 — Stable key

### 1.1 The identity mess (evidence)

| Side     | Candidate identifiers      | Reality in production                                                                                                                                                                                                                                                                                                    |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product  | Firestore doc id           | `BaseService.create` mints `crypto.randomUUID()` (`src/services/firestore/baseService.ts:152`), **but** the CSV import writes `docId: data.sku` (`src/hooks/useCsvImport.ts:143`) and `createProductBatchWrites` does the same (`src/services/firestoreBatch.ts:142-154`). Two identities for the same business product. |
| Product  | `sku`                      | Mutable: `handleUpdateProducto` writes `sku: normalized.sku` (`src/screens/Configuracion.tsx:2445`). Not unique-enforced.                                                                                                                                                                                                |
| Product  | `name`                     | Mutable free text; already the conversion join key (`src/services/firestore/types.ts:112`), i.e. the current fragility source.                                                                                                                                                                                           |
| Supplier | Firestore doc id           | Mixed `sup_*` ids and UUIDs; immutable; already the key the reception edit flow resolves against (`services.suppliers.getById(supplierId)`, `src/screens/EditarRecepcion.tsx:268`) and snapshots onto the reception (`code`/`name`, `:308-309`).                                                                         |
| Supplier | `code`                     | Real codes are `P-009..P-013`, `SUP-ADC, SUP-ADT, SUP-EFL, SUP-MBD, SUP-MON, SUP-SAM, SUP-SNF, SUP-SOR`; not editable in the UI (`handleUpdateProveedor` writes only name/tipo/contact/phone/email, `src/screens/Configuracion.tsx:2527-2535`), but not unique-enforced and already the contaminated field.              |
| Link     | `ProductDoc.supplierCodes` | Free text written from a comma-separated input (`src/screens/Configuracion.tsx:2427-2430, 2446`). Contaminated: `CB0301 → ["CB0401"]` (another **product** id), `CB0401 → ["CBD9384"]` (resolves to **nothing**).                                                                                                        |

### 1.2 Candidate shapes compared

| #       | Shape                                                                                                 | Verdict         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** | **New collection** `product_packaging`, composite doc id + explicit `productId` / `supplierId` fields | **RECOMMENDED** | Additive: no doc-id migration of live `conversions`; one row per `(product, provider)` **and** one explicitly-marked product-level fallback row in the same place; deterministic composite id gives idempotent upsert and single-`get` resolution; explicit fields make provider queries possible; readers can be switched collection-by-collection. Cost: a new `firestore.rules` block (required — see 1.4) and a migration script.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **(b)** | Reuse `conversions`, add `productId` + `supplierId`                                                   | Rejected        | A conversion document is currently _one per product_ (`conv_{productId}`) and every reader assumes that: `getAll` → `Conversion[]` mapping (`src/context/CatalogosContext.tsx:187-198`), `mergeCanonicalConversions` joins **by name** (`src/services/conversiones.ts:21-51`), `findCajasPorTarima` takes the **first** name match (`src/services/palletPlan.ts:117-130`). Adding a provider dimension means either (i) an array inside one document (rejected under (d)) or (ii) several documents per product — which silently breaks all three name-joined readers, because "first match wins" would pick an arbitrary provider. Supporting (ii) properly _requires_ the doc-id migration this option is supposed to avoid. It also forces the rewrite of every reader at once, in a single change, inside a 400-line review budget. |
| **(c)** | Subcollection under each product: `products/{productId}/packaging/{supplierId}`                       | Rejected        | The product reference becomes implicit (no `productId` field to index or query), and the provider dimension is buried inside a product aggregate: a cross-product query ("all products packed by supplier X") becomes a `collectionGroup` scan, and backend validation would need collection-group reads. `firestore.rules` has no nested `products/{id}/...` block, so rules must change anyway. It also makes the product-level fallback row awkward (sentinel supplier id) and couples the ratio to the lifecycle of the product document.                                                                                                                                                                                                                                                                                           |
| **(d)** | Array of packaging entries inside the product document                                                | Rejected        | No per-entry identity, so an entry cannot be referenced, audited, migrated or validated in isolation; no field-level rules (the rules have **no whitelist**, `firestore.rules:201-207`, so a supervisor could write arbitrary entries); unbounded array growth inside a 1 MiB document; concurrent edits by two users editing different providers cause lost updates; and "which product is packed by provider X" is not answerable without scanning every product document.                                                                                                                                                                                                                                                                                                                                                            |

### 1.3 Stable identifiers — the answer

- **Product side → `ProductDoc.id` (the Firestore document id).** It is the only immutable identifier
  and it is already the product identity the rest of the system treats as canonical:
  `ReceptionLineDoc.productId`, `PalletDoc.productId`, `plannedPallets[].productId`
  (`functions/receptions.py:102-107` enforces the pallet↔line product match), inventory movements
  (`functions/rbac.py:178-186`), and `functions/shipments.py` matches on `productId`. `sku` is
  mutable, `name` is mutable free text, and the CSV import misusing `sku` as a document id is an
  identity **bug to fix** (make CSV import resolve the existing product through the already-written but
  unused `ProductService.getBySku` and update it, instead of creating a second document keyed by SKU),
  not a reason to key the relation by SKU.
- **Supplier side → `SupplierDoc.id` (the Firestore document id).** Immutable, already the key used by
  the reception edit flow, and the only identifier with a live referential check. `code` is a display /
  business code that is not unique-enforced and is exactly where the contamination lives
  (`CB0401` is a _product_ id stored in a supplier-code field; `CBD9384` resolves to nothing).

### 1.4 The recommended shape

```
organizations/{orgId}/product_packaging/{packagingId}

packagingId = pack_{productId}__{supplierId}     // provider-scoped
packagingId = pack_{productId}__product          // product-level fallback

{
  organizationId,
  productId,                 // Firestore doc id of the product  (authoritative)
  productSku,                // snapshot, for display / legacy lookup
  productName,               // snapshot, for display only
  supplierId,                // Firestore doc id, or null for the product-level fallback
  supplierCode,              // snapshot of the supplier code, for display / audit
  scope: "provider" | "product",
  boxesPerPallet,            // measured; > 0
  piecesPerBox,              // optional; measured
  weightKgPerBox,            // optional
  fallbackReason?: "no_resolvable_supplier" | "multi_supplier_unresolved",
  source: "migration:conversions" | "ui" | "csv",
  sourceConversionId?,       // the legacy conversions doc id
  schemaVersion: 1,
  createdAt, updatedAt
}
```

Resolution order (the only one, used by every caller):
`pack_{productId}__{supplierId}` → `pack_{productId}__product` → **unknown** (ratio `undefined`).

### 1.5 A product with no resolvable supplier

It gets a **product-level fallback row** (`scope: "product"`, `supplierId: null`,
`fallbackReason: "no_resolvable_supplier"`) carrying the **measured** ratio — the real value from
production (39…128), never a substitute. This is not an invented ratio: it is a _recorded_ ratio with
an explicit scope label, and it is what keeps the 11 production ratios alive. It is also the forward
path: the day a provider-specific ratio is registered, the provider row wins automatically and the
product-level row can stay as the documented product default (no second migration). If no row exists
at all, the ratio is **unknown** and the allocation rule preserves the existing pallet count — the
hard invariant.

---

## Q2 — Referential integrity

### 2.1 Repairing `supplierCodes` without deleting production data

The field is **not** the repair target — the _authority_ is. The repair is additive:

1. **Add the canonical link**: `ProductDoc.supplierIds: string[]` — Firestore supplier **doc ids**.
   Written by the migration for every product, and by the product CRUD UI (replacing the
   comma-separated free-text input at `src/screens/Configuracion.tsx:2427-2430` with a multi-select
   over the supplier catalog, so the value is always referentially valid).
2. **Keep `supplierCodes` untouched** as the legacy raw text for audit/compatibility. It is never
   deleted, and it is never used as an authoritative reference again.
3. **Quarantine the contaminated values** instead of deleting them: unresolved codes are recorded in
   `ProductDoc.unresolvedSupplierCodes: string[]` (additive field) and in the migration report, so
   an operator can fix them manually with an audit trail.
4. **Prevent recurrence**:
   - The CSV import must resolve supplier codes → ids and report unresolved codes rather than writing
     raw text (`src/hooks/useCsvImport.ts:139-168`).
   - The packaging relation itself references supplier **doc ids**, so it can never point at a
     product id or at a non-existent supplier.

### 2.2 What the packaging relation references

`supplierId` = `SupplierDoc.id` (never `code`, never a name). `supplierCode` is stored only as a
denormalized snapshot for display, mirroring the reception pattern that already snapshots
`code`/`name` onto the reception (`src/screens/EditarRecepcion.tsx:308-309`). A supplier document that
is deleted leaves a dangling `supplierId`; the resolver must treat a dangling reference as
**unknown ratio → preserve the existing pallet count**, never as a fallback to a guessed supplier.

### 2.3 The two contaminated codes

| Value     | Where                  | Resolution                                                           | Action                                                                                                                                                                                                                                                          |
| --------- | ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CBD9384` | `CB0401.supplierCodes` | Resolves to **no supplier** (and to no product)                      | Never bound. Quarantined in `unresolvedSupplierCodes` + report. `CB0401` therefore gets a **product-level fallback** row with its measured ratio (60).                                                                                                          |
| `CB0401`  | `CB0301.supplierCodes` | Resolves to a **product** (`AGUA MINERAL 355 ML`), not to a supplier | Never bound to a supplier. The resolver must NOT resolve supplier codes against the products collection (that is how a product id became a supplier code). Quarantined + reported; `CB0301` gets a **product-level fallback** row with its measured ratio (90). |

Both outcomes are _safe_: the measured ratio survives as an explicitly-marked product-level row, and
no invented supplier is ever attached.

### 2.4 Keeping the two catalog loaders consistent

- **One loader owns the packaging catalog.** `CatalogosContext.loadCatalogos`
  (`src/context/CatalogosContext.tsx:120-228`) is the owner; it is the only place that reads
  `product_packaging` and maps it through one shared, pure mapper
  (`toPackagingEntries(docs) → PackagingEntry[]`).
- The duplicate loader at HEAD (`src/App.tsx:487-542`, identical `getAll` + map) is **deleted**, not
  kept in sync. Note: the current dirty working tree (parallel session) has already removed it and
  routes through `useCatalogosContext` — so the proposal must **coordinate with that branch** instead
  of re-doing it.
- Both call sites must consume the _same_ value. The resolution helper
  (`resolvePackagingRatio(productId, supplierId, entries)`) lives in one module next to
  `src/services/palletPlan.ts` and is used by every screen; no screen re-implements a name join.
- `src/services/conversiones.ts:mergeCanonicalConversions` (name-joined, remote-over-local) and
  `src/services/palletPlan.ts:findCajasPorTarima` (first name match) must be retired or rewritten to
  id-joined lookups; keeping them would preserve two divergent lookup rules.
- `ConversionService.getByProductName` and `ProductService.getBySku` currently have **zero callers**
  (verified by search across `src/`). `getBySku` becomes the CSV-import resolver; `getByProductName`
  becomes dead and is removed.

---

## Q3 — One allocation rule

### 3.1 Target

`src/services/palletPlan.ts` is the **only** allocation rule, extended with an explicit resolution
step and reused everywhere:

- known ratio → `max(1, ceil(quantity / ratio))`, chunks of `ratio`, remainder on the last pallet;
- unknown ratio → **preserve the existing pallet count** and spread the quantity across it
  (`palletCountForLine`, `src/services/palletPlan.ts:55-68`; `spreadQuantity`, `:71-76`);
- neither → 1 pallet. No ratio is ever invented.

The rule is the one already used by `EditarRecepcion` (`src/screens/EditarRecepcion.tsx:288-298`)
and covered by `src/test/services/palletPlan.test.ts:35-118` (known-ratio split, unknown-ratio
preservation, sequential numbering, invalid quantities).

### 3.2 Removing the divergent rule

`src/screens/ProgramacionRecepcion.tsx:750-765` defines a local `buildPalletPlan` that slices
`product.tarimas` chunks of `product.cajasPorTarima` and has **no unknown-ratio preservation** (a
product with `cajasPorTarima = 0` yields pallet quantities of `0`, which the backend rejects at
`functions/receptions.py:99-100`).

Concrete path:

1. Delete the local function; import `buildPalletPlan` from `@/services/palletPlan`.
2. Feed it `PalletPlanLine[]` with `cajasPorTarima: resolvePackagingRatio(productId, supplierId)`
   and `pallets: product.tarimas` (the operator-entered / preserved count).
3. `calcularTarimas(cajas, cajasPorTarima)` (`:612-614`) must not recompute when the ratio is unknown;
   the preserved `product.tarimas` wins.
4. Add a regression test asserting the `ProgramacionRecepcion` plan equals the shared rule's plan for
   the same lines (this comparison does not exist today — a named gap).

### 3.3 Every invented-ratio site and what it becomes

| #   | Site (current code)                                                                                                                  | Becomes                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/domains/reception/receptionDomain.ts:109` — `conversion?.cajasPorTarima ?? 10`                                                  | `conversion?.cajasPorTarima` (**undefined when absent**). `ReceptionConversion.cajasPorTarima` becomes optional (`cajasPorTarima?: number`, `src/types/domain.ts:81/106/128`) and `tarimas` is supplied by the caller from the preserved pallet count instead of `ceil(cajas / ratio)`.                                                                                                                                                                                          |
| 2   | `src/services/domain/conversionCalculator.ts:128` — `{ piezasPorCaja: 1, cajasPorTarima: 10 }`                                       | Return **`undefined`** for the ratio when the product is not in the catalog (and no invented `piezasPorCaja: 1`); callers must handle "unknown ratio" explicitly. `findConversionProps` returns `undefined` instead of a default object.                                                                                                                                                                                                                                         |
| 3   | `src/screens/NuevaRecepcionStep1.tsx:298-299` — `piezasPorCaja                                                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 24`, `cajasPorTarima |     | 10` | Use the conversion values **only when a conversion exists**. When it does not, mark the line "conversion missing" and let the operator enter the pallet count; **no** `24`/`10` substitution. |
| 4   | `src/screens/NuevaRecepcionStep2.tsx:170-171` — `piezasPorCaja                                                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 24`, `cajasPorTarima |     | 10` | Same as #3. Note `tarimasPara()` (`:151-159`) already returns `null` for a missing conversion — that behaviour becomes the standard for the whole screen instead of a special case.           |
| 5   | `src/screens/ProgramacionRecepcion.tsx:646-649` — `?.cajasPorTarima \|\| 10`                                                         | Resolve through the shared resolver. Unknown → `cajasPorTarima` undefined, `tarimas` preserved from the operator, and a visible "conversion missing" warning; the operator confirms the pallet count.                                                                                                                                                                                                                                                                            |
| 6   | `src/screens/ProgramacionRecepcion/CompleteStep.tsx:38` — `Math.ceil(p.cantidad / (p.cajasPorTarima \|\| 10))`                       | Use `p.tarimas` when present; never recompute from a default ratio.                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | `src/App.tsx:1329,1332` (HEAD) — `product.cajasPorTarima \|\| 1` and `Math.ceil(product.cantidad / (product.cajasPorTarima \|\| 1))` | Keep `product.tarimas` from the planning flow; when the ratio is unknown, do not recompute at all. (The `1` default is a second, different invention — it must go with the `10`.)                                                                                                                                                                                                                                                                                                |
| 8   | `src/test/end-to-end.integration.test.ts:152` — `p.cajasPorTarima \|\| 10`                                                           | Same as #6. The fixture at `:53` (`cajasPorTarima: 10`) must be replaced with a **measured** value (e.g. `90` for `CB0301`) or removed, so the suite stops re-encoding the invented 10.                                                                                                                                                                                                                                                                                          |
| 9   | `src/types/domain.ts:174-182` — `CATALOGO_CONVERSIONES_DEFAULT` (AJONJOLI 10, AZUCAR 50, CAFE 12, CHILE 15, FRIJOL/MAIZ/TRIGO 50)    | **Delete** the hardcoded catalog. It encodes ratios for products that are not in the production catalog and re-introduces `10`. `calculateConversions` (`src/domains/reception/receptionDomain.ts:99`) must take the catalog as a **required** argument; the re-export at `receptionDomain.ts:16,21,34` goes with it. Tests asserting `50 / 12 / 15` and the `10` default (`src/domains/reception/receptionDomain.test.ts:196-236`) are rewritten against the Firestore catalog. |
| 10  | `src/services/conversiones.ts:57-91` — `CONVERSIONES_DEFAULT` (global `caja → tarima` factor `0.1`, `pallet → caja` factor `10`)     | This is the _second_ encoding of "10 boxes per pallet" (as a unit-conversion factor). Replace the `caja → tarima` rule with the per-product/provider ratio lookup; `encontrarConversion` must not apply a global factor when a product ratio exists.                                                                                                                                                                                                                             |
| 11  | `src/services/domain/validation.ts:51,182` — `validateConversion` / `toPersistedConversion`                                          | Either wire them into the real persist path of the new packaging catalog, or delete them. Today they are **imported but never called** (`src/domains/reception/useReceptionProgramming.ts:40,42`) and their only consumer (`ProgramacionRecepcionV2`) is not routed from `App.tsx`. Leaving validators that validate a shape nobody persists is a trap.                                                                                                                          |
| 12  | `src/services/firestore/zodSchemas.ts:40-49` — `ConversionSchema` requires `cajasPorTarima >= 1`                                     | Keep the "ratio must be > 0" rule for a **packaging entry**, but a product with no ratio is represented by the **absence** of an entry, not by an invalid entry.                                                                                                                                                                                                                                                                                                                 |
| 13  | `src/validation/schemas.ts:45` — CSV conversion schema requires positive `cajasPorTarima`                                            | Keep, but the CSV conversion row must now carry `productId`/`sku` **and** `supplierId`/`supplierCode`; unresolved codes are rejected with a report, never written as raw text.                                                                                                                                                                                                                                                                                                   |

### 3.4 Test surface that must change

`src/test/services/palletPlan.test.ts` (keep, extend), `src/domains/reception/receptionDomain.test.ts`
(replace the default-10 expectation), `src/test/domain/validation.test.ts`
(`validateConversion`/`toPersistedConversion`), `src/test/end-to-end.integration.test.ts`
(fixture + `|| 10`), `src/test/tehuacanInventorySeed.test.ts` (keep — it already asserts "without
inventing palletization"), plus the new gaps: resolve a conversion by **product id / sku**, bind a
product to a **supplier**, resolve a **provider-specific** ratio, and compare the
`ProgramacionRecepcion` local rule against the shared one.

---

## Q4 — Backend validation

### 4.1 Current state (verified)

- `functions/receptions.py:83-132` `_normalize_planned_pallets` validates **shape only**: sequential
  `palletNumber` starting at 1, `lineIndex` in range, integer `quantity` in `1..100000`, pallet
  `productId`/`unit` equal to the referenced line, and the per-line sum of pallet quantities equal to
  the line quantity. It never reads a catalog.
- `create_reception` (`:311`) and the pallet registration path (`:590-700`) trust the client payload.
- The **only** backend read of `products` is the exact-name lookup in `import_inventory`
  (`functions/rbac.py:357-365`: 0 matches → `not-found`, >1 → `invalid-argument`). A search across
  `functions/` finds **no** read of `conversions` or `suppliers`.
- Limits already in force: `MAX_LINES = 500`, `MAX_TRANSACTION_WRITES = 500`,
  `MAX_PLANNED_PALLETS = 999` (`functions/receptions.py:44-47`), and
  `MAX_TRANSACTION_READS = 500` (`functions/rbac.py:23`).

### 4.2 Weighing it

**Cost of not validating**: the client is the sole source of truth; a malicious or buggy client can
send any split (e.g. one pallet of 1000 boxes instead of 12 pallets of 90). The blast radius is real:
the pallet count drives the printed QR labels and the stock movements.

**Cost of validating**:

- _Read budget_: the reception transaction already writes up to 500 documents and the planned-pallet
  array can hold 999 entries. Reading one packaging document **per line** inside the transaction would
  consume up to 500 of the 500 available transaction reads — zero headroom — and the planned pallets
  are validated for _every_ line before the transaction starts. `import_inventory` already has to
  defend the same ceiling explicitly (`_validate_inventory_import_read_count`,
  `functions/rbac.py:114-121`).
- _Latency_: a per-line catalog read inside a callable transaction adds a round trip per product to
  every reception save.
- _Operational risk of an incomplete catalog_: the catalog is incomplete **by construction** — 11
  products, no reliable supplier attribution, at least two ratios with no provable provider. If the
  backend rejected a reception because the ratio is missing or unknown, the warehouse would be blocked
  on a data-quality problem that the business already decided to solve by preserving the existing
  pallet count instead.

### 4.3 Recommendation

**Do not read the packaging catalog inside the reception write path.** Keep the backend's current
role: it validates the _shape and the arithmetic_ of the split (sum per line, sequential numbering,
line↔pallet product match, per-pallet bounds). The semantic question "is this chunking the right
chunking for this provider" stays on the client, where the catalog and the preserved pallet count
live.

**Safest partial version, if server-side enforcement is later required**:

1. Resolve the ratio **outside** the transaction with a single `get` on the deterministic composite id
   (`pack_{productId}__{supplierId}` then `pack_{productId}__product`), with a short timeout.
2. **Validate only when a ratio EXISTS.** If the entry exists, the payload's pallet quantities must be
   a valid chunking of that ratio → otherwise `invalid-argument`.
3. **Never reject because a ratio is MISSING.** Missing ratio ⇒ skip the check, accept the payload.
4. **Fail open on infrastructure errors** (read timeout, permission error) — never fail closed on an
   unavailable catalog; a failed read must not block a reception.
5. Read **one** document per distinct product, not per line, and only when the payload contains more
   than one pallet for that product.

### 4.4 What the backend should read to resolve a product

**The Firestore product document id (`productId`)** — the same key the backend already enforces
between pallets and lines (`functions/receptions.py:102-107`) and the key `functions/shipments.py`
matches on. It is immutable and already travels in the payload.

- **Not the name**: the existing exact-name lookup (`functions/rbac.py:359`) is ambiguous by
  construction (it must reject >1 match) and names are mutable free text.
- **Not the SKU**: it is a mutable business attribute and the CSV import duplicates it as a document
  id, so it can address two different documents.
- If a legacy payload only carries a name, resolve it to a **document id** as a compatibility shim
  (same 0-match / >1-match behaviour) and normalise to the document id before any packaging lookup.

---

## Q5 — Migration

### 5.1 Target state for the 11 production conversions

The 11 production `conversions` documents correspond 1:1 to the Tehuacán-1 snapshot
(`data/catalog/tehuacan-1-inventory-2026-10-04.json:112-123`; asserted by
`src/test/tehuacanInventorySeed.test.ts:21-27`), and the seed script wrote `productId` +
`productCode` on every conversion document (`scripts/seed-conversions.ts:98-117`) — a field the
application never reads, but a trustworthy join key. Target:

| Legacy doc     | Product (doc id = sku)                   | Measured ratio           | Target entry            | Scope                                                                                           |
| -------------- | ---------------------------------------- | ------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `conv_CB0301`  | `CB0301` BEBIDA SABOR COLA 235ML         | 90 boxes/pallet (24 pcs) | `pack_CB0301__product`  | product fallback (`no_resolvable_supplier` — its only supplier code, `CB0401`, is a product id) |
| `conv_CB0302`  | `CB0302` BEBIDA SABOR COLA 3L            | 39 (6 pcs)               | `pack_CB0302__product`  | product fallback (no supplier codes)                                                            |
| `conv_CB0401`  | `CB0401` AGUA MINERAL 355 ML             | 60 (24 pcs)              | `pack_CB0401__product`  | product fallback (`no_resolvable_supplier` — `CBD9384` resolves to nothing)                     |
| `conv_CL0101`  | `CL0101` LECHE EVAPORADA 360 GRS         | 48 (48 pcs)              | `pack_CL0101__product`  | product fallback (no supplier codes)                                                            |
| `conv_CL0201`  | `CL0201` LECHE CONDENSADA 375 GRS        | 48 (48 pcs)              | `pack_CL0201__product`  | product fallback (no supplier codes)                                                            |
| `conv_CL0301`  | `CL0301` CREMA DE MESA 225 GRS           | 128 (24 pcs)             | `pack_CL0301__product`  | product fallback (no supplier codes)                                                            |
| `conv_CM0001`  | `CM0001` MAYONESA 12 PZ                  | 60 (12 pcs)              | `pack_CM0001__product`  | product fallback (no supplier codes)                                                            |
| `conv_NDE0101` | `NDE0101` DETERGENTE LÍQUIDO ACE 8.5 LTS | 80 (1 pza)               | `pack_NDE0101__product` | product fallback (no supplier codes)                                                            |
| `conv_NDE0105` | `NDE0105` DETERGENTE LÍQUIDO ACE 4.85 L  | 64 (2 pcs)               | `pack_NDE0105__product` | product fallback (no supplier codes)                                                            |
| `conv_NDE0108` | `NDE0108` DETERGENTE LÍQUIDO ACE 2.8 L   | 60 (4 pcs)               | `pack_NDE0108__product` | product fallback (no supplier codes)                                                            |
| `conv_NSU0201` | `NSU0201` SUAVIZANTE SUAVITEL 8.5 LTS    | 40 (2 pcs)               | `pack_NSU0201__product` | product fallback (no supplier codes)                                                            |

Because no product currently carries a **resolvable** supplier code, **all 11 land as explicitly
marked product-level fallbacks**. If, during the migration, a product's codes resolve to exactly one
supplier, that product gets a provider-scoped row `pack_{productId}__{supplierId}` **and** keeps the
product-level row as the documented product default. The measured ratio is copied verbatim in every
case — the numbers 39…128 are evidence-backed ("transcribed from the supplied conversion table",
`data/catalog/tehuacan-1-inventory-2026-10-04.json:129`); no value is ever replaced by 10, and no row
is skipped.

**The legacy `conversions` documents are not deleted.** They are marked read-only with an additive
update (`supersededBy: "product_packaging/{id}"`, `deprecatedAt`, `schemaVersion`), keeping the
historical record and the original ratio in place.

### 5.2 Script contract (mirrors `scripts/backfill-lot-timestamps.ts` / `scripts/migrate-supplier-types.ts`)

`scripts/migrate-product-packaging.ts`, `firebase-admin`:

- **Dry-run by default**; `--apply` refuses to run unless `ALLOW_PACKAGING_MIGRATION=1`.
- Org from `FIREBASE_ORG_ID` or `--organization-id`, falling back to `ORGANIZATION_ID`.
- `pathToFileURL` direct-execution guard; `tsx` shebang; `firebase-admin` app init.
- **JSON report to stdout** (same shape as the existing scripts): `mode`, `organizationId`,
  `documentsScanned`, `documentsToWrite[]` (per legacy conversion: `sourceId`, `resolvedProductId`,
  `resolutionPath` (`productId` → `sku` → `name` → `unresolved`), `resolvedSupplierId`,
  `supplierResolution` (`resolved` | `unresolved` | `collides_with_product`),
  `targetDocId`, `scope`, `boxesPerPallet`, `piecesPerBox`, `action`), `skipped[]` with reasons,
  `writesPerformed`, `deletesPerformed: 0`, `nothingWritten`.
- **Idempotent**: deterministic target doc ids + `set()` with identical content ⇒ re-running writes
  nothing new; a doc whose content already matches is reported as `skipped: unchanged`.
- **No deletes**, no field removals, no product/supplier mutation other than the additive
  `supplierIds` / `unresolvedSupplierCodes` fields (guarded by the same `ALLOW_*`).
- Every write is a batch (≤ 11 entries, far below the 500-op limit).

### 5.3 Queries the migration needs

| Purpose            | Query                                                                                       | Index               |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------- |
| Read legacy ratios | `organizations/{org}/conversions` — bounded `get()`                                         | none (single field) |
| Resolve products   | `organizations/{org}/products` — bounded `get()`, build `id` / `sku` / normalised-name maps | none (single field) |
| Resolve suppliers  | `organizations/{org}/suppliers` — bounded `get()`, build `id` / normalised-`code` maps      | none (single field) |
| Write targets      | `organizations/{org}/product_packaging` — `set()` on deterministic doc ids                  | none                |
| Mark legacy docs   | `organizations/{org}/conversions/{id}` — additive `update()`                                | none                |

**No new composite index is required.** `firestore.indexes.json` currently declares **no** index for
`products`, `suppliers` or `conversions` (verified), and the runtime resolution is a **document-id
`get`** on the deterministic composite id — no query, no index. Even a future
`where("productId","==",id).where("supplierId","==",sid)` equality pair is served by Firestore's
single-field index merge; a composite index only becomes necessary if an `orderBy`/inequality on a
different field is added. The whole catalog can also be loaded with one `get()` (it is 11 rows).

### 5.4 Prerequisites before the migration can run

1. **`firestore.rules` must gain a `match /product_packaging/{packagingId}` block.** The rules file
   matches collections explicitly (21 `match` blocks, no catch-all), so an unmatched collection is
   **denied by default** — the app would read nothing until the block exists. Mirroring the
   `conversions` block: read = org member, create/update = supervisor|admin, delete = org admin.
2. The new `PackagingService` (`collectionPath: "organizations/{orgId}/product_packaging"`) and the
   shared mapper must ship **before** the migration is applied, so the catalog is readable the moment
   the rows exist.
3. The migration script itself uses `firebase-admin` and therefore bypasses the rules, but the
   application does not — hence step 1 is a hard ordering constraint, not a nicety.

---

## Recommendation

1. **Storage** — new additive collection `organizations/{orgId}/product_packaging`, composite doc id
   `pack_{productId}__{supplierId}` / `pack_{productId}__product`, explicit `productId` (doc id) and
   `supplierId` (doc id or `null`), snapshots of `productSku` / `productName` / `supplierCode`.
   `conversions` stays in place, marked read-only. Option (a) wins over (b)/(c)/(d) for the reasons
   in Q1.2.
2. **Identity** — product key = Firestore document id; supplier key = Firestore document id; the
   CSV import stops creating SKU-keyed product documents and resolves through the existing
   `ProductService.getBySku`.
3. **Integrity** — `ProductDoc.supplierIds` becomes the canonical link; `supplierCodes` is preserved
   untouched as legacy raw text; unresolved/colliding codes are quarantined in
   `unresolvedSupplierCodes` and reported; `CBD9384` and `CB0401` are never bound to a supplier.
4. **One loader** — `CatalogosContext` owns the packaging catalog through one shared mapper; the
   duplicate loader at HEAD `src/App.tsx:487-542` is removed (the in-flight working-tree refactor
   already does this — coordinate, do not duplicate).
5. **One allocation rule** — `src/services/palletPlan.ts` only; the divergent
   `ProgramacionRecepcion` rule is deleted; all 13 invented-ratio sites listed in Q3.3 are rewritten
   to "unknown ratio ⇒ preserve the existing pallet count"; the hardcoded
   `CATALOGO_CONVERSIONES_DEFAULT` and the global `CONVERSIONES_DEFAULT` factor table are deleted;
   the dead `validateConversion` / `toPersistedConversion` are wired in or deleted.
6. **Backend** — no packaging read inside the reception transaction; shape validation unchanged; if
   server-side enforcement is ever added, it is the fail-open "validate only when a ratio exists,
   never reject on a missing ratio" variant, resolving products by document id.
7. **Migration** — `scripts/migrate-product-packaging.ts`, dry-run by default, `ALLOW_PACKAGING_MIGRATION=1`
   to apply, JSON report, no deletes, idempotent; all 11 measured ratios land as explicitly marked
   product-level fallbacks (or provider rows where a supplier genuinely resolves).
8. **Delivery** — the change exceeds the 400-line review budget and must be split into chained PRs:
   (1) model + service + rules + migration script (no behaviour change), (2) single loader + single
   allocation rule + removal of the invented defaults, (3) UI (Configuracion packaging tab, product
   supplier multi-select, CSV import), (4) backend hardening (optional, fail-open). Each slice must
   keep the invariants: no invented ratio, unknown ⇒ preserve pallet count, dry-run-first migrations,
   no deletions.

---

## Open business questions

These are the questions a human must answer with business knowledge; they are **not** technical
choices and are deliberately left open:

1. **Is the product-level fallback row an active default or a seed awaiting confirmation?** All 11
   production ratios are _observed_ product-level values whose provider attribution is unproven
   (`supplierCodes` is contaminated). Recommended default: the product-level row stays **active** for
   every provider until a provider-specific row exists — this preserves today's behaviour exactly.
   The business must confirm that it accepts "one product's measured ratio applies to any provider
   until proven otherwise", or decide that a provider-specific confirmation is required first (which
   would stall allocations until the catalog is filled).
2. **What happens when a reception's merchandise supplier is not one of the product's registered
   suppliers?** Options: use the product-level fallback (recommended, keeps production running) or
   block the reception until the supplier is linked. This is a warehouse-policy decision.
3. **What is the correct supplier for the two contaminated products?** `CB0301` and `CB0401` carry
   supplier codes that resolve to a product id and to nothing respectively. Only the business knows
   the real suppliers; until then both stay as product-level fallbacks.
4. **Who may approve a provider-specific ratio?** `firestore.rules` currently lets a supervisor write
   conversions. A provider ratio directly drives pallet counts, printed QR labels and stock
   movements, so the business may want admin-only approval (or a second-person check) before a
   provider row overrides the product-level default.

---

## Evidence index

| Claim                                                     | Evidence                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ratio lives in `conversions`, joined by name              | `src/services/firestore/types.ts:110-116`; `src/services/palletPlan.ts:117-130`                                                                                                                                                                                                                                                              |
| No packaging field on products                            | `src/services/firestore/types.ts:87-97` (union of production fields: `name, sku, category, unit, organizationId, supplierCodes, updatedAt`)                                                                                                                                                                                                  |
| Only product↔supplier link is free text                   | `src/services/firestore/types.ts:100-108`; `src/screens/Configuracion.tsx:2427-2430, 2446`                                                                                                                                                                                                                                                   |
| Contamination                                             | `CB0301 → ["CB0401"]` (a product id), `CB0401 → ["CBD9384"]` (resolves to nothing)                                                                                                                                                                                                                                                           |
| `getBySku` / `getByProductName` have zero callers         | search over `src/**` — only the definitions at `src/services/firestore/domainServices.ts:147,165`                                                                                                                                                                                                                                            |
| Two catalog loaders                                       | `src/context/CatalogosContext.tsx:120-228` vs HEAD `src/App.tsx:487-542` (working tree already routes through `CatalogosProvider`)                                                                                                                                                                                                           |
| Shared rule is the good one                               | `src/services/palletPlan.ts:55-130`; tests `src/test/services/palletPlan.test.ts:35-118`                                                                                                                                                                                                                                                     |
| Divergent rule                                            | `src/screens/ProgramacionRecepcion.tsx:750-765`                                                                                                                                                                                                                                                                                              |
| Invented `10` sites                                       | `src/domains/reception/receptionDomain.ts:109`; `src/services/domain/conversionCalculator.ts:128`; `src/screens/NuevaRecepcionStep1.tsx:299`; `src/screens/NuevaRecepcionStep2.tsx:171`; `src/screens/ProgramacionRecepcion.tsx:649`; `src/screens/ProgramacionRecepcion/CompleteStep.tsx:38`; `src/test/end-to-end.integration.test.ts:152` |
| Invented `1` sites                                        | HEAD `src/App.tsx:1329,1332`                                                                                                                                                                                                                                                                                                                 |
| Hardcoded catalogs                                        | `src/types/domain.ts:174-182`; `src/services/conversiones.ts:57-91`                                                                                                                                                                                                                                                                          |
| Dead validators                                           | `src/services/domain/validation.ts:51,182`; imported at `src/domains/reception/useReceptionProgramming.ts:40,42`, never invoked; `ProgramacionRecepcionV2` not routed from `App.tsx`                                                                                                                                                         |
| Backend trusts the client                                 | `functions/receptions.py:83-132`, `:311`, `:590-700`; only catalog read in the backend is `functions/rbac.py:357-365`                                                                                                                                                                                                                        |
| Transaction limits                                        | `functions/receptions.py:44-47` (`MAX_LINES`, `MAX_TRANSACTION_WRITES`, `MAX_PLANNED_PALLETS`); `functions/rbac.py:23` (`MAX_TRANSACTION_READS`)                                                                                                                                                                                             |
| Rules have no whitelist; new collection denied by default | `firestore.rules:193-214`; 21 explicit `match` blocks, no catch-all                                                                                                                                                                                                                                                                          |
| No composite indexes for the catalogs                     | `firestore.indexes.json` — no `products` / `suppliers` / `conversions` index                                                                                                                                                                                                                                                                 |
| CSV import keys products by SKU                           | `src/hooks/useCsvImport.ts:139-168`; `src/services/firestoreBatch.ts:142-154`                                                                                                                                                                                                                                                                |
| Migration conventions                                     | `scripts/backfill-lot-timestamps.ts:65-154`; `scripts/migrate-supplier-types.ts:19-61`                                                                                                                                                                                                                                                       |
| Seed wrote `productId` on conversions                     | `scripts/seed-conversions.ts:98-117`                                                                                                                                                                                                                                                                                                         |
| The 11 measured ratios                                    | `data/catalog/tehuacan-1-inventory-2026-10-04.json:112-123`; `src/test/tehuacanInventorySeed.test.ts:21-27`                                                                                                                                                                                                                                  |
